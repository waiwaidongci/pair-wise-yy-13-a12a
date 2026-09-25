import { useMemo, useRef, useState } from "react";
import type { SheetStatus } from "../domain/types";
import type { Store } from "../archive/store";
import { sheetCost } from "../domain/calculations";
import { STATUS_META, STATUS_ORDER, yuan } from "./meta";
import { SheetDetail } from "./SheetDetail";

const isoNow = () => new Date().toISOString();

export function ConfirmStation({ store }: { store: Store }) {
  const { state, dispatch, showFlash } = store;
  const [orderFilter, setOrderFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<SheetStatus | "ALL">("ALL");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const locate = (id: string) => {
    setOrderFilter("ALL");
    setStatusFilter("ALL");
    setExpanded((prev) => new Set(prev).add(id));
    requestAnimationFrame(() => {
      document
        .getElementById(`sheet-row-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const visibleSheets = useMemo(() => {
    return state.sheets
      .filter((s) => (orderFilter === "ALL" ? true : s.orderId === orderFilter))
      .filter((s) => (statusFilter === "ALL" ? true : s.status === statusFilter))
      .sort((a, b) => Number(b.sampleCode.slice(2)) - Number(a.sampleCode.slice(2)));
  }, [state.sheets, orderFilter, statusFilter]);

  const counts = useMemo(() => {
    const c = new Map<SheetStatus, number>();
    for (const s of state.sheets) c.set(s.status, (c.get(s.status) ?? 0) + 1);
    return c;
  }, [state.sheets]);

  const handleWeigh = (
    sheetId: string,
    staffId: string,
    actual: Record<string, number>
  ) => {
    if (
      dispatch({ type: "WEIGH_SIGN", sheetId, staffId, actual, at: isoNow() })
    ) {
      const s = state.sheets.find((x) => x.id === sheetId);
      showFlash("称料签名完成，已校验余量与预算");
      void s;
    }
  };
  const handleReviewPass = (sheetId: string, staffId: string) => {
    if (dispatch({ type: "REVIEW_PASS", sheetId, staffId, at: isoNow() }))
      showFlash("复核完成");
  };
  const handleReviewReject = (sheetId: string, staffId: string, reason: string) => {
    if (dispatch({ type: "REVIEW_REJECT", sheetId, staffId, reason, at: isoNow() }))
      showFlash("已退回重新称料");
  };
  const handleIssue = (sheetId: string) => {
    if (dispatch({ type: "ISSUE_DELIVERY", sheetId, at: isoNow() }))
      showFlash("送样单已生成，染料库存已扣减");
  };

  return (
    <section className="panel station-panel">
      <div className="heading">
        <div>
          <p>送样确认台</p>
          <h2>小样送样确认单</h2>
        </div>
        <button className="primary" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "收起新建" : "+ 新建小样确认单"}
        </button>
      </div>

      {showCreate && (
        <CreateSheetForm
          store={store}
          onCreated={(id) => {
            setShowCreate(false);
            setOrderFilter("ALL");
            setStatusFilter("ALL");
            setExpanded((prev) => new Set(prev).add(id));
          }}
        />
      )}

      <div className="filter-bar">
        <div className="filter-group">
          <span>按订单</span>
          <button
            className={orderFilter === "ALL" ? "chip active" : "chip"}
            onClick={() => setOrderFilter("ALL")}
          >
            全部
          </button>
          {state.orders.map((o) => (
            <button
              key={o.id}
              className={orderFilter === o.id ? "chip active" : "chip"}
              onClick={() => setOrderFilter(o.id)}
            >
              {o.id} · {o.customer}
            </button>
          ))}
        </div>
        <div className="filter-group">
          <span>按状态</span>
          <button
            className={statusFilter === "ALL" ? "chip active" : "chip"}
            onClick={() => setStatusFilter("ALL")}
          >
            全部
          </button>
          {STATUS_ORDER.map((st) => (
            <button
              key={st}
              className={statusFilter === st ? `chip active ${STATUS_META[st].cls}` : `chip ${STATUS_META[st].cls}`}
              onClick={() => setStatusFilter(st)}
            >
              {STATUS_META[st].label}
              <em>{counts.get(st) ?? 0}</em>
            </button>
          ))}
        </div>
      </div>

      <div className="sheet-list">
        {visibleSheets.length === 0 && (
          <p className="empty">当前筛选下没有确认单。</p>
        )}
        {visibleSheets.map((sheet) => {
          const meta = STATUS_META[sheet.status];
          const order = state.orders.find((o) => o.id === sheet.orderId)!;
          const recipe =
            state.recipes.find((r) => r.id === sheet.recipeVersionId) ??
            sheet.snapshot?.recipe;
          const card =
            state.colorCards.find((c) => c.id === sheet.colorCardId) ??
            sheet.snapshot?.colorCard;
          const open = expanded.has(sheet.id);
          return (
            <article
              key={sheet.id}
              id={`sheet-row-${sheet.id}`}
              className={`sheet-card status-${sheet.status.toLowerCase()} ${open ? "open" : ""}`}
            >
              <header className="sheet-head" onClick={() => toggle(sheet.id)}>
                <div className="sh-left">
                  <b className="sample-code">{sheet.sampleCode}</b>
                  <span className="order-tag">{order.id}</span>
                </div>
                <div className="sh-mid">
                  <span>
                    {recipe?.recipeName} v{recipe?.version}
                  </span>
                  <span className="card-mini">
                    <i className="swatch" style={{ background: card?.swatch }} />
                    {card?.code}·第{card?.revision}版
                  </span>
                  <span>{sheet.fabricWeight}g</span>
                  <span className="cost-mini">{yuan(sheetCost(sheet))}</span>
                </div>
                <div className="sh-right">
                  <span className={`badge ${meta.cls}`}>{meta.label}</span>
                  <span className="expand-hint">{open ? "收起 ▲" : "展开核对 ▼"}</span>
                </div>
              </header>
              {open && (
                <div className="sheet-body">
                  <SheetDetail
                    sheet={sheet}
                    state={state}
                    interactive={sheet.status !== "ISSUED" && sheet.status !== "VOID"}
                    onWeigh={handleWeigh}
                    onReviewPass={handleReviewPass}
                    onReviewReject={handleReviewReject}
                    onIssue={handleIssue}
                    onLocate={locate}
                  />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CreateSheetForm({
  store,
  onCreated,
}: {
  store: Store;
  onCreated: (id: string) => void;
}) {
  const { state, dispatch } = store;
  // 创建前先登记预计单号；引擎成功后 seqSample 与该单号一致
  const pendingCodeRef = useRef<string | null>(null);
  const [orderId, setOrderId] = useState(state.orders[0]?.id ?? "");
  const [recipeVersionId, setRecipeVersionId] = useState(
    state.recipes
      .filter((r) => r.recipeId === state.recipes[0]?.recipeId)
      .sort((a, b) => b.version - a.version)[0]?.id ?? ""
  );
  const [colorCardId, setColorCardId] = useState(state.colorCards[0]?.id ?? "");
  const [weight, setWeight] = useState("25");

  const recipeGroups = useMemo(() => {
    const map = new Map<string, typeof state.recipes>();
    for (const r of state.recipes)
      map.set(r.recipeId, [...(map.get(r.recipeId) ?? []), r]);
    return [...map.values()].map((vs) => vs.sort((a, b) => b.version - a.version));
  }, [state.recipes]);

  return (
    <div className="create-form">
      <div className="cf-grid">
        <label>
          <span>绑定订单</span>
          <select value={orderId} onChange={(e) => setOrderId(e.target.value)}>
            {state.orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.id} · {o.customer} · {o.fabric}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>绑定配方版本</span>
          <select
            value={recipeVersionId}
            onChange={(e) => setRecipeVersionId(e.target.value)}
          >
            {recipeGroups.map((vs) =>
              vs.map((r, i) => (
                <option key={r.id} value={r.id}>
                  {r.recipeName} v{r.version}
                  {i === 0 ? "（最新）" : "（历史）"}
                </option>
              ))
            )}
          </select>
        </label>
        <label>
          <span>绑定色卡</span>
          <select value={colorCardId} onChange={(e) => setColorCardId(e.target.value)}>
            {state.colorCards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} 第{c.revision}版 · {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>布样重量（g）</span>
          <input
            type="number"
            min="1"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </label>
      </div>
      <button
        className="primary"
        onClick={() => {
          pendingCodeRef.current = `S-${state.seqSample + 1}`;
          const code = pendingCodeRef.current;
          const ok = dispatch({
            type: "CREATE_SHEET",
            orderId,
            recipeVersionId,
            colorCardId,
            fabricWeight: Number(weight),
            at: isoNow(),
          });
          if (ok) {
            setTimeout(() => {
              const created = store.state.sheets.find(
                (s) => s.sampleCode === code
              );
              if (created) onCreated(created.id);
            }, 0);
          }
        }}
      >
        创建确认单（进入待称料）
      </button>
      <p className="hint">创建即固化主数据快照；之后配方 / 预算 / 色卡变更，本单会失效留档并由承接单延续。</p>
    </div>
  );
}
