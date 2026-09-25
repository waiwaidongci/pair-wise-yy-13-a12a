// ─────────────────────────────────────────────────────────────
// 计算层：纯函数，无状态、无副作用
// 投料用量 / 成本 / 染料余量占用 / 预算 / 状态评估 / 版本差异
// ─────────────────────────────────────────────────────────────

import type {
  BlockReasons,
  ColorCard,
  Dye,
  RecipeLine,
  RecipeVersion,
  SampleSheet,
  SheetStatus,
  WeighLine,
} from "./types";

export const round3 = (n: number) => Math.round(n * 1000) / 1000;
export const round2 = (n: number) => Math.round(n * 100) / 100;
/** 预算比较容差（元），避免浮点误差把刚好持平误判超支 */
export const BUDGET_EPS = 0.005;

/** 配方行计划用量（g）= 布重 × owf% / 100 */
export function plannedGram(percent: number, fabricWeight: number): number {
  return round3((fabricWeight * percent) / 100);
}

/** 投料行成本（元）= 实际称料 × 单价快照（按投料算成本） */
export function lineCost(line: WeighLine): number {
  return round3(line.actualGram * line.unitPrice);
}

/** 确认单染料成本（元） */
export function sheetCost(sheet: SampleSheet): number {
  return round3(sheet.lines.reduce((sum, line) => sum + lineCost(line), 0));
}

/** 计划成本（用于对比） */
export function plannedSheetCost(sheet: SampleSheet): number {
  return round3(
    sheet.lines.reduce(
      (sum, line) => sum + line.plannedGram * line.unitPrice,
      0
    )
  );
}

/**
 * 未出单的确认单对染料的占用量（g）
 * 仅已实际称料（称料签名）且未出单的单子占用可用余量；
 * 待处理单未完成有效投料，不占用。
 */
export function reservedGrams(
  sheets: SampleSheet[],
  dyeId: string,
  excludeSheetId?: string
): number {
  return round3(
    sheets
      .filter(
        (s) =>
          s.id !== excludeSheetId &&
          s.status !== "ISSUED" &&
          s.status !== "VOID" &&
          s.weighSignature
      )
      .reduce(
        (sum, s) =>
          sum +
          s.lines
            .filter((l) => l.dyeId === dyeId)
            .reduce((g, l) => g + l.actualGram, 0),
        0
      )
  );
}

/** 染料当前可用余量（g）= 实物库存 − 其他未出单占用 */
export function dyeAvailable(
  dye: Dye,
  sheets: SampleSheet[],
  excludeSheetId?: string
): number {
  return round3(dye.stock - reservedGrams(sheets, dye.id, excludeSheetId));
}

/** 订单已出单累计成本（元） */
export function orderSpent(sheets: SampleSheet[], orderId: string): number {
  return round3(
    sheets
      .filter((s) => s.orderId === orderId && s.status === "ISSUED")
      .reduce((sum, s) => sum + sheetCost(s), 0)
  );
}

/**
 * 评估确认单是否可出单：
 * 1) 每种染料实际投料 ≤ 可用余量（实物库存 − 其他占用）
 * 2) 订单累计已出 + 本单成本 ≤ 订单预算
 */
export function evaluateBlock(
  sheet: SampleSheet,
  dyes: Dye[],
  sheets: SampleSheet[],
  budget: number
): BlockReasons {
  const shortDyes: BlockReasons["shortDyes"] = [];
  for (const line of sheet.lines) {
    const dye = dyes.find((d) => d.id === line.dyeId);
    if (!dye) continue;
    const available = dyeAvailable(dye, sheets, sheet.id);
    if (line.actualGram > available + 1e-9) {
      shortDyes.push({
        dyeId: dye.id,
        dyeName: dye.name,
        available,
        need: line.actualGram,
      });
    }
  }

  const cost = sheetCost(sheet);
  const spent = orderSpent(sheets, sheet.orderId);
  const overBudget =
    spent + cost > budget + BUDGET_EPS
      ? { orderSpent: spent, sheetCost: cost, budget }
      : null;

  return { shortDyes, overBudget };
}

/** 阻断 → 待处理；双签齐全且无阻断 → 可出单；否则按流程回到待称料/待复核 */
export function deriveStatus(sheet: SampleSheet, block: BlockReasons): SheetStatus {
  if (sheet.status === "ISSUED" || sheet.status === "VOID") return sheet.status;
  const blocked = block.shortDyes.length > 0 || block.overBudget !== null;
  if (blocked) return "BLOCKED";
  if (sheet.weighSignature && sheet.reviewSignature) return "READY";
  if (sheet.weighSignature) return "REVIEW";
  return "WEIGH";
}

// ── 版本差异 ──────────────────────────────────────────────────

export interface RecipeLineDiff {
  dyeId: string;
  dyeName: string;
  oldPercent: number | null;
  newPercent: number | null;
}

export interface SheetVersionDiff {
  recipeChanged: boolean;
  recipeLineDiffs: RecipeLineDiff[];
  processChanged: {
    bathRatio: [string, string] | null;
    tempCurve: [string, string] | null;
    holdMinutes: [number, number] | null;
  };
  colorCardChanged: boolean;
  colorCard: {
    oldCode: string;
    oldName: string;
    oldRevision: number;
    newCode: string;
    newName: string;
    newRevision: number;
  } | null;
  budgetChanged: boolean;
  budget: [number, number] | null;
}

function lineDiffs(
  oldLines: RecipeLine[],
  newLines: RecipeLine[],
  dyeName: (id: string) => string
): RecipeLineDiff[] {
  const map = new Map<string, [number | null, number | null]>();
  for (const l of oldLines) map.set(l.dyeId, [l.percent, null]);
  for (const l of newLines) {
    const prev = map.get(l.dyeId);
    map.set(l.dyeId, [prev ? prev[0] : null, l.percent]);
  }
  return [...map.entries()]
    .map(([dyeId, [oldPercent, newPercent]]) => ({
      dyeId,
      dyeName: dyeName(dyeId),
      oldPercent,
      newPercent,
    }))
    .filter((d) => d.oldPercent !== d.newPercent);
}

/**
 * 计算确认单当前（或快照）版本 与 现行主数据之间的差异。
 * 用于：旧确认单失效留档、列表展开核对版本差异。
 */
export function computeVersionDiff(
  sheet: SampleSheet,
  latestRecipe: RecipeVersion | undefined,
  latestCard: ColorCard | undefined,
  latestBudget: number,
  dyeName: (id: string) => string = (id) => id
): SheetVersionDiff {
  const snap = sheet.snapshot;
  const oldRecipe = snap?.recipe ?? latestRecipe;
  const oldCard = snap?.colorCard ?? latestCard;
  const oldBudget = snap?.budget ?? latestBudget;

  const recipeLineDiffs =
    latestRecipe && oldRecipe
      ? lineDiffs(oldRecipe.lines, latestRecipe.lines, dyeName)
      : [];
  const recipeChanged =
    recipeLineDiffs.length > 0 ||
    (!!oldRecipe &&
      !!latestRecipe &&
      (oldRecipe.bathRatio !== latestRecipe.bathRatio ||
        oldRecipe.tempCurve !== latestRecipe.tempCurve ||
        oldRecipe.holdMinutes !== latestRecipe.holdMinutes));

  const colorCardChanged =
    !!oldCard &&
    !!latestCard &&
    (oldCard.id !== latestCard.id || oldCard.revision !== latestCard.revision);

  const budgetChanged = round2(oldBudget) !== round2(latestBudget);

  return {
    recipeChanged,
    recipeLineDiffs,
    processChanged: {
      bathRatio:
        oldRecipe && latestRecipe && oldRecipe.bathRatio !== latestRecipe.bathRatio
          ? [oldRecipe.bathRatio, latestRecipe.bathRatio]
          : null,
      tempCurve:
        oldRecipe && latestRecipe && oldRecipe.tempCurve !== latestRecipe.tempCurve
          ? [oldRecipe.tempCurve, latestRecipe.tempCurve]
          : null,
      holdMinutes:
        oldRecipe && latestRecipe && oldRecipe.holdMinutes !== latestRecipe.holdMinutes
          ? [oldRecipe.holdMinutes, latestRecipe.holdMinutes]
          : null,
    },
    colorCardChanged,
    colorCard:
      colorCardChanged && oldCard && latestCard
        ? {
            oldCode: oldCard.code,
            oldName: oldCard.name,
            oldRevision: oldCard.revision,
            newCode: latestCard.code,
            newName: latestCard.name,
            newRevision: latestCard.revision,
          }
        : null,
    budgetChanged,
    budget: budgetChanged ? [oldBudget, latestBudget] : null,
  };
}
