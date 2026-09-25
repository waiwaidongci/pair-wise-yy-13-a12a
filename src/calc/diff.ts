// 计算层 · 两版确认单（配方版本 / 色卡版本 / 预算 / 投料）差异对比（纯函数）

import type { Confirmation, Dye, LabValue, RecipeItem } from "./types";
import { round2, round3 } from "./cost";

export interface ItemChange {
  dyeId: string;
  fromPercent?: number;
  toPercent?: number;
}

export interface ConfirmDiff {
  recipeChanged: boolean;
  cardChanged: boolean;
  budgetChanged: boolean;
  weightChanged: boolean;
  itemChanges: ItemChange[];
  cardFrom?: LabValue;
  cardTo?: LabValue;
  budgetFrom?: number;
  budgetTo?: number;
  weightFrom?: number;
  weightTo?: number;
  /** 按新旧两张确认单各自快照投料计算出的染料成本差额（元） */
  costDelta: number;
  costFrom: number;
  costTo: number;
}

function diffItems(from: RecipeItem[], to: RecipeItem[]): ItemChange[] {
  const map = new Map<string, ItemChange>();
  for (const item of from) {
    map.set(item.dyeId, { dyeId: item.dyeId, fromPercent: item.percent });
  }
  for (const item of to) {
    const existing = map.get(item.dyeId);
    if (existing) existing.toPercent = item.percent;
    else map.set(item.dyeId, { dyeId: item.dyeId, toPercent: item.percent });
  }
  return [...map.values()].filter(
    (c) => (c.fromPercent ?? 0) !== (c.toPercent ?? 0),
  );
}

function snapshotCost(c: Confirmation, dyes: Dye[]): number {
  const price = new Map(dyes.map((d) => [d.id, d.unitPrice]));
  const total = c.recipeSnapshot.reduce(
    (sum, it) =>
      sum + ((c.fabricWeight * it.percent) / 100) * (price.get(it.dyeId) ?? 0),
    0,
  );
  return round2(total);
}

export function diffConfirmations(
  older: Confirmation,
  newer: Confirmation,
  dyes: Dye[],
): ConfirmDiff {
  const costFrom = snapshotCost(older, dyes);
  const costTo = snapshotCost(newer, dyes);
  return {
    recipeChanged: older.recipeVersion !== newer.recipeVersion,
    cardChanged: older.cardVersion !== newer.cardVersion,
    budgetChanged: older.budgetSnapshot !== newer.budgetSnapshot,
    weightChanged: older.fabricWeight !== newer.fabricWeight,
    itemChanges: diffItems(older.recipeSnapshot, newer.recipeSnapshot),
    cardFrom: older.cardTarget,
    cardTo: newer.cardTarget,
    budgetFrom: older.budgetSnapshot,
    budgetTo: newer.budgetSnapshot,
    weightFrom: older.fabricWeight,
    weightTo: newer.fabricWeight,
    costFrom,
    costTo,
    costDelta: round2(costTo - costFrom),
  };
}

export const fmtMoney = (n: number) => `¥${round2(n).toFixed(2)}`;
export const fmtDosage = (n: number) => `${round3(n)} kg`;
