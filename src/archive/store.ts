// 档案层 · 送样确认台状态机：双签、阻断挂起、出样扣减、升版失效留档（纯 reducer）

import { blockReasonsFor, calcCost } from "../calc/cost";
import type {
  AuditEntry,
  Confirmation,
  InvalidateReason,
  LabValue,
  Recipe,
  RecipeItem,
  Sample,
} from "../calc/types";
import { seedState, type ArchiveState } from "./seed";

export class ArchiveError extends Error {}

export type ArchiveAction =
  | { type: "weigh"; confirmationId: string; actor: string }
  | { type: "review"; confirmationId: string; actor: string; note: string }
  | { type: "recheck"; confirmationId: string; actor: string }
  | { type: "issue"; confirmationId: string; actor: string }
  | {
      type: "bumpRecipe";
      recipeId: string;
      actor: string;
      note: string;
      items: RecipeItem[];
    }
  | {
      type: "bumpCard";
      cardId: string;
      actor: string;
      target: LabValue;
    }
  | {
      type: "adjustBudget";
      orderId: string;
      actor: string;
      budget: number;
    }
  | { type: "restock"; dyeId: string; actor: string; amount: number }
  | {
      type: "createSample";
      code: string;
      orderId: string;
      recipeId: string;
      cardId: string;
      fabricWeight: number;
      actor: string;
    };

const now = () => new Date().toISOString();

function pushAudit(state: ArchiveState, actor: string, action: string) {
  const entry: AuditEntry = { at: now(), actor, action };
  state.audit.unshift(entry);
}

function latestVersionOf(recipe: Recipe) {
  return recipe.versions.reduce((m, v) => Math.max(m, v.version), 0);
}

function buildConfirmation(sample: Sample, state: ArchiveState, createdAt: string) {
  const recipe = state.recipes.find((r) => r.id === sample.recipeId);
  const card = state.cards.find((c) => c.id === sample.cardId);
  const order = state.orders.find((o) => o.id === sample.orderId);
  if (!recipe || !card || !order) {
    throw new ArchiveError("小样绑定的订单 / 配方 / 色卡缺失");
  }
  const version =
    recipe.versions.find((v) => v.version === sample.recipeVersion) ??
    recipe.versions[recipe.versions.length - 1];
  const seq = state.confirmations.filter((c) => c.sampleId === sample.id).length + 1;
  const conf: Confirmation = {
    id: `CF-${sample.id}-${seq}`,
    sampleId: sample.id,
    seq,
    status: "待称料",
    recipeVersion: version.version,
    recipeNote: version.note,
    recipeSnapshot: version.items.map((it) => ({ ...it })),
    cardVersion: card.version,
    cardTarget: { ...card.target },
    fabricWeight: sample.fabricWeight,
    budgetSnapshot: order.budget,
    createdAt,
  };
  state.confirmations.push(conf);
  return conf;
}

/** 活动确认单 → 失效留档，并按小样当前绑定的新版本重新生成确认单 */
function invalidateAndRebuild(
  state: ArchiveState,
  sampleId: string,
  reason: InvalidateReason,
) {
  const sample = state.samples.find((s) => s.id === sampleId);
  if (!sample) return;
  for (const conf of state.confirmations) {
    if (conf.sampleId !== sampleId) continue;
    if (conf.status === "已出样" || conf.status === "已失效") continue;
    conf.status = "已失效";
    conf.invalidReason = reason;
    conf.invalidatedAt = now();
  }
  // 让小样指向最新版本，再按新版本称料出结果
  const recipe = state.recipes.find((r) => r.id === sample.recipeId);
  const card = state.cards.find((c) => c.id === sample.cardId);
  if (recipe) sample.recipeVersion = latestVersionOf(recipe);
  if (card) sample.cardVersion = card.version;
  buildConfirmation(sample, state, now());
}

function evaluateConf(state: ArchiveState, conf: Confirmation) {
  const sample = state.samples.find((s) => s.id === conf.sampleId);
  const recipe = state.recipes.find((r) => r.id === sample?.recipeId);
  const order = state.orders.find((o) => o.id === sample?.orderId);
  if (!sample || !recipe || !order) throw new ArchiveError("绑定数据缺失");
  const version =
    recipe.versions.find((v) => v.version === conf.recipeVersion) ??
    recipe.versions[recipe.versions.length - 1];
  return calcCost({
    sample: { fabricWeight: conf.fabricWeight, orderId: order.id },
    recipe: version,
    order,
    dyes: state.dyes,
  });
}

function weigh(state: ArchiveState, conf: Confirmation, actor: string) {
  if (conf.status !== "待称料" && conf.status !== "待处理") {
    throw new ArchiveError("只有「待称料 / 待处理」的确认单可以称料确认");
  }
  const cost = evaluateConf(state, conf);
  const reasons = blockReasonsFor(cost);
  conf.weigher = actor;
  conf.weighedAt = now();
  conf.weighedCost = cost.total;
  if (reasons.length > 0) {
    conf.status = "待处理";
    conf.blockReasons = reasons;
    pushAudit(state, actor, `称料 ${conf.sampleId}（${conf.id}）被阻断：${reasons.join("；")}，停在待处理`);
  } else {
    conf.status = "待复核";
    delete conf.blockReasons;
    pushAudit(state, actor, `称料确认 ${conf.sampleId}（${conf.id}），染料成本 ¥${cost.total}`);
  }
}

export function archiveReducer(
  prev: ArchiveState,
  action: ArchiveAction,
): ArchiveState {
  const state: ArchiveState = structuredClone(prev);

  switch (action.type) {
    case "weigh": {
      const conf = state.confirmations.find((c) => c.id === action.confirmationId);
      if (!conf) throw new ArchiveError("确认单不存在");
      weigh(state, conf, action.actor);
      return state;
    }

    case "review": {
      const conf = state.confirmations.find((c) => c.id === action.confirmationId);
      if (!conf) throw new ArchiveError("确认单不存在");
      if (conf.status !== "待复核") {
        throw new ArchiveError("只有「待复核」的确认单可以复核确认");
      }
      if (!conf.weigher) throw new ArchiveError("称料人未确认，不能复核");
      if (action.actor.trim() === conf.weigher) {
        throw new ArchiveError("复核人必须与称料人不同（禁止一人补签）");
      }
      conf.reviewer = action.actor;
      conf.reviewedAt = now();
      conf.reviewNote = action.note.trim() || "复核通过";
      conf.status = "待出样";
      pushAudit(state, action.actor, `复核确认 ${conf.sampleId}（${conf.id}），称料人 ${conf.weigher}，双签齐备`);
      return state;
    }

    case "recheck": {
      // 余量补足 / 预算调整后，对待处理单重算：通过则回待复核，仍不通过则继续待处理
      const conf = state.confirmations.find((c) => c.id === action.confirmationId);
      if (!conf) throw new ArchiveError("确认单不存在");
      if (conf.status !== "待处理") {
        throw new ArchiveError("只有「待处理」的确认单可以重新核对");
      }
      const cost = evaluateConf(state, conf);
      const reasons = blockReasonsFor(cost);
      if (reasons.length > 0) {
        conf.blockReasons = reasons;
        pushAudit(state, action.actor, `重新核对 ${conf.sampleId}（${conf.id}）仍未通过：${reasons.join("；")}`);
      } else {
        conf.weighedCost = cost.total;
        delete conf.blockReasons;
        // 保留称料人签名：阻断解除后沿原双签链路继续；未签名的旧单由处理人补登为称料确认人
        if (!conf.weigher) conf.weigher = action.actor;
        if (!conf.weighedAt) conf.weighedAt = now();
        conf.status = "待复核";
        pushAudit(state, action.actor, `重新核对 ${conf.sampleId}（${conf.id}）通过，染料成本 ¥${cost.total}，转待复核`);
      }
      return state;
    }

    case "issue": {
      const conf = state.confirmations.find((c) => c.id === action.confirmationId);
      if (!conf) throw new ArchiveError("确认单不存在");
      if (conf.status !== "待出样") {
        throw new ArchiveError("只有双签齐备的「待出样」确认单能出送样单");
      }
      // 出样前再核一次库存与预算，防止期间数据变化
      const cost = evaluateConf(state, conf);
      const reasons = blockReasonsFor(cost);
      if (reasons.length > 0) {
        conf.status = "待处理";
        conf.blockReasons = reasons;
        pushAudit(state, action.actor, `出样 ${conf.sampleId}（${conf.id}）被拦下：${reasons.join("；")}`);
        return state;
      }
      const sample = state.samples.find((s) => s.id === conf.sampleId)!;
      // 扣减染料库存
      for (const line of cost.lines) {
        const dye = state.dyes.find((d) => d.id === line.dyeId);
        if (dye) dye.stock = Math.max(0, dye.stock - line.dosage);
      }
      // 占用订单预算
      const order = state.orders.find((o) => o.id === sample.orderId)!;
      order.spent = Math.round((order.spent + cost.total) * 100) / 100;
      order.updatedAt = now();

      const dn = `DN-${now().slice(0, 10).replace(/-/g, "")}-${String(
        state.confirmations.filter((c) => c.deliveryNo).length + 1,
      ).padStart(2, "0")}`;
      conf.deliveryNo = dn;
      conf.issuedAt = now();
      conf.status = "已出样";
      pushAudit(state, action.actor, `出具送样单 ${dn}（${sample.code}），扣减染料库存并占用预算 ¥${cost.total}`);
      return state;
    }

    case "bumpRecipe": {
      const recipe = state.recipes.find((r) => r.id === action.recipeId);
      if (!recipe) throw new ArchiveError("配方不存在");
      if (action.items.length === 0) throw new ArchiveError("新版本至少保留一个染料组分");
      const nextVersion = latestVersionOf(recipe) + 1;
      recipe.versions.push({
        version: nextVersion,
        note: action.note.trim() || "配方调整",
        items: action.items.map((it) => ({ ...it })),
        updatedAt: now(),
      });
      const hitSamples = state.samples.filter((s) => s.recipeId === recipe.id);
      const hitConfs: Confirmation[] = [];
      for (const sample of hitSamples) {
        const before = state.confirmations.filter(
          (c) => c.sampleId === sample.id && c.status !== "已出样" && c.status !== "已失效",
        );
        if (before.length > 0) {
          invalidateAndRebuild(state, sample.id, "配方变更");
          hitConfs.push(...before);
        }
      }
      pushAudit(state, action.actor, `配方 ${recipe.id} ${recipe.name} 升版 v${nextVersion - 1}→v${nextVersion}`);
      if (hitConfs.length > 0) {
        pushAudit(state, "系统", `${hitConfs.map((c) => c.id).join("、")} 失效留档，已按新版本重新生成确认单`);
      }
      return state;
    }

    case "bumpCard": {
      const card = state.cards.find((c) => c.id === action.cardId);
      if (!card) throw new ArchiveError("色卡不存在");
      const oldVersion = card.version;
      card.version = oldVersion + 1;
      card.target = { ...action.target };
      card.updatedAt = now();
      const hitSamples = state.samples.filter((s) => s.cardId === card.id);
      const hitConfs: Confirmation[] = [];
      for (const sample of hitSamples) {
        const before = state.confirmations.filter(
          (c) => c.sampleId === sample.id && c.status !== "已出样" && c.status !== "已失效",
        );
        if (before.length > 0) {
          invalidateAndRebuild(state, sample.id, "色卡变更");
          hitConfs.push(...before);
        }
      }
      pushAudit(state, action.actor, `色卡 ${card.id} ${card.name} 升版 v${oldVersion}→v${oldVersion + 1}`);
      if (hitConfs.length > 0) {
        pushAudit(state, "系统", `${hitConfs.map((c) => c.id).join("、")} 失效留档，已按新色卡重新生成确认单`);
      }
      return state;
    }

    case "adjustBudget": {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order) throw new ArchiveError("订单不存在");
      if (!(action.budget >= 0)) throw new ArchiveError("预算不能为负");
      if (action.budget < order.spent) {
        throw new ArchiveError(`预算不能低于已占用预算 ¥${order.spent}`);
      }
      const old = order.budget;
      order.budget = action.budget;
      order.updatedAt = now();
      const hitSamples = state.samples.filter((s) => s.orderId === order.id);
      const hitConfs: Confirmation[] = [];
      for (const sample of hitSamples) {
        const before = state.confirmations.filter(
          (c) => c.sampleId === sample.id && c.status !== "已出样" && c.status !== "已失效",
        );
        if (before.length > 0) {
          invalidateAndRebuild(state, sample.id, "预算调整");
          hitConfs.push(...before);
        }
      }
      pushAudit(state, action.actor, `订单 ${order.id} 染料预算调整 ¥${old}→¥${action.budget}`);
      if (hitConfs.length > 0) {
        pushAudit(state, "系统", `${hitConfs.map((c) => c.id).join("、")} 因预算调整失效留档，已重新生成确认单`);
      }
      return state;
    }

    case "restock": {
      const dye = state.dyes.find((d) => d.id === action.dyeId);
      if (!dye) throw new ArchiveError("染料不存在");
      if (!(action.amount > 0)) throw new ArchiveError("补库数量必须大于 0");
      dye.stock = Math.round((dye.stock + action.amount) * 1000) / 1000;
      pushAudit(state, action.actor, `染料 ${dye.name} 补库 +${action.amount} kg，当前余量 ${dye.stock} kg`);
      return state;
    }

    case "createSample": {
      if (!action.code.trim()) throw new ArchiveError("小样编号不能为空");
      if (state.samples.some((s) => s.code === action.code.trim())) {
        throw new ArchiveError("小样编号已存在");
      }
      if (!(action.fabricWeight > 0)) throw new ArchiveError("投料布重必须大于 0");
      const recipe = state.recipes.find((r) => r.id === action.recipeId);
      const card = state.cards.find((c) => c.id === action.cardId);
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!recipe || !card || !order) throw new ArchiveError("绑定主数据缺失");
      const id = `S${Math.max(0, ...state.samples.map((s) => Number(s.id.slice(1)) || 0)) + 1}`;
      const sample: Sample = {
        id,
        code: action.code.trim(),
        orderId: order.id,
        recipeId: recipe.id,
        recipeVersion: latestVersionOf(recipe),
        cardId: card.id,
        cardVersion: card.version,
        fabricWeight: action.fabricWeight,
        createdAt: now(),
      };
      state.samples.push(sample);
      const conf = buildConfirmation(sample, state, now());
      pushAudit(state, action.actor, `新建小样 ${sample.code}，绑定订单 ${order.id} / 配方 ${recipe.id} v${sample.recipeVersion} / 色卡 ${card.id} v${sample.cardVersion}，生成 ${conf.id}`);
      return state;
    }

    default:
      return state;
  }
}

export { seedState };
export type { ArchiveState };

// 页面只读查询辅助
export function historyOf(state: ArchiveState, sampleId: string) {
  return state.confirmations
    .filter((c) => c.sampleId === sampleId)
    .sort((a, b) => b.seq - a.seq);
}

export function latestRecipeVersion(recipe: Recipe) {
  return recipe.versions[recipe.versions.length - 1];
}
