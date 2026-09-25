// 档案层 · 初始数据：染料库存与单价、配方（含历史版本）、色卡、订单预算、小样与确认单

import type {
  AuditEntry,
  ColorCard,
  Confirmation,
  Dye,
  Order,
  Recipe,
  Sample,
} from "../calc/types";

export interface ArchiveState {
  dyes: Dye[];
  recipes: Recipe[];
  cards: ColorCard[];
  orders: Order[];
  samples: Sample[];
  confirmations: Confirmation[];
  audit: AuditEntry[];
}

const D_RED = "DY-R3BS";
const D_YEL = "DY-Y3RS";
const D_BLU = "DY-B2BLN";
const D_BLK = "DY-KNB";

export const seedState: ArchiveState = {
  dyes: [
    { id: D_RED, name: "活性红3BS", unitPrice: 120, stock: 2.5 },
    { id: D_YEL, name: "活性黄3RS", unitPrice: 95, stock: 3.0 },
    { id: D_BLU, name: "分散蓝2BLN", unitPrice: 150, stock: 0.04 },
    { id: D_BLK, name: "活性黑KN-B", unitPrice: 80, stock: 0.05 },
  ],

  recipes: [
    {
      id: "RCP-01",
      name: "全棉府绸大红",
      fabric: "棉100% · 120g/m² 府绸",
      liquorRatio: "1:10",
      temperature: "60℃ 恒温浸染",
      holdMinutes: 40,
      finishing: "柔软剂 2%（o.w.f）",
      versions: [
        {
          version: 1,
          note: "初版配方",
          items: [
            { dyeId: D_RED, percent: 2.4 },
            { dyeId: D_YEL, percent: 0.5 },
          ],
          updatedAt: "2026-09-15T10:00:00",
        },
        {
          version: 2,
          note: "客户来样偏黄，提高红相、压低黄相",
          items: [
            { dyeId: D_RED, percent: 2.6 },
            { dyeId: D_YEL, percent: 0.45 },
          ],
          updatedAt: "2026-09-22T14:20:00",
        },
      ],
    },
    {
      id: "RCP-02",
      name: "涤纶针织深藏青",
      fabric: "涤纶100% · 180g/m² 针织",
      liquorRatio: "1:12",
      temperature: "130℃ 高温高压",
      holdMinutes: 45,
      finishing: "定型 160℃×60s",
      versions: [
        {
          version: 1,
          note: "初版配方",
          items: [
            { dyeId: D_BLU, percent: 1.8 },
            { dyeId: D_BLK, percent: 0.6 },
          ],
          updatedAt: "2026-09-16T09:30:00",
        },
      ],
    },
    {
      id: "RCP-03",
      name: "棉针织黑",
      fabric: "棉100% · 200g/m² 针织",
      liquorRatio: "1:10",
      temperature: "60℃ 恒温浸染",
      holdMinutes: 50,
      finishing: "亲水柔软 3%",
      versions: [
        {
          version: 1,
          note: "初版配方",
          items: [
            { dyeId: D_BLK, percent: 2.8 },
            { dyeId: D_BLU, percent: 0.35 },
          ],
          updatedAt: "2026-09-17T11:10:00",
        },
      ],
    },
  ],

  cards: [
    {
      id: "CC-18",
      name: "中国红（恒泰确认样）",
      version: 2,
      target: { DL: 46.8, Da: 54.2, Db: 28.6 },
      updatedAt: "2026-09-22T14:20:00",
    },
    {
      id: "CC-22",
      name: "深藏青（锦澜来样）",
      version: 1,
      target: { DL: 24.5, Da: -2.1, Db: -12.8 },
      updatedAt: "2026-09-16T09:00:00",
    },
    {
      id: "CC-25",
      name: "针织黑（宜居标样）",
      version: 1,
      target: { DL: 16.2, Da: 0.4, Db: -1.6 },
      updatedAt: "2026-09-17T10:30:00",
    },
  ],

  orders: [
    {
      id: "PO-2409-18",
      customer: "恒泰纺织",
      budget: 12,
      spent: 1.68,
      updatedAt: "2026-09-20T16:40:00",
    },
    { id: "PO-2409-22", customer: "锦澜服饰", budget: 6, spent: 0, updatedAt: "2026-09-18T08:30:00" },
    { id: "PO-2409-25", customer: "宜居家纺", budget: 8, spent: 0, updatedAt: "2026-09-19T13:15:00" },
  ],

  samples: [
    {
      id: "S0",
      code: "LAB-619X",
      orderId: "PO-2409-18",
      recipeId: "RCP-01",
      recipeVersion: 1,
      cardId: "CC-18",
      cardVersion: 1,
      fabricWeight: 0.4,
      createdAt: "2026-09-19T09:00:00",
    },
    {
      id: "S1",
      code: "LAB-620A",
      orderId: "PO-2409-18",
      recipeId: "RCP-01",
      recipeVersion: 1,
      cardId: "CC-18",
      cardVersion: 1,
      fabricWeight: 0.5,
      createdAt: "2026-09-20T10:05:00",
    },
    {
      id: "S2",
      code: "LAB-621C",
      orderId: "PO-2409-18",
      recipeId: "RCP-01",
      recipeVersion: 2,
      cardId: "CC-18",
      cardVersion: 2,
      fabricWeight: 0.6,
      createdAt: "2026-09-21T09:20:00",
    },
    {
      id: "S3",
      code: "LAB-622F",
      orderId: "PO-2409-18",
      recipeId: "RCP-01",
      recipeVersion: 2,
      cardId: "CC-18",
      cardVersion: 2,
      fabricWeight: 0.5,
      createdAt: "2026-09-23T08:40:00",
    },
    {
      id: "S4",
      code: "LAB-624B",
      orderId: "PO-2409-22",
      recipeId: "RCP-02",
      recipeVersion: 1,
      cardId: "CC-22",
      cardVersion: 1,
      fabricWeight: 2.0,
      createdAt: "2026-09-22T11:00:00",
    },
    {
      id: "S5",
      code: "LAB-626A",
      orderId: "PO-2409-22",
      recipeId: "RCP-02",
      recipeVersion: 1,
      cardId: "CC-22",
      cardVersion: 1,
      fabricWeight: 1.0,
      createdAt: "2026-09-23T15:10:00",
    },
    {
      id: "S6",
      code: "LAB-628D",
      orderId: "PO-2409-25",
      recipeId: "RCP-03",
      recipeVersion: 1,
      cardId: "CC-25",
      cardVersion: 1,
      fabricWeight: 1.0,
      createdAt: "2026-09-24T09:30:00",
    },
    {
      id: "S7",
      code: "LAB-630K",
      orderId: "PO-2409-25",
      recipeId: "RCP-03",
      recipeVersion: 1,
      cardId: "CC-25",
      cardVersion: 1,
      fabricWeight: 2.5,
      createdAt: "2026-09-24T14:05:00",
    },
  ],

  confirmations: [
    // —— LAB-619X：升版前旧单，已失效留档 ——
    {
      id: "CF-S0-1",
      sampleId: "S0",
      seq: 1,
      status: "已失效",
      recipeVersion: 1,
      recipeNote: "初版配方",
      recipeSnapshot: [
        { dyeId: D_RED, percent: 2.4 },
        { dyeId: D_YEL, percent: 0.5 },
      ],
      cardVersion: 1,
      cardTarget: { DL: 48.2, Da: 52.0, Db: 31.5 },
      fabricWeight: 0.4,
      budgetSnapshot: 12,
      invalidReason: "配方变更",
      invalidatedAt: "2026-09-22T14:20:00",
      createdAt: "2026-09-19T09:00:00",
    },
    // —— LAB-619X：改版后按 v2 重新生成，待称料 ——
    {
      id: "CF-S0-2",
      sampleId: "S0",
      seq: 2,
      status: "待称料",
      recipeVersion: 2,
      recipeNote: "客户来样偏黄，提高红相、压低黄相",
      recipeSnapshot: [
        { dyeId: D_RED, percent: 2.6 },
        { dyeId: D_YEL, percent: 0.45 },
      ],
      cardVersion: 2,
      cardTarget: { DL: 46.8, Da: 54.2, Db: 28.6 },
      fabricWeight: 0.4,
      budgetSnapshot: 12,
      createdAt: "2026-09-22T14:20:00",
    },
    // —— LAB-620A：已走完双签并出送样单 ——
    {
      id: "CF-S1-1",
      sampleId: "S1",
      seq: 1,
      status: "已出样",
      recipeVersion: 1,
      recipeNote: "初版配方",
      recipeSnapshot: [
        { dyeId: D_RED, percent: 2.4 },
        { dyeId: D_YEL, percent: 0.5 },
      ],
      cardVersion: 1,
      cardTarget: { DL: 48.2, Da: 52.0, Db: 31.5 },
      fabricWeight: 0.5,
      budgetSnapshot: 12,
      weigher: "周敏",
      weighedAt: "2026-09-20T11:02:00",
      weighedCost: 1.68,
      reviewer: "孙立",
      reviewedAt: "2026-09-20T13:30:00",
      reviewNote: "色差 ΔE 0.84，投料与配方一致",
      deliveryNo: "DN-20260920-01",
      issuedAt: "2026-09-20T16:40:00",
      createdAt: "2026-09-20T10:05:00",
    },
    // —— LAB-621C：v1 旧单因配方+色卡双升版失效，v2 新单已称料待复核 ——
    {
      id: "CF-S2-1",
      sampleId: "S2",
      seq: 1,
      status: "已失效",
      recipeVersion: 1,
      recipeNote: "初版配方",
      recipeSnapshot: [
        { dyeId: D_RED, percent: 2.4 },
        { dyeId: D_YEL, percent: 0.5 },
      ],
      cardVersion: 1,
      cardTarget: { DL: 48.2, Da: 52.0, Db: 31.5 },
      fabricWeight: 0.6,
      budgetSnapshot: 12,
      invalidReason: "配方变更",
      invalidatedAt: "2026-09-22T14:20:00",
      createdAt: "2026-09-21T09:20:00",
    },
    {
      id: "CF-S2-2",
      sampleId: "S2",
      seq: 2,
      status: "待复核",
      recipeVersion: 2,
      recipeNote: "客户来样偏黄，提高红相、压低黄相",
      recipeSnapshot: [
        { dyeId: D_RED, percent: 2.6 },
        { dyeId: D_YEL, percent: 0.45 },
      ],
      cardVersion: 2,
      cardTarget: { DL: 46.8, Da: 54.2, Db: 28.6 },
      fabricWeight: 0.6,
      budgetSnapshot: 12,
      weigher: "周敏",
      weighedAt: "2026-09-23T09:10:00",
      weighedCost: 2.13,
      createdAt: "2026-09-22T14:20:00",
    },
    // —— LAB-622F：新单待称料 ——
    {
      id: "CF-S3-1",
      sampleId: "S3",
      seq: 1,
      status: "待称料",
      recipeVersion: 2,
      recipeNote: "客户来样偏黄，提高红相、压低黄相",
      recipeSnapshot: [
        { dyeId: D_RED, percent: 2.6 },
        { dyeId: D_YEL, percent: 0.45 },
      ],
      cardVersion: 2,
      cardTarget: { DL: 46.8, Da: 54.2, Db: 28.6 },
      fabricWeight: 0.5,
      budgetSnapshot: 12,
      createdAt: "2026-09-23T08:40:00",
    },
    // —— LAB-624B：称料时超预算，挂待处理 ——
    {
      id: "CF-S4-1",
      sampleId: "S4",
      seq: 1,
      status: "待处理",
      recipeVersion: 1,
      recipeNote: "初版配方",
      recipeSnapshot: [
        { dyeId: D_BLU, percent: 1.8 },
        { dyeId: D_BLK, percent: 0.6 },
      ],
      cardVersion: 1,
      cardTarget: { DL: 24.5, Da: -2.1, Db: -12.8 },
      fabricWeight: 2.0,
      budgetSnapshot: 6,
      blockReasons: ["超预算：染料成本 ¥6.36 超出订单剩余预算 ¥6.00"],
      createdAt: "2026-09-22T11:00:00",
    },
    // —— LAB-626A：双签完成，待出样 ——
    {
      id: "CF-S5-1",
      sampleId: "S5",
      seq: 1,
      status: "待出样",
      recipeVersion: 1,
      recipeNote: "初版配方",
      recipeSnapshot: [
        { dyeId: D_BLU, percent: 1.8 },
        { dyeId: D_BLK, percent: 0.6 },
      ],
      cardVersion: 1,
      cardTarget: { DL: 24.5, Da: -2.1, Db: -12.8 },
      fabricWeight: 1.0,
      budgetSnapshot: 6,
      weigher: "周敏",
      weighedAt: "2026-09-23T16:00:00",
      weighedCost: 3.18,
      reviewer: "陈立",
      reviewedAt: "2026-09-24T08:50:00",
      reviewNote: "升温曲线符合工艺，同意出样",
      createdAt: "2026-09-23T15:10:00",
    },
    // —— LAB-628D：待称料 ——
    {
      id: "CF-S6-1",
      sampleId: "S6",
      seq: 1,
      status: "待称料",
      recipeVersion: 1,
      recipeNote: "初版配方",
      recipeSnapshot: [
        { dyeId: D_BLK, percent: 2.8 },
        { dyeId: D_BLU, percent: 0.35 },
      ],
      cardVersion: 1,
      cardTarget: { DL: 16.2, Da: 0.4, Db: -1.6 },
      fabricWeight: 1.0,
      budgetSnapshot: 8,
      createdAt: "2026-09-24T09:30:00",
    },
    // —— LAB-630K：黑料余量不足，挂待处理 ——
    {
      id: "CF-S7-1",
      sampleId: "S7",
      seq: 1,
      status: "待处理",
      recipeVersion: 1,
      recipeNote: "初版配方",
      recipeSnapshot: [
        { dyeId: D_BLK, percent: 2.8 },
        { dyeId: D_BLU, percent: 0.35 },
      ],
      cardVersion: 1,
      cardTarget: { DL: 16.2, Da: 0.4, Db: -1.6 },
      fabricWeight: 2.5,
      budgetSnapshot: 8,
      blockReasons: ["染料余量不足：活性黑KN-B（需 0.070 kg，库存 0.050 kg）"],
      createdAt: "2026-09-24T14:05:00",
    },
  ],

  audit: [
    { at: "2026-09-20T11:02:00", actor: "周敏", action: "称料确认 LAB-620A（CF-S1-1），染料成本 ¥1.68" },
    { at: "2026-09-20T13:30:00", actor: "孙立", action: "复核确认 LAB-620A，与称料人非同一人" },
    { at: "2026-09-20T16:40:00", actor: "孙立", action: "出具送样单 DN-20260920-01（LAB-620A），扣减库存与预算" },
    { at: "2026-09-22T14:20:00", actor: "工艺组", action: "配方 RCP-01 全棉府绸大红 升版 v1→v2" },
    { at: "2026-09-22T14:20:00", actor: "对色组", action: "色卡 CC-18 中国红 升版 v1→v2" },
    { at: "2026-09-22T14:20:00", actor: "系统", action: "CF-S0-1、CF-S2-1 失效留档，按配方v2/色卡v2重新生成确认单" },
    { at: "2026-09-23T09:10:00", actor: "周敏", action: "称料确认 LAB-621C（CF-S2-2），染料成本 ¥2.13" },
  ],
};
