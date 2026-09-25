// ─────────────────────────────────────────────────────────────
// 档案层：状态机 + 事件台账
// 所有状态变更必须经此引擎；每次动作写入不可变台账。
// 引擎为纯函数（时间由 action.at 注入），不接触 React / 存储。
// ─────────────────────────────────────────────────────────────

import type {
  ColorCard,
  DomainState,
  Dye,
  LedgerEvent,
  RecipeVersion,
  SampleSheet,
  Signature,
  WeighLine,
} from "../domain/types";
import {
  deriveStatus,
  dyeAvailable,
  evaluateBlock,
  plannedGram,
  round2,
  round3,
  sheetCost,
} from "../domain/calculations";

export class DomainError extends Error {}

export type Action =
  | {
      type: "CREATE_SHEET";
      orderId: string;
      recipeVersionId: string;
      colorCardId: string;
      fabricWeight: number;
      at: string;
    }
  | {
      type: "WEIGH_SIGN";
      sheetId: string;
      staffId: string;
      /** dyeId -> 实际称料 g */
      actual: Record<string, number>;
      at: string;
    }
  | { type: "REVIEW_PASS"; sheetId: string; staffId: string; at: string }
  | {
      type: "REVIEW_REJECT";
      sheetId: string;
      staffId: string;
      reason: string;
      at: string;
    }
  | { type: "ISSUE_DELIVERY"; sheetId: string; at: string }
  | { type: "CHANGE_BUDGET"; orderId: string; budget: number; at: string }
  | {
      type: "NEW_RECIPE_VERSION";
      recipeId: string;
      bathRatio: string;
      tempCurve: string;
      holdMinutes: number;
      lines: { dyeId: string; percent: number }[];
      note: string;
      at: string;
    }
  | {
      type: "REVISE_COLOR_CARD";
      colorCardId: string;
      swatch: string;
      name: string;
      at: string;
    }
  | { type: "RESTOCK_DYE"; dyeId: string; grams: number; at: string }
  | { type: "SET_DYE_PRICE"; dyeId: string; price: number; at: string };

// ── 工具 ──────────────────────────────────────────────────────

let uidCounter = 0;
const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(uidCounter++).toString(36)}`;

const todayCompact = (iso: string) => iso.slice(0, 10).replace(/-/g, "");

function addEvent(
  state: DomainState,
  e: Omit<LedgerEvent, "id">
): DomainState {
  const event: LedgerEvent = { ...e, id: state.seqEvent + 1 };
  return {
    ...state,
    seqEvent: state.seqEvent + 1,
    ledger: [...state.ledger, event],
  };
}

function findStaff(state: DomainState, staffId: string) {
  const staff = state.staff.find((s) => s.id === staffId);
  if (!staff) throw new DomainError("请选择有效人员");
  return staff;
}

function findSheet(state: DomainState, sheetId: string): SampleSheet {
  const sheet = state.sheets.find((s) => s.id === sheetId);
  if (!sheet) throw new DomainError("确认单不存在");
  return sheet;
}

const signatureOf = (staff: { id: string; name: string }, at: string): Signature => ({
  staffId: staff.id,
  staffName: staff.name,
  at,
});

/** 依据配方版本生成投料行（实际用量预填为计划用量，等待称料员核定） */
function buildWeighLines(
  recipe: RecipeVersion,
  fabricWeight: number,
  dyes: Dye[]
): WeighLine[] {
  return recipe.lines.map((line) => {
    const dye = dyes.find((d) => d.id === line.dyeId)!;
    const plan = plannedGram(line.percent, fabricWeight);
    return {
      dyeId: line.dyeId,
      plannedPercent: line.percent,
      plannedGram: plan,
      actualGram: plan,
      unitPrice: dye.pricePerGram,
    };
  });
}

const buildSnapshot = (
  recipe: RecipeVersion,
  card: ColorCard,
  budget: number
) => ({
  recipeVersion: recipe.version,
  recipe,
  colorCardRevision: card.revision,
  colorCard: card,
  budget,
});

/** 用当前主数据重新评估全部在途确认单（补料后解除待处理） */
function reevaluateAll(state: DomainState): DomainState {
  const sheets = state.sheets.map((sheet) => {
    if (sheet.status === "ISSUED" || sheet.status === "VOID") return sheet;
    const order = state.orders.find((o) => o.id === sheet.orderId)!;
    const block = evaluateBlock(sheet, state.dyes, state.sheets, order.budget);
    const status = deriveStatus(sheet, block);
    return { ...sheet, block, status };
  });
  return { ...state, sheets };
}

// ── 失效留档 + 新版本承接 ─────────────────────────────────────

/**
 * 将命中条件的在途确认单失效留档，并按新绑定生成承接确认单。
 * 已出单 / 已失效的单子不动（出单记录不可变）。
 * 新版本实体（newRecipe / newColorCard）随本次操作一同入表，
 * 旧单快照在替换前已固化，故承接单直接绑定新实体。
 */
function voidAndSucceed(
  state: DomainState,
  opts: {
    match: (sheet: SampleSheet) => boolean;
    reason: (sheet: SampleSheet) => string;
    newRecipe?: RecipeVersion;
    newColorCard?: ColorCard;
    newBudget?: number;
    at: string;
  }
): DomainState {
  const { match, reason, newRecipe, newColorCard, newBudget, at } = opts;

  // 新实体先入表，承接单即可正常查表
  let next: DomainState = {
    ...state,
    recipes: newRecipe ? [...state.recipes, newRecipe] : state.recipes,
    colorCards: newColorCard
      ? state.colorCards.map((c) => (c.id === newColorCard.id ? newColorCard : c))
      : state.colorCards,
  };

  const targets = next.sheets.filter(
    (s) => s.status !== "ISSUED" && s.status !== "VOID" && match(s)
  );
  if (targets.length === 0) return next === state ? state : next;

  const voidMap = new Map<string, SampleSheet>();
  const successors: SampleSheet[] = [];
  const events: Omit<LedgerEvent, "id">[] = [];

  for (const old of targets) {
    const recipeVersionId = newRecipe ? newRecipe.id : old.recipeVersionId;
    const colorCardId = newColorCard ? newColorCard.id : old.colorCardId;
    const recipe = next.recipes.find((x) => x.id === recipeVersionId)!;
    const card = next.colorCards.find((x) => x.id === colorCardId)!;
    const order = next.orders.find((x) => x.id === old.orderId)!;
    const budget = newBudget ?? order.budget;

    next = { ...next, seqSample: next.seqSample + 1 };
    const successor: SampleSheet = {
      id: uid("SH"),
      sampleCode: `S-${next.seqSample}`,
      orderId: old.orderId,
      recipeVersionId,
      colorCardId,
      fabricWeight: old.fabricWeight,
      status: "WEIGH",
      lines: buildWeighLines(recipe, old.fabricWeight, next.dyes),
      weighSignature: null,
      reviewSignature: null,
      block: null,
      deliveryNo: null,
      issuedAt: null,
      snapshot: buildSnapshot(recipe, card, budget),
      voidedAt: null,
      voidReason: null,
      successorId: null,
      createdAt: at,
    };

    const voidedSheet: SampleSheet = {
      ...old,
      status: "VOID",
      voidedAt: at,
      voidReason: reason(old),
      successorId: successor.id,
    };
    voidMap.set(old.id, voidedSheet);
    successors.push(successor);

    events.push({
      at,
      type: "SHEET_VOIDED",
      sheetId: old.id,
      sampleCode: old.sampleCode,
      detail: voidedSheet.voidReason!,
    });
    events.push({
      at,
      type: "SHEET_CREATED",
      sheetId: successor.id,
      sampleCode: successor.sampleCode,
      detail: `${old.sampleCode} 的承接确认单（新版本重新称料），订单 ${order.id}`,
    });
  }

  next = {
    ...next,
    sheets: [
      ...next.sheets.map((s) => voidMap.get(s.id) ?? s),
      ...successors,
    ],
  };
  for (const e of events) next = addEvent(next, e);
  return next;
}

// ── 动作实现 ──────────────────────────────────────────────────

function createSheet(state: DomainState, a: Extract<Action, { type: "CREATE_SHEET" }>) {
  const order = state.orders.find((o) => o.id === a.orderId);
  if (!order) throw new DomainError("请选择订单");
  const recipe = state.recipes.find((r) => r.id === a.recipeVersionId);
  if (!recipe) throw new DomainError("请选择配方版本");
  const card = state.colorCards.find((c) => c.id === a.colorCardId);
  if (!card) throw new DomainError("请选择色卡");
  if (!(a.fabricWeight > 0)) throw new DomainError("布样重量需大于 0");

  let next = { ...state, seqSample: state.seqSample + 1 };
  const sheet: SampleSheet = {
    id: uid("SH"),
    sampleCode: `S-${next.seqSample}`,
    orderId: order.id,
    recipeVersionId: recipe.id,
    colorCardId: card.id,
    fabricWeight: a.fabricWeight,
    status: "WEIGH",
    lines: buildWeighLines(recipe, a.fabricWeight, state.dyes),
    weighSignature: null,
    reviewSignature: null,
    block: null,
    deliveryNo: null,
    issuedAt: null,
    snapshot: buildSnapshot(recipe, card, order.budget),
    voidedAt: null,
    voidReason: null,
    successorId: null,
    createdAt: a.at,
  };
  next = { ...next, sheets: [...next.sheets, sheet] };
  next = addEvent(next, {
    at: a.at,
    type: "SHEET_CREATED",
    sheetId: sheet.id,
    sampleCode: sheet.sampleCode,
    detail: `新建小样：订单 ${order.id} · ${recipe.recipeName} v${recipe.version} · 色卡 ${card.code} · 布样 ${a.fabricWeight}g`,
  });
  return next;
}

function weighSign(state: DomainState, a: Extract<Action, { type: "WEIGH_SIGN" }>) {
  const sheet = findSheet(state, a.sheetId);
  if (sheet.status !== "WEIGH")
    throw new DomainError("当前状态不能称料签名（请先确认单据在待称料）");
  const staff = findStaff(state, a.staffId);

  const lines = sheet.lines.map((line) => {
    const grams = a.actual[line.dyeId];
    if (grams === undefined || !(grams >= 0))
      throw new DomainError("请填写全部染料的实际称料量");
    return { ...line, actualGram: round3(grams) };
  });

  let next: DomainState = {
    ...state,
    sheets: state.sheets.map((s) =>
      s.id === sheet.id
        ? {
            ...s,
            lines,
            weighSignature: signatureOf(staff, a.at),
            reviewSignature: null,
          }
        : s
    ),
  };

  const updated = next.sheets.find((s) => s.id === sheet.id)!;
  const order = next.orders.find((o) => o.id === sheet.orderId)!;
  const block = evaluateBlock(updated, next.dyes, next.sheets, order.budget);
  const status = deriveStatus({ ...updated, block }, block);

  next = {
    ...next,
    sheets: next.sheets.map((s) =>
      s.id === sheet.id ? { ...s, block, status } : s
    ),
  };
  next = addEvent(next, {
    at: a.at,
    type: "WEIGH_SIGNED",
    sheetId: sheet.id,
    sampleCode: sheet.sampleCode,
    detail: `称料完成并签名，投料成本 ¥${sheetCost(updated).toFixed(3)}`,
    staffName: staff.name,
  });
  return next;
}

function reviewPass(
  state: DomainState,
  a: Extract<Action, { type: "REVIEW_PASS" }>
) {
  const sheet = findSheet(state, a.sheetId);
  if (!sheet.weighSignature)
    throw new DomainError("称料尚未签名，不能复核");
  if (sheet.status !== "REVIEW" && sheet.status !== "BLOCKED")
    throw new DomainError("当前状态不允许复核操作");
  const staff = findStaff(state, a.staffId);
  if (staff.id === sheet.weighSignature.staffId)
    throw new DomainError("称料与复核不能为同一人，请换一位复核员签名");

  // 出单前复核余量与预算（以最新库存/预算为准）
  const order = state.orders.find((o) => o.id === sheet.orderId)!;
  const block = evaluateBlock(sheet, state.dyes, state.sheets, order.budget);
  if (block.shortDyes.length > 0 || block.overBudget) {
    let next: DomainState = {
      ...state,
      sheets: state.sheets.map((s) =>
        s.id === sheet.id
          ? { ...s, reviewSignature: signatureOf(staff, a.at), block, status: "BLOCKED" }
          : s
      ),
    };
    next = addEvent(next, {
      at: a.at,
      type: "REVIEW_PASSED",
      sheetId: sheet.id,
      sampleCode: sheet.sampleCode,
      detail: `复核签名完成，但存在阻断：${describeBlock(block)}，停在待处理`,
      staffName: staff.name,
    });
    return next;
  }

  let next: DomainState = {
    ...state,
    sheets: state.sheets.map((s) =>
      s.id === sheet.id
        ? { ...s, reviewSignature: signatureOf(staff, a.at), block, status: "READY" }
        : s
    ),
  };
  next = addEvent(next, {
    at: a.at,
    type: "REVIEW_PASSED",
    sheetId: sheet.id,
    sampleCode: sheet.sampleCode,
    detail: "复核通过，双人签名齐全，可出送样单",
    staffName: staff.name,
  });
  return next;
}

function reviewReject(
  state: DomainState,
  a: Extract<Action, { type: "REVIEW_REJECT" }>
) {
  const sheet = findSheet(state, a.sheetId);
  if (!sheet.weighSignature)
    throw new DomainError("称料尚未签名，不能复核");
  if (sheet.status === "ISSUED" || sheet.status === "VOID")
    throw new DomainError("已终结的确认单不能退回");
  const staff = findStaff(state, a.staffId);
  if (staff.id === sheet.weighSignature.staffId)
    throw new DomainError("称料与复核不能为同一人");

  let next: DomainState = {
    ...state,
    sheets: state.sheets.map((s) =>
      s.id === sheet.id
        ? {
            ...s,
            reviewSignature: null,
            weighSignature: null,
            block: null,
            status: "WEIGH",
          }
        : s
    ),
  };
  next = addEvent(next, {
    at: a.at,
    type: "REVIEW_REJECTED",
    sheetId: sheet.id,
    sampleCode: sheet.sampleCode,
    detail: `复核退回重新称料：${a.reason || "投料数据需核对"}`,
    staffName: staff.name,
  });
  return next;
}

export function describeBlock(block: SampleSheet["block"]): string {
  if (!block) return "无";
  const parts: string[] = [];
  if (block.shortDyes.length)
    parts.push(
      `余量不足(${block.shortDyes
        .map((d) => `${d.dyeName}需${d.need}g/可用${d.available}g`)
        .join("，")})`
    );
  if (block.overBudget)
    parts.push(
      `超预算(已出¥${block.overBudget.orderSpent.toFixed(2)}+本单¥${block.overBudget.sheetCost.toFixed(
        3
      )}/预算¥${block.overBudget.budget.toFixed(2)})`
    );
  return parts.join("；");
}

function issueDelivery(
  state: DomainState,
  a: Extract<Action, { type: "ISSUE_DELIVERY" }>
) {
  const sheet = findSheet(state, a.sheetId);
  if (sheet.status !== "READY")
    throw new DomainError("只有「可出单」状态能出送样单");
  if (!sheet.weighSignature || !sheet.reviewSignature)
    throw new DomainError("双人签名不齐全，不能出单");

  // 出单闸门：余量不足或超预算一律拦下
  const order = state.orders.find((o) => o.id === sheet.orderId)!;
  const block = evaluateBlock(sheet, state.dyes, state.sheets, order.budget);
  if (block.shortDyes.length > 0 || block.overBudget) {
    return {
      ...state,
      sheets: state.sheets.map((s) =>
        s.id === sheet.id ? { ...s, block, status: "BLOCKED" as const } : s
      ),
    };
  }

  // 实际投料扣减染料库存
  const dyes = state.dyes.map((dye) => {
    const used = sheet.lines
      .filter((l) => l.dyeId === dye.id)
      .reduce((g, l) => g + l.actualGram, 0);
    return used ? { ...dye, stock: round3(dye.stock - used) } : dye;
  });

  let nextSeq = state.seqDelivery + 1;
  const deliveryNo = `SD-${todayCompact(a.at)}-${String(nextSeq).padStart(3, "0")}`;

  let next: DomainState = {
    ...state,
    seqDelivery: nextSeq,
    dyes,
    sheets: state.sheets.map((s) =>
      s.id === sheet.id
        ? { ...s, status: "ISSUED" as const, deliveryNo, issuedAt: a.at, block: null }
        : s
    ),
  };
  // 库存扣减后重算其他在途单（可能因此转为待处理）
  next = reevaluateAll(next);
  next = addEvent(next, {
    at: a.at,
    type: "DELIVERY_ISSUED",
    sheetId: sheet.id,
    sampleCode: sheet.sampleCode,
    detail: `送样单 ${deliveryNo} 已生成，实际投料成本 ¥${sheetCost(sheet).toFixed(
      3
    )}，染料已扣库`,
  });
  return next;
}

function changeBudget(
  state: DomainState,
  a: Extract<Action, { type: "CHANGE_BUDGET" }>
) {
  const order = state.orders.find((o) => o.id === a.orderId);
  if (!order) throw new DomainError("订单不存在");
  if (!(a.budget > 0)) throw new DomainError("预算需大于 0");
  const old = order.budget;
  if (round2(old) === round2(a.budget))
    throw new DomainError("新预算与当前预算相同");

  // 先失效留档（旧单快照保留旧预算），再改预算
  let next = voidAndSucceed(state, {
    match: (s) => s.orderId === a.orderId,
    reason: () =>
      `订单 ${order.id} 预算调整 ¥${old.toFixed(2)} → ¥${a.budget.toFixed(
        2
      )}，旧确认单失效，按新预算重新核对`,
    newBudget: a.budget,
    at: a.at,
  });
  next = {
    ...next,
    orders: next.orders.map((o) => (o.id === order.id ? { ...o, budget: a.budget } : o)),
  };
  return next;
}

function newRecipeVersion(
  state: DomainState,
  a: Extract<Action, { type: "NEW_RECIPE_VERSION" }>
) {
  const prev = state.recipes
    .filter((r) => r.recipeId === a.recipeId)
    .sort((x, y) => y.version - x.version)[0];
  if (!prev) throw new DomainError("配方不存在");
  if (a.lines.length === 0) throw new DomainError("配方至少保留一种染料");

  const recipe: RecipeVersion = {
    id: uid("RV"),
    recipeId: a.recipeId,
    recipeName: prev.recipeName,
    version: prev.version + 1,
    bathRatio: a.bathRatio,
    tempCurve: a.tempCurve,
    holdMinutes: a.holdMinutes,
    lines: a.lines,
    createdAt: a.at,
    note: a.note,
  };

  // 新版本入表的同时，旧版本确认单失效留档、生成 v(n+1) 承接单
  return voidAndSucceed(state, {
    match: (s) =>
      state.recipes.find((r) => r.id === s.recipeVersionId)?.recipeId ===
      a.recipeId,
    reason: () =>
      `配方「${prev.recipeName}」发布 v${recipe.version}，旧确认单失效留档，按新版本重新称料`,
    newRecipe: recipe,
    at: a.at,
  });
}

function reviseColorCard(
  state: DomainState,
  a: Extract<Action, { type: "REVISE_COLOR_CARD" }>
) {
  const card = state.colorCards.find((c) => c.id === a.colorCardId);
  if (!card) throw new DomainError("色卡不存在");
  const revised: ColorCard = {
    ...card,
    name: a.name,
    swatch: a.swatch,
    revision: card.revision + 1,
    revisedAt: a.at,
  };

  // 新修订入表的同时，旧色卡确认单失效留档、生成承接单
  return voidAndSucceed(state, {
    match: (s) => s.colorCardId === a.colorCardId,
    reason: () =>
      `色卡 ${card.code} 修订至第 ${revised.revision} 版，旧确认单失效留档，按新色卡重新称料`,
    newColorCard: revised,
    at: a.at,
  });
}

function restockDye(state: DomainState, a: Extract<Action, { type: "RESTOCK_DYE" }>) {
  if (!(a.grams > 0)) throw new DomainError("补料数量需大于 0");
  const next: DomainState = {
    ...state,
    dyes: state.dyes.map((d) =>
      d.id === a.dyeId ? { ...d, stock: round3(d.stock + a.grams) } : d
    ),
  };
  // 余量恢复后解除相应待处理
  return reevaluateAll(next);
}

function setDyePrice(
  state: DomainState,
  a: Extract<Action, { type: "SET_DYE_PRICE" }>
) {
  if (!(a.price > 0)) throw new DomainError("单价需大于 0");
  // 只影响此后称料的单价快照，不动已签名/已出单成本
  return {
    ...state,
    dyes: state.dyes.map((d) =>
      d.id === a.dyeId ? { ...d, pricePerGram: a.price } : d
    ),
  };
}

/** 状态机入口 */
export function step(state: DomainState, action: Action): DomainState {
  switch (action.type) {
    case "CREATE_SHEET":
      return createSheet(state, action);
    case "WEIGH_SIGN":
      return weighSign(state, action);
    case "REVIEW_PASS":
      return reviewPass(state, action);
    case "REVIEW_REJECT":
      return reviewReject(state, action);
    case "ISSUE_DELIVERY":
      return issueDelivery(state, action);
    case "CHANGE_BUDGET":
      return changeBudget(state, action);
    case "NEW_RECIPE_VERSION":
      return newRecipeVersion(state, action);
    case "REVISE_COLOR_CARD":
      return reviseColorCard(state, action);
    case "RESTOCK_DYE":
      return restockDye(state, action);
    case "SET_DYE_PRICE":
      return setDyePrice(state, action);
  }
}

/** 受主数据变更影响的在途确认单数量（页面二次确认用） */
export function impactCount(
  state: DomainState,
  kind: "recipe" | "colorCard" | "budget",
  id: string
): number {
  return state.sheets.filter((s) => {
    if (s.status === "ISSUED" || s.status === "VOID") return false;
    if (kind === "budget") return s.orderId === id;
    if (kind === "colorCard") return s.colorCardId === id;
    return (
      state.recipes.find((r) => r.id === s.recipeVersionId)?.recipeId === id
    );
  }).length;
}

export { dyeAvailable, sheetCost };
