// 送样确认台 · 领域类型（计算层 / 档案层共用）

/** 确认单状态：待称料 → 待复核 →（待处理）→ 待出样 → 已出样；变更后旧单 → 已失效 */
export type ConfirmStatus =
  | "待称料"
  | "待复核"
  | "待处理"
  | "待出样"
  | "已出样"
  | "已失效";

export type InvalidateReason = "配方变更" | "色卡变更" | "预算调整";

export interface LabValue {
  DL: number;
  Da: number;
  Db: number;
}

/** 染料主数据与库存余量 */
export interface Dye {
  id: string;
  name: string;
  /** 单价 元/kg */
  unitPrice: number;
  /** 库存余量 kg */
  stock: number;
}

/** 配方中的一个染料组分，percent 为相对布重的投染百分比（o.w.f，%） */
export interface RecipeItem {
  dyeId: string;
  percent: number;
}

export interface RecipeVersion {
  version: number;
  note: string;
  items: RecipeItem[];
  updatedAt: string;
}

export interface Recipe {
  id: string;
  name: string;
  fabric: string;
  liquorRatio: string;
  temperature: string;
  holdMinutes: number;
  finishing: string;
  versions: RecipeVersion[];
}

export interface ColorCard {
  id: string;
  name: string;
  version: number;
  target: LabValue;
  updatedAt: string;
}

export interface Order {
  id: string;
  customer: string;
  /** 染料预算（元/单） */
  budget: number;
  /** 已出样扣减的染料成本 */
  spent: number;
  updatedAt: string;
}

/** 小样：绑定订单、配方版本、色卡版本 */
export interface Sample {
  id: string;
  code: string;
  orderId: string;
  recipeId: string;
  recipeVersion: number;
  cardId: string;
  cardVersion: number;
  /** 投料布重 kg */
  fabricWeight: number;
  createdAt: string;
}

export interface AuditEntry {
  at: string;
  actor: string;
  action: string;
}

/** 送样确认单：每个小样每个版本一张，承载双签、成本与异常状态 */
export interface Confirmation {
  id: string;
  sampleId: string;
  /** 同一小样第几张确认单（升版后 +1） */
  seq: number;
  status: ConfirmStatus;

  // —— 绑定快照（即使主数据后改，旧单仍可核对）——
  recipeVersion: number;
  recipeNote: string;
  recipeSnapshot: RecipeItem[];
  cardVersion: number;
  cardTarget: LabValue;
  fabricWeight: number;
  budgetSnapshot: number;

  // —— 称料确认（第一人）——
  weigher?: string;
  weighedAt?: string;
  weighedCost?: number;

  // —— 复核确认（第二人，须与称料人不同）——
  reviewer?: string;
  reviewedAt?: string;
  reviewNote?: string;

  // —— 异常挂起 ——
  blockReasons?: string[];

  // —— 出样 ——
  deliveryNo?: string;
  issuedAt?: string;

  // —— 失效留档 ——
  invalidReason?: InvalidateReason;
  invalidatedAt?: string;

  createdAt: string;
}
