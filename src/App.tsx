import { useMemo, useState } from "react";
import "./styles.css";
import { useStore } from "./archive/store";
import { sheetCost } from "./domain/calculations";
import { ConfirmStation } from "./pages/ConfirmStation";
import { MasterData } from "./pages/MasterData";
import { fmtTime, STATUS_META } from "./pages/meta";

type View = "station" | "archive";

function App() {
  const store = useStore();
  const { state, error, flash, resetDemo } = store;
  const [view, setView] = useState<View>("station");

  const metrics = useMemo(() => {
    const total = state.sheets.filter((s) => s.status !== "VOID").length;
    const blocked = state.sheets.filter((s) => s.status === "BLOCKED").length;
    const issued = state.sheets.filter((s) => s.status === "ISSUED").length;
    const issuedCost = state.sheets
      .filter((s) => s.status === "ISSUED")
      .reduce((sum, s) => sum + sheetCost(s), 0);
    return { total, blocked, issued, issuedCost };
  }, [state.sheets]);

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <h1>小样送样确认台</h1>
          <p>
            绑定订单 · 配方版本 · 色卡 ｜ 称料与复核双人分别确认 ｜
            按投料算成本，余量不足 / 超预算一律停在待处理，禁止出送样单
          </p>
        </div>
        <div className="topbar-actions">
          <button
            className={view === "station" ? "view-btn active" : "view-btn"}
            onClick={() => setView("station")}
          >
            确认台
          </button>
          <button
            className={view === "archive" ? "view-btn active" : "view-btn"}
            onClick={() => setView("archive")}
          >
            操作档案
          </button>
          <button className="view-btn ghost" onClick={resetDemo}>
            重置演示数据
          </button>
        </div>
      </header>

      <section className="metrics">
        <article>
          <small>在途小样确认单</small>
          <strong>{metrics.total}</strong>
        </article>
        <article className={metrics.blocked ? "metric-danger" : ""}>
          <small>待处理（余量/预算拦截）</small>
          <strong>{metrics.blocked}</strong>
        </article>
        <article>
          <small>已出送样单</small>
          <strong>{metrics.issued}</strong>
        </article>
        <article>
          <small>已出单投料成本</small>
          <strong>¥{metrics.issuedCost.toFixed(2)}</strong>
        </article>
      </section>

      {error && <div className="toast toast-error">⚠ {error}</div>}
      {flash && <div className="toast toast-flash">✓ {flash}</div>}

      {view === "station" ? (
        <>
          <ConfirmStation store={store} />
          <MasterData store={store} />
        </>
      ) : (
        <ArchiveView store={store} onJump={() => setView("station")} />
      )}

      <footer className="footnote">
        分层说明：计算（src/domain/calculations.ts 纯函数）｜
        档案（src/archive 状态机 · 事件台账 · localStorage 落档）｜
        页面（src/pages 仅渲染与交互）
      </footer>
    </main>
  );
}

function ArchiveView({
  store,
  onJump,
}: {
  store: ReturnType<typeof useStore>;
  onJump: () => void;
}) {
  const { state } = store;
  const events = [...state.ledger].sort((a, b) => b.id - a.id);

  return (
    <section className="panel archive-panel">
      <div className="heading">
        <div>
          <p>档案</p>
          <h2>事件台账（全部操作不可变留痕）</h2>
        </div>
        <button onClick={onJump}>返回确认台</button>
      </div>
      <table className="ledger-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>小样</th>
            <th>动作</th>
            <th>说明</th>
            <th>操作人</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className={`evt evt-${e.type.toLowerCase()}`}>
              <td>{fmtTime(e.at)}</td>
              <td>{e.sampleCode}</td>
              <td>
                <span className={`evt-badge evt-${e.type.toLowerCase()}`}>
                  {eventLabel(e.type)}
                </span>
              </td>
              <td>{e.detail}</td>
              <td>{e.staffName ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="void-title">已失效留档确认单</h3>
      <div className="void-archive">
        {state.sheets.filter((s) => s.status === "VOID").length === 0 && (
          <p className="empty">暂无失效单据。</p>
        )}
        {state.sheets
          .filter((s) => s.status === "VOID")
          .sort((a, b) => Number(b.sampleCode.slice(2)) - Number(a.sampleCode.slice(2)))
          .map((s) => {
            const succ = state.sheets.find((x) => x.id === s.successorId);
            return (
              <div key={s.id} className="void-record">
                <div>
                  <b>{s.sampleCode}</b>
                  <span className={`badge ${STATUS_META.VOID.cls}`}>失效留档</span>
                </div>
                <p>{s.voidReason}</p>
                <small>
                  {fmtTime(s.voidedAt)} · 承接单：
                  {succ ? `${succ.sampleCode}（${STATUS_META[succ.status].label}）` : "—"}
                </small>
              </div>
            );
          })}
      </div>
    </section>
  );
}

function eventLabel(type: string): string {
  const map: Record<string, string> = {
    SHEET_CREATED: "建单",
    WEIGH_SIGNED: "称料签名",
    REVIEW_PASSED: "复核通过",
    REVIEW_REJECTED: "复核退回",
    DELIVERY_ISSUED: "出送样单",
    SHEET_VOIDED: "失效留档",
  };
  return map[type] ?? type;
}

export default App;
