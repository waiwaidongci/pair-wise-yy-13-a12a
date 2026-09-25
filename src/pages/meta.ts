import type { SheetStatus } from "../domain/types";

export const STATUS_META: Record<
  SheetStatus,
  { label: string; cls: string; hint: string }
> = {
  WEIGH: { label: "待称料", cls: "st-weigh", hint: "等待称料员核定实际投料并签名" },
  REVIEW: { label: "待复核", cls: "st-review", hint: "称料已签名，等待另一位复核员确认" },
  BLOCKED: { label: "待处理", cls: "st-blocked", hint: "染料余量不足或超预算，禁止出送样单" },
  READY: { label: "可出单", cls: "st-ready", hint: "双人签名齐全、校验通过，可生成送样单" },
  ISSUED: { label: "已出单", cls: "st-issued", hint: "送样单已生成，染料已实际扣库" },
  VOID: { label: "已失效留档", cls: "st-void", hint: "配方/预算/色卡变更后归档，由新确认单承接" },
};

export const STATUS_ORDER: SheetStatus[] = [
  "BLOCKED",
  "WEIGH",
  "REVIEW",
  "READY",
  "ISSUED",
  "VOID",
];

export const yuan = (n: number) => `¥${n.toFixed(3)}`;
export const yuan2 = (n: number) => `¥${n.toFixed(2)}`;
export const gram = (n: number) => `${n.toFixed(3)}g`;

export function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
