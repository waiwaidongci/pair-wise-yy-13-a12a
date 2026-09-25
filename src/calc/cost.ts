// 计算层 · 按投料计算染料成本，并核对库存余量与订单预算（纯函数，不碰页面与档案）

import type {
  Confirmation,
  Dye,
  Order,
  RecipeItem,
  RecipeVersion,
  Sample,
} from "./types";

export interface CostLine {
  dyeId: string;
  name: string;
  percent: number;
  /** 投料用量 kg（保留三位小数） */
  dosage: number;
  unitPrice: number;
  amount: number;
}

export interface CostBreakdown {
  weight: number;
  lines: CostLine[];
  /** 染料成本合计（元，保留两位小数） */
  total: number;
  /** 各染料当前库存余量 kg（dyeId → stock） */
  stockOf: Record<string, number>;
  shortDyes: string[];
  overBudget: boolean;
  budgetRemaining: number;
}

// 安全舍入：规避 0.0035*1000=3.4999999 之类的二进制浮点误差
const safeRound = (n: number) => Math.round(n + Number.EPSILON * n * 10);
export const round2 = (n: number) => safeRound(n * 100) / 100;
export const round3 = (n: number) => safeRound(n * 1000) / 1000;

/** 用量 = 布重 × 投染百分比 / 100 */
export function dosage(weight: number, percent: number): number {
  return round3((weight * percent) / 100);
}

/**
 * 按投料计算一张小样的染料成本，并返回库存/预算核对结果。
 * 余量不足按染料逐条标注；预算口径为「订单预算 − 已出样成本」。
 */
export function calcCost(params: {
  sample: Pick<Sample, "fabricWeight" | "orderId">;
  recipe: RecipeVersion;
  order: Pick<Order, "budget" | "spent">;
  dyes: Dye[];
}): CostBreakdown {
  const { sample, recipe, order, dyes } = params;
  const dyeMap = new Map(dyes.map((d) => [d.id, d]));

  const lines: CostLine[] = recipe.items.map((item: RecipeItem) => {
    const dye = dyeMap.get(item.dyeId);
    const used = dosage(sample.fabricWeight, item.percent);
    return {
      dyeId: item.dyeId,
      name: dye?.name ?? item.dyeId,
      percent: item.percent,
      dosage: used,
      unitPrice: dye?.unitPrice ?? 0,
      amount: round2(used * (dye?.unitPrice ?? 0)),
    };
  });

  const total = round2(lines.reduce((sum, l) => sum + l.amount, 0));
  const shortDyes = lines
    .filter((l) => {
      const dye = dyeMap.get(l.dyeId);
      return dye !== undefined && dye.stock < l.dosage;
    })
    .map((l) => l.name);

  const budgetRemaining = round2(order.budget - order.spent);

  return {
    weight: sample.fabricWeight,
    lines,
    total,
    stockOf: Object.fromEntries(dyes.map((d) => [d.id, d.stock])),
    shortDyes,
    overBudget: total > budgetRemaining,
    budgetRemaining,
  };
}

/** 已称料确认单上的阻断原因（用于待处理重算 / 出样前复核） */
export function blockReasonsFor(cost: CostBreakdown): string[] {
  const reasons: string[] = [];
  if (cost.shortDyes.length > 0) {
    const detail = cost.lines
      .filter((l) => cost.shortDyes.includes(l.name))
      .map((l) => `${l.name}（需 ${l.dosage.toFixed(3)} kg，库存 ${cost.stockOf[l.dyeId].toFixed(3)} kg）`)
      .join("；");
    reasons.push(`染料余量不足：${detail}`);
  }
  if (cost.overBudget) {
    reasons.push(
      `超预算：染料成本 ¥${cost.total} 超出订单剩余预算 ¥${cost.budgetRemaining}`,
    );
  }
  return reasons;
}

/** 确认单是否还处于活动态（可继续双签 / 出样流程） */
export function isActive(c: Confirmation): boolean {
  return c.status !== "已出样" && c.status !== "已失效";
}
