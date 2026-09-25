// ─────────────────────────────────────────────────────────────
// 领域模型：小样送样确认台
// 计算、档案与页面共用的类型定义（仅此文件可被任意层引用）
// ─────────────────────────────────────────────────────────────

/** 染料（余量 = 实物库存；已出单扣减、未出单仅占用） */
export interface Dye {
  id: string;
  name: string;
  /** 单价（元/g） */
  pricePerGram: number;
  /** 实物库存（g） */
  stock: number;
}

/** 客户订单（预算按订单口径控制） */
export interface DyeOrder {
  id: string;
  customer: string;
  fabric: string;
  /** 打样预算（元） */
  budget: number;
}

/** 配方行：某染料对布重的用量百分比（o.w.f %） */
export interface RecipeLine {
  dyeId: string;
  /** owf 百分比，如 1.2 表示 1.2% */
  percent: number;
}

/** 配方版本：版本递增、内容不可原地修改，改配方 = 出新版本 */
export interface RecipeVersion {
  id: string;
  recipeId: string;
  recipeName: string;
  version: number;
  bathRatio: string;
  tempCurve: string;
  holdMinutes: number;
  lines: RecipeLine[];
  createdAt: string;
  note?: string;
}

/** 色卡（标准色）：修订后 code 不变，记录版本与修订时间 */
export interface ColorCard {
  id: string;
  code: string;
  name: string;
  /** 16 进制色块 */
  swatch: string;
  revision: number;
  revisedAt: string;
}

/** 人员（称料/复核必须为两个不同的人，各自签名） */
export interface Staff {
  id: string;
  name: string;
  role: "称料员" | "复核员" | "主管" | "打样员";
}

/** 送样确认单状态 */
export type SheetStatus =
  | "WEIGH" // 待称料：等待称料员签名
  | "REVIEW" // 待复核：等待复核员签名
  | "BLOCKED" // 待处理：染料余量不足 / 超预算，禁止出送样单
  | "READY" // 可出单：双人签名齐全且校验通过
  | "ISSUED" // 已出单：送样单已生成、染料已扣库
  | "VOID"; // 已失效留档：配方/预算/色卡变更后归档

/** 投料行（按实际称料记录） */
export interface WeighLine {
  dyeId: string;
  plannedPercent: number;
  /** 计划用量（g） */
  plannedGram: number;
  /** 实际称料（g）——成本按此计算 */
  actualGram: number;
  /** 单价快照（元/g） */
  unitPrice: number;
}

export interface Signature {
  staffId: string;
  staffName: string;
  at: string;
}

/** 快照：签名当时绑定的主数据，失效后仍可还原核对 */
export interface SheetSnapshot {
  recipeVersion: number;
  recipe: RecipeVersion;
  colorCardRevision: number;
  colorCard: ColorCard;
  budget: number;
}

/** 阻断原因 */
export interface BlockReasons {
  shortDyes: { dyeId: string; dyeName: string; available: number; need: number }[];
  overBudget: { orderSpent: number; sheetCost: number; budget: number } | null;
}

/** 送样确认单（每个小样一张，绑定订单 + 配方版本 + 色卡） */
export interface SampleSheet {
  id: string;
  sampleCode: string;
  orderId: string;
  recipeVersionId: string;
  colorCardId: string;
  /** 布样重量 g（投料计算基准） */
  fabricWeight: number;
  status: SheetStatus;
  lines: WeighLine[];
  weighSignature: Signature | null;
  reviewSignature: Signature | null;
  block: BlockReasons | null;
  /** 送样单号（READY → ISSUED 时生成） */
  deliveryNo: string | null;
  issuedAt: string | null;
  snapshot: SheetSnapshot | null;
  voidedAt: string | null;
  voidReason: string | null;
  /** 失效后由新确认单承接 */
  successorId: string | null;
  createdAt: string;
}

/** 事件台账：所有动作不可变留痕（档案层） */
export interface LedgerEvent {
  id: number;
  at: string;
  type:
    | "SHEET_CREATED"
    | "WEIGH_SIGNED"
    | "REVIEW_PASSED"
    | "REVIEW_REJECTED"
    | "DELIVERY_ISSUED"
    | "SHEET_VOIDED";
  sheetId: string;
  sampleCode: string;
  detail: string;
  staffName?: string;
}

export interface DomainState {
  dyes: Dye[];
  orders: DyeOrder[];
  recipes: RecipeVersion[];
  colorCards: ColorCard[];
  staff: Staff[];
  sheets: SampleSheet[];
  ledger: LedgerEvent[];
  seqSample: number;
  seqDelivery: number;
  seqEvent: number;
}
