// ─────────────────────────────────────────────────────────────
// 档案层：初始主数据 + 演示场景引导
// 演示单据全部由引擎动作逐步生成，状态与真实操作完全一致。
// ─────────────────────────────────────────────────────────────

import type {
  ColorCard,
  DomainState,
  Dye,
  DyeOrder,
  RecipeVersion,
  Staff,
} from "../domain/types";
import { step } from "./engine";

const dyes: Dye[] = [
  { id: "D01", name: "活性红 3BS", pricePerGram: 0.18, stock: 320 },
  { id: "D02", name: "活性黄 3RS", pricePerGram: 0.16, stock: 260 },
  { id: "D03", name: "活性蓝 2GLN", pricePerGram: 0.22, stock: 95 },
  { id: "D04", name: "分散红玉 S-5BL", pricePerGram: 0.25, stock: 180 },
  { id: "D05", name: "分散蓝 H-GL", pricePerGram: 0.21, stock: 48 },
  { id: "D06", name: "酸性黑 LD", pricePerGram: 0.19, stock: 210 },
];

const orders: DyeOrder[] = [
  { id: "SO-24091", customer: "恒溢针织", fabric: "棉府绸 120g", budget: 220 },
  { id: "SO-24095", customer: "锦瀚织造", fabric: "锦纶泳布", budget: 60 },
  { id: "SO-24097", customer: "东隆外贸", fabric: "涤纶针织 160g", budget: 10 },
];

const recipeV1 = (): RecipeVersion => ({
  id: "RV-1",
  recipeId: "R-COTTON",
  recipeName: "活性深棉红",
  version: 1,
  bathRatio: "1:10",
  tempCurve: "60℃恒温染色 30min，元明粉分次促染",
  holdMinutes: 30,
  lines: [
    { dyeId: "D01", percent: 1.5 },
    { dyeId: "D02", percent: 0.8 },
    { dyeId: "D03", percent: 0.3 },
  ],
  createdAt: "2026-09-20T08:00:00.000Z",
  note: "初版配方",
});

const recipePoly = (): RecipeVersion[] => [
  {
    id: "RV-3",
    recipeId: "R-POLY",
    recipeName: "分散深藏青",
    version: 1,
    bathRatio: "1:12",
    tempCurve: "1℃/min 升至 130℃，高压保温",
    holdMinutes: 40,
    lines: [
      { dyeId: "D05", percent: 3.5 },
      { dyeId: "D04", percent: 2.1 },
      { dyeId: "D06", percent: 0.6 },
    ],
    createdAt: "2026-09-21T08:00:00.000Z",
    note: "初版配方",
  },
];

const colorCards: ColorCard[] = [
  {
    id: "CC-C01",
    code: "TCX-1860",
    name: "砖红（客户来样）",
    swatch: "#be123c",
    revision: 1,
    revisedAt: "2026-09-20T08:00:00.000Z",
  },
  {
    id: "CC-P02",
    code: "TCX-4231",
    name: "深藏青",
    swatch: "#1f2a5c",
    revision: 1,
    revisedAt: "2026-09-21T08:00:00.000Z",
  },
];

const staff: Staff[] = [
  { id: "E01", name: "王称料", role: "称料员" },
  { id: "E02", name: "李复核", role: "复核员" },
  { id: "E03", name: "赵主管", role: "主管" },
  { id: "E04", name: "陈打样", role: "打样员" },
];

/** 全新主数据（未产生任何确认单） */
export function baseState(): DomainState {
  return {
    dyes,
    orders,
    recipes: [recipeV1(), ...recipePoly()],
    colorCards,
    staff,
    sheets: [],
    ledger: [],
    seqSample: 999,
    seqDelivery: 0,
    seqEvent: 0,
  };
}

const T = {
  t1: "2026-09-24T01:30:00.000Z",
  t2: "2026-09-24T02:10:00.000Z",
  t3: "2026-09-24T03:00:00.000Z",
  t4: "2026-09-24T04:00:00.000Z",
  t5: "2026-09-24T05:20:00.000Z",
  t6: "2026-09-24T06:00:00.000Z",
  t7: "2026-09-24T06:40:00.000Z",
  t8: "2026-09-24T07:10:00.000Z",
  t9: "2026-09-24T08:30:00.000Z",
};

/** 演示场景：覆盖 已出单 / 失效留档 / 可出单 / 待复核 / 待处理(余量不足+超预算) */
export function createInitialState(): DomainState {
  let s = baseState();

  // ① S-1000：配方 v1 完成全流程并出单（旧版本历史留痕）
  s = step(s, {
    type: "CREATE_SHEET",
    orderId: "SO-24091",
    recipeVersionId: "RV-1",
    colorCardId: "CC-C01",
    fabricWeight: 25,
    at: T.t1,
  });
  const s1000 = s.sheets.find((x) => x.sampleCode === "S-1000")!.id;
  s = step(s, {
    type: "WEIGH_SIGN",
    sheetId: s1000,
    staffId: "E01",
    actual: { D01: 0.375, D02: 0.2, D03: 0.075 },
    at: T.t2,
  });
  s = step(s, { type: "REVIEW_PASS", sheetId: s1000, staffId: "E02", at: T.t3 });
  s = step(s, { type: "ISSUE_DELIVERY", sheetId: s1000, at: T.t4 });

  // ② 配方发布 v2：因无在途单，不产生失效（已出单的 S-1000 保持 v1 历史）
  s = step(s, {
    type: "NEW_RECIPE_VERSION",
    recipeId: "R-COTTON",
    bathRatio: "1:10",
    tempCurve: "60℃恒温染色 35min，匀染剂 1g/L 同步加入",
    holdMinutes: 35,
    lines: [
      { dyeId: "D01", percent: 1.4 },
      { dyeId: "D02", percent: 0.9 },
      { dyeId: "D03", percent: 0.4 },
    ],
    note: "客户反馈偏深，下调红相、微调蓝黄",
    at: T.t5,
  });
  const rv2 = s.recipes.find((r) => r.recipeId === "R-COTTON" && r.version === 2)!.id;

  // ③ S-1001：先按色卡第 1 版建单（尚未称料）
  s = step(s, {
    type: "CREATE_SHEET",
    orderId: "SO-24095",
    recipeVersionId: rv2,
    colorCardId: "CC-C01",
    fabricWeight: 30,
    at: T.t6,
  });

  // ④ 色卡修订至第 2 版：S-1001 失效留档，承接单 S-1002（待称料）
  s = step(s, {
    type: "REVISE_COLOR_CARD",
    colorCardId: "CC-C01",
    name: "砖红（客户来样·光照修订）",
    swatch: "#a30f33",
    at: T.t7,
  });

  // ⑤ S-1003：按 v2 + 新色卡称料复核 → 当前「可出单」
  s = step(s, {
    type: "CREATE_SHEET",
    orderId: "SO-24091",
    recipeVersionId: rv2,
    colorCardId: "CC-C01",
    fabricWeight: 25,
    at: T.t8,
  });
  const s1003 = s.sheets.find((x) => x.sampleCode === "S-1003")!.id;
  s = step(s, {
    type: "WEIGH_SIGN",
    sheetId: s1003,
    staffId: "E01",
    actual: { D01: 0.35, D02: 0.225, D03: 0.1 },
    at: T.t8,
  });
  s = step(s, { type: "REVIEW_PASS", sheetId: s1003, staffId: "E02", at: T.t8 });

  // ⑥ S-1004：涤纶大单，投料 2000g —— 分散蓝余量不足且超预算 → 待处理
  s = step(s, {
    type: "CREATE_SHEET",
    orderId: "SO-24097",
    recipeVersionId: "RV-3",
    colorCardId: "CC-P02",
    fabricWeight: 2000,
    at: T.t9,
  });
  const s1004 = s.sheets.find((x) => x.sampleCode === "S-1004")!.id;
  s = step(s, {
    type: "WEIGH_SIGN",
    sheetId: s1004,
    staffId: "E01",
    actual: { D04: 42, D05: 70, D06: 12 },
    at: T.t9,
  });

  // ⑦ S-1005：v2 + 修订后色卡，称料完成待复核
  s = step(s, {
    type: "CREATE_SHEET",
    orderId: "SO-24091",
    recipeVersionId: rv2,
    colorCardId: "CC-C01",
    fabricWeight: 25,
    at: T.t9,
  });
  const s1005 = s.sheets.find((x) => x.sampleCode === "S-1005")!.id;
  s = step(s, {
    type: "WEIGH_SIGN",
    sheetId: s1005,
    staffId: "E01",
    actual: { D01: 0.35, D02: 0.225, D03: 0.105 },
    at: T.t9,
  });

  return s;
}
