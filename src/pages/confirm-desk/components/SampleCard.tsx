// 页面层 · 小样卡片：列表行 + 展开核对（成本、双签审批人、版本差异、留档历史）

import { useState } from "react";
import type { ArchiveState } from "../../../archive/seed";
import { historyOf } from "../../../archive/store";
import type { Confirmation } from "../../../calc/types";
import { ApprovalZone } from "./ApprovalZone";
import { CostTable } from "./CostTable";
import { VersionDiff } from "./VersionDiff";
import { StatusBadge, fmtDateTime } from "./common";

interface Props {
  state: ArchiveState;
  sampleId: string;
  defaultOpen?: boolean;
  onWeigh: (id: string, actor: string) => void;
  onReview: (id: string, actor: string, note: string) => void;
  onRecheck: (id: string, actor: string) => void;
  onIssue: (id: string, actor: string) => void;
}

function BindingLine({ state, conf }: { state: ArchiveState; conf: Confirmation }) {
  const sample = state.samples.find((s) => s.id === conf.sampleId);
  const order = state.orders.find((o) => o.id === sample?.orderId);
  const recipe = state.recipes.find((r) => r.id === sample?.recipeId);
  const card = state.cards.find((c) => c.id === sample?.cardId);
  if (!sample || !order || !recipe || !card) return null;
  const stale = sample.recipeVersion !== conf.recipeVersion || sample.cardVersion !== conf.cardVersion;
  return (
    <div className="binding">
      <span>
        订单 <b>{order.id}</b>（{order.customer}）
      </span>
      <i>›</i>
      <span className={sample.recipeVersion !== recipe.versions[recipe.versions.length - 1].version ? "ver-stale" : ""}>
        配方 <b>{recipe.name}</b> v{conf.recipeVersion}
      </span>
      <i>›</i>
      <span className={sample.cardVersion !== card.version ? "ver-stale" : ""}>
        色卡 <b>{card.name}</b> v{conf.cardVersion}
      </span>
      <i>›</i>
      <span>投料 <b>{conf.fabricWeight} kg</b></span>
      {stale && <em className="tag-warn">绑定已非最新</em>}
    </div>
  );
}

function HistoryArchive({ state, sampleId }: { state: ArchiveState; sampleId: string }) {
  const history = historyOf(state, sampleId);
  if (history.length <= 1) {
    return <p className="hint">暂无历史确认单。</p>;
  }
  return (
    <div className="archive-list">
      <p className="subhead">确认单留档（{history.length} 张，最新在前）</p>
      {history.map((c) => (
        <div key={c.id} className={`archive-item status-${c.status}`}>
          <StatusBadge status={c.status} />
          <div>
            <b>{c.id}</b>
            <small>
              配方 v{c.recipeVersion} · 色卡 v{c.cardVersion} · {c.fabricWeight} kg · 预算 ¥{c.budgetSnapshot}
            </small>
            {c.weigher && (
              <small>
                称料：{c.weigher}（{fmtDateTime(c.weighedAt!)}，¥{c.weighedCost}）
              </small>
            )}
            {c.reviewer && (
              <small>
                复核：{c.reviewer}（{fmtDateTime(c.reviewedAt!)}）
              </small>
            )}
            {c.invalidReason && (
              <small className="invalid-text">
                {c.invalidReason}失效 · {fmtDateTime(c.invalidatedAt!)}
              </small>
            )}
            {c.deliveryNo && <small className="dn-text">送样单 {c.deliveryNo}</small>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SampleCard({ state, sampleId, defaultOpen, onWeigh, onReview, onRecheck, onIssue }: Props) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const sample = state.samples.find((s) => s.id === sampleId);
  if (!sample) return null;
  const history = historyOf(state, sampleId);
  const active = history.find((c) => c.status !== "已出样" && c.status !== "已失效");
  const shown = active ?? history[0];
  const previous = history.find((c) => c.seq === shown.seq - 1);

  return (
    <article className={`sample-card status-${shown.status}`}>
      <button className="sample-head" onClick={() => setOpen((v) => !v)}>
        <span className="sample-code">{sample.code}</span>
        <BindingLine state={state} conf={shown} />
        <span className="sample-side">
          <StatusBadge status={shown.status} />
          <span className="chevron">{open ? "收起 ▲" : "展开核对 ▼"}</span>
        </span>
      </button>

      {open && (
        <div className="sample-body">
          <div className="tabs-row">
            <div className="section">
              <p className="subhead">成本核对（按投料计算）</p>
              <CostTable state={state} conf={shown} />
            </div>
            <div className="section">
              <p className="subhead">版本差异</p>
              <VersionDiff state={state} current={shown} previous={previous} />
            </div>
          </div>

          <div className="section">
            <p className="subhead">双人确认与出样</p>
            <ApprovalZone
              conf={shown}
              onWeigh={onWeigh}
              onReview={onReview}
              onRecheck={onRecheck}
              onIssue={onIssue}
            />
          </div>

          <div className="section">
            <p className="subhead">档案</p>
            <HistoryArchive state={state} sampleId={sampleId} />
          </div>
        </div>
      )}
    </article>
  );
}
