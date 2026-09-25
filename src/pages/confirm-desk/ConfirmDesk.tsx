// 页面层 · 送样确认台页面：状态接入 + 按订单/状态查看 + 指标 + 主数据/档案/送样单组合

import { useMemo, useReducer, useState } from "react";
import { archiveReducer, seedState } from "../../archive/store";
import type { Confirmation, ConfirmStatus, RecipeItem } from "../../calc/types";
import { AuditTrail } from "./components/AuditTrail";
import { DeliverySlip } from "./components/DeliverySlip";
import { MasterPanel } from "./components/MasterPanel";
import { SampleCard } from "./components/SampleCard";

const STATUS_FILTERS: (ConfirmStatus | "全部")[] = [
  "全部",
  "待称料",
  "待复核",
  "待处理",
  "待出样",
  "已出样",
  "已失效",
];

const STAFF = ["周敏", "孙立", "陈立", "林芳"];

export function ConfirmDesk() {
  const [state, dispatch] = useReducer(archiveReducer, seedState);
  const [orderFilter, setOrderFilter] = useState<string>("全部");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("全部");
  const [keyword, setKeyword] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [slipId, setSlipId] = useState<string | null>(null);
  const [showMaster, setShowMaster] = useState(false);

  const run = (desc: string, fn: () => void) => {
    try {
      fn();
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e));
      window.setTimeout(() => setToast(null), 3200);
      return;
    }
    if (desc) {
      setToast(desc);
      window.setTimeout(() => setToast(null), 2600);
    }
  };

  // 小样 → 当前展示确认单（活动态优先；已全部出样/失效则取最新一张）
  const rows = useMemo(() => {
    const confOf = (sampleId: string): Confirmation => {
      const list = state.confirmations
        .filter((c) => c.sampleId === sampleId)
        .sort((a, b) => b.seq - a.seq);
      return list.find((c) => c.status !== "已出样" && c.status !== "已失效") ?? list[0];
    };
    return state.samples
      .map((s) => ({ sample: s, conf: confOf(s.id) }))
      .filter(({ sample, conf }) => {
        if (orderFilter !== "全部" && sample.orderId !== orderFilter) return false;
        if (statusFilter !== "全部" && conf.status !== statusFilter) return false;
        if (keyword.trim() && !sample.code.toLowerCase().includes(keyword.trim().toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => a.sample.code.localeCompare(b.sample.code));
  }, [state, orderFilter, statusFilter, keyword]);

  const metrics = useMemo(() => {
    const active = state.samples
      .map((s) =>
        state.confirmations
          .filter((c) => c.sampleId === s.id)
          .sort((x, y) => y.seq - x.seq)
          .find((c) => c.status !== "已出样" && c.status !== "已失效"),
      )
      .filter((c): c is Confirmation => Boolean(c));
    return {
      total: state.samples.length,
      waitingWeigh: active.filter((c) => c.status === "待称料").length,
      blocked: active.filter((c) => c.status === "待处理").length,
      readyIssue: active.filter((c) => c.status === "待出样").length,
      issued: state.confirmations.filter((c) => c.status === "已出样").length,
    };
  }, [state]);

  const latestSlip = state.confirmations
    .filter((c) => c.status === "已出样")
    .sort((a, b) => (a.issuedAt! < b.issuedAt! ? 1 : -1))[0];

  return (
    <main className="app desk">
      <datalist id="staff-list">
        {STAFF.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <section className="hero desk-hero">
        <p>hxyfront-62012 · 送样确认台 · Port 62012</p>
        <h1>小样送样确认台</h1>
        <span>
          每个小样绑定客户订单、配方版本与色卡版本；称料、复核两人分别签名确认。按投料计算染料成本，
          染料余量不足或超出订单预算即停在「待处理」，不能出送样单；配方 / 预算 / 色卡变更后旧确认单失效留档，按新版本重新称料。
        </span>
        <div className="hero-actions">
          <button className="primary" onClick={() => setShowMaster((v) => !v)}>
            {showMaster ? "收起维护台" : "主数据维护 / 新建小样"}
          </button>
          {latestSlip && (
            <button className="ghost" onClick={() => setSlipId(latestSlip.id)}>
              查看最新送样单（{latestSlip.deliveryNo}）
            </button>
          )}
        </div>
      </section>

      <section className="metrics">
        <article><small>小样总数</small><strong>{metrics.total}</strong></article>
        <article><small>待称料</small><strong>{metrics.waitingWeigh}</strong></article>
        <article className={metrics.blocked ? "metric-warn" : ""}><small>待处理（余量/预算阻断）</small><strong>{metrics.blocked}</strong></article>
        <article className={metrics.readyIssue ? "metric-go" : ""}><small>待出样（双签齐备）</small><strong>{metrics.readyIssue}</strong></article>
        <article><small>已出送样单</small><strong>{metrics.issued}</strong></article>
      </section>

      {showMaster && (
        <MasterPanel
          state={state}
          handlers={{
            onBumpRecipe: (recipeId, note, items, actor) =>
              run("新版本已发布，旧确认单失效留档并已重建", () =>
                dispatch({ type: "bumpRecipe", recipeId, note, items: items as RecipeItem[], actor })),
            onBumpCard: (cardId, target, actor) =>
              run("色卡已升版，相关旧确认单失效留档并已重建", () => dispatch({ type: "bumpCard", cardId, target, actor })),
            onAdjustBudget: (orderId, budget, actor) =>
              run("预算已调整，相关确认单失效留档并已重建", () => dispatch({ type: "adjustBudget", orderId, budget, actor })),
            onRestock: (dyeId, amount, actor) =>
              run("补库已入账，可对待处理单重新核对", () => dispatch({ type: "restock", dyeId, amount, actor })),
            onCreateSample: (input) =>
              run("小样已创建，生成待称料确认单", () => dispatch({ type: "createSample", ...input })),
          }}
        />
      )}

      <section className="panel list-panel">
        <div className="heading">
          <div>
            <p>按订单与状态查看</p>
            <h2>确认单列表</h2>
          </div>
          <input
            className="search"
            placeholder="搜索小样编号，如 LAB-621"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>

        <div className="filter-bar">
          <div className="chips">
            {["全部", ...state.orders.map((o) => o.id)].map((id) => (
              <button
                key={id}
                className={orderFilter === id ? "chip-on" : ""}
                onClick={() => setOrderFilter(id)}
              >
                {id === "全部" ? "全部订单" : `${id} · ${state.orders.find((o) => o.id === id)?.customer}`}
              </button>
            ))}
          </div>
          <div className="chips">
            {STATUS_FILTERS.map((s) => (
              <button key={s} className={statusFilter === s ? "chip-on" : ""} onClick={() => setStatusFilter(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="sample-list">
          {rows.length === 0 && <p className="hint empty">当前筛选下没有小样。</p>}
          {rows.map(({ sample, conf }) => (
            <SampleCard
              key={sample.id}
              state={state}
              sampleId={sample.id}
              defaultOpen={conf.status === "待处理"}
              onWeigh={(id, actor) => run("", () => dispatch({ type: "weigh", confirmationId: id, actor }))}
              onReview={(id, actor, note) => run("复核完成，转待出样", () => dispatch({ type: "review", confirmationId: id, actor, note }))}
              onRecheck={(id, actor) => run("", () => dispatch({ type: "recheck", confirmationId: id, actor }))}
              onIssue={(id, actor) =>
                run("送样单已出具，库存与预算已扣减", () => {
                  dispatch({ type: "issue", confirmationId: id, actor });
                  setSlipId(id);
                })
              }
            />
          ))}
        </div>
      </section>

      <AuditTrail state={state} />

      <DeliverySlip state={state} confirmationId={slipId} onClose={() => setSlipId(null)} />

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
