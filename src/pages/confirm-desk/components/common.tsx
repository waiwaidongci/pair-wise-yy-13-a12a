// 页面层 · 共享小组件

import type { ConfirmStatus } from "../../../calc/types";

export function StatusBadge({ status }: { status: ConfirmStatus }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

export function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="meta">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

export const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours(),
  )}:${p(d.getMinutes())}`;
};
