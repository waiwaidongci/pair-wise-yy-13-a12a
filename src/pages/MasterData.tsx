import { useMemo, useState } from "react";
import type { Store } from "../archive/store";
import type { RecipeVersion } from "../domain/types";
import { gram, yuan2 } from "./meta";

type TabKey = "dye" | "order" | "recipe" | "card";

export function MasterData({ store }: { store: Store }) {
  const [tab, setTab] = useState<TabKey>("dye");

  return (
    <section className="panel master-panel">
      <div className="heading">
        <div>
          <p>主数据档案</p>
          <h2>染料 / 订单预算 / 配方版本 / 色卡</h2>
        </div>
        <div className="tabs">
          {(
            [
              ["dye", "染料余量"],
              ["order", "订单预算"],
              ["recipe", "配方版本"],
              ["card", "色卡"],
            ] as [TabKey, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              className={tab === k ? "tab active" : "tab"}
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "dye" && <DyeTab store={store} />}
      {tab === "order" && <OrderTab store={store} />}
      {tab === "recipe" && <RecipeTab store={store} />}
      {tab === "card" && <CardTab store={store} />}

      <p className="panel-foot">
        {tab === "dye"
          ? "补料只解除余量不足的待处理单，不触发确认单失效；改单价只影响此后称料。"
          : "配方 / 预算 / 色卡变更会使在途旧确认单失效留档，并自动按新版本生成承接确认单重新称料。"}
      </p>
    </section>
  );
}

const isoNow = () => new Date().toISOString();

function DyeTab({ store }: { store: Store }) {
  const { state, dispatch } = store;
  const [grams, setGrams] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});

  return (
    <div className="master-list">
      {state.dyes.map((d) => (
        <div key={d.id} className="master-row">
          <div className="mr-main">
            <b>{d.name}</b>
            <span>单价 {yuan2(d.pricePerGram)}/g</span>
          </div>
          <div className={`mr-stock ${d.stock < 60 ? "danger" : ""}`}>
            库存 <b>{gram(d.stock)}</b>
          </div>
          <div className="mr-actions">
            <input
              type="number"
              min="0"
              placeholder="补料 g"
              value={grams[d.id] ?? ""}
              onChange={(e) => setGrams((v) => ({ ...v, [d.id]: e.target.value }))}
            />
            <button
              onClick={() => {
                const g = Number(grams[d.id]);
                if (dispatch({ type: "RESTOCK_DYE", dyeId: d.id, grams: g, at: isoNow() }))
                  setGrams((v) => ({ ...v, [d.id]: "" }));
              }}
            >
              补料
            </button>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="新单价"
              value={prices[d.id] ?? ""}
              onChange={(e) => setPrices((v) => ({ ...v, [d.id]: e.target.value }))}
            />
            <button
              onClick={() => {
                const p = Number(prices[d.id]);
                if (dispatch({ type: "SET_DYE_PRICE", dyeId: d.id, price: p, at: isoNow() }))
                  setPrices((v) => ({ ...v, [d.id]: "" }));
              }}
            >
              改单价
            </button>
          </div>
        </div>
      ))}
      <p className="hint">单价只影响此后称料的成本快照，已签名 / 已出单单子成本不变。</p>
    </div>
  );
}

function OrderTab({ store }: { store: Store }) {
  const { state, dispatch, impactCount } = store;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <div className="master-list">
      {state.orders.map((o) => {
        const n = impactCount("budget", o.id);
        const draft = Number(drafts[o.id]);
        const changed = draft > 0 && Math.round(draft * 100) !== Math.round(o.budget * 100);
        return (
          <div key={o.id} className="master-row vertical">
            <div className="mr-line">
              <div className="mr-main">
                <b>{o.id}</b>
                <span>
                  {o.customer} · {o.fabric}
                </span>
              </div>
              <div className="mr-stock">
                预算 <b>{yuan2(o.budget)}</b>
              </div>
            </div>
            <div className="mr-actions">
              <input
                type="number"
                min="0"
                step="0.5"
                placeholder="调整预算（元）"
                value={drafts[o.id] ?? ""}
                onChange={(e) => setDrafts((v) => ({ ...v, [o.id]: e.target.value }))}
              />
              {confirmId === o.id ? (
                <>
                  <span className="warn">
                    将使 {n} 张在途确认单失效留档并生成承接单，确认？
                  </span>
                  <button
                    className="danger-btn"
                    onClick={() => {
                      if (
                        dispatch({
                          type: "CHANGE_BUDGET",
                          orderId: o.id,
                          budget: draft,
                          at: isoNow(),
                        })
                      ) {
                        setConfirmId(null);
                        setDrafts((v) => ({ ...v, [o.id]: "" }));
                      }
                    }}
                  >
                    确认调整
                  </button>
                  <button onClick={() => setConfirmId(null)}>取消</button>
                </>
              ) : (
                <button disabled={!changed} onClick={() => setConfirmId(o.id)}>
                  调整预算{n > 0 ? `（影响 ${n} 单）` : ""}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecipeTab({ store }: { store: Store }) {
  const { state } = store;
  const groups = useMemo(() => {
    const map = new Map<string, RecipeVersion[]>();
    for (const r of state.recipes) {
      map.set(r.recipeId, [...(map.get(r.recipeId) ?? []), r]);
    }
    return [...map.entries()].map(([id, versions]) => ({
      id,
      versions: versions.sort((a, b) => b.version - a.version),
    }));
  }, [state.recipes]);

  return (
    <div className="recipe-groups">
      {groups.map((g) => (
        <RecipeGroup key={g.id} recipeId={g.id} versions={g.versions} store={store} />
      ))}
    </div>
  );
}

function RecipeGroup({
  recipeId,
  versions,
  store,
}: {
  recipeId: string;
  versions: RecipeVersion[];
  store: Store;
}) {
  const { state, dispatch, impactCount } = store;
  const latest = versions[0];
  const n = impactCount("recipe", recipeId);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [bath, setBath] = useState(latest.bathRatio);
  const [curve, setCurve] = useState(latest.tempCurve);
  const [hold, setHold] = useState(String(latest.holdMinutes));
  const [lineVals, setLineVals] = useState<Record<string, string>>(
    Object.fromEntries(latest.lines.map((l) => [l.dyeId, String(l.percent)]))
  );

  const resetForm = () => {
    setBath(latest.bathRatio);
    setCurve(latest.tempCurve);
    setHold(String(latest.holdMinutes));
    setLineVals(Object.fromEntries(latest.lines.map((l) => [l.dyeId, String(l.percent)])));
    setNote("");
  };

  const dyeLabel = (id: string) => state.dyes.find((d) => d.id === id)?.name ?? id;

  return (
    <div className="recipe-group">
      <div className="mr-line">
        <div className="mr-main">
          <b>
            {latest.recipeName} <span className="ver-tag">最新 v{latest.version}</span>
          </b>
          <span>
            {latest.bathRatio} · 保温 {latest.holdMinutes}min ·{" "}
            {latest.lines.map((l) => `${dyeLabel(l.dyeId)} ${l.percent}%`).join("，")}
          </span>
        </div>
        <button
          onClick={() => {
            setOpen((v) => !v);
            resetForm();
          }}
        >
          {open ? "收起" : `发布新版本${n > 0 ? `（影响 ${n} 单）` : ""}`}
        </button>
      </div>
      {open && (
        <div className="new-version-form">
          <div className="nv-grid">
            <label>
              <span>浴比</span>
              <input value={bath} onChange={(e) => setBath(e.target.value)} />
            </label>
            <label>
              <span>保温时间（min）</span>
              <input type="number" value={hold} onChange={(e) => setHold(e.target.value)} />
            </label>
            <label className="wide">
              <span>温度曲线 / 工艺说明</span>
              <input value={curve} onChange={(e) => setCurve(e.target.value)} />
            </label>
            <label className="wide">
              <span>变更说明</span>
              <input
                value={note}
                placeholder="如：客户反馈偏深，下调红相"
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          </div>
          <div className="nv-lines">
            {state.dyes.map((d) => (
              <label key={d.id} className="nv-line">
                <span>{d.name} %</span>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  value={lineVals[d.id] ?? ""}
                  onChange={(e) =>
                    setLineVals((v) => ({ ...v, [d.id]: e.target.value }))
                  }
                />
              </label>
            ))}
          </div>
          <div className="nv-actions">
            {n > 0 && <span className="warn">发布后 {n} 张在途单失效留档并自动承接</span>}
            <button
              className="primary"
              onClick={() => {
                const lines = Object.entries(lineVals)
                  .map(([dyeId, v]) => ({ dyeId, percent: Number(v) }))
                  .filter((l) => l.percent > 0);
                if (
                  dispatch({
                    type: "NEW_RECIPE_VERSION",
                    recipeId,
                    bathRatio: bath,
                    tempCurve: curve,
                    holdMinutes: Number(hold),
                    lines,
                    note,
                    at: isoNow(),
                  })
                )
                  setOpen(false);
              }}
            >
              发布 v{latest.version + 1}
            </button>
          </div>
        </div>
      )}
      <details className="history">
        <summary>历史版本（{versions.length}）</summary>
        {versions.map((v) => (
          <div key={v.id} className="history-item">
            <b>v{v.version}</b>
            <span>
              {v.lines.map((l) => `${dyeLabel(l.dyeId)} ${l.percent}%`).join("，")} ·{" "}
              {v.bathRatio} · 保温{v.holdMinutes}min
            </span>
            {v.note && <span className="muted">{v.note}</span>}
          </div>
        ))}
      </details>
    </div>
  );
}

function CardTab({ store }: { store: Store }) {
  const { state, dispatch, impactCount } = store;
  const [drafts, setDrafts] = useState<
    Record<string, { name: string; swatch: string }>
  >({});
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <div className="master-list">
      {state.colorCards.map((c) => {
        const n = impactCount("colorCard", c.id);
        const d = drafts[c.id] ?? { name: c.name, swatch: c.swatch };
        const changed =
          d.name !== c.name || d.swatch.toLowerCase() !== c.swatch.toLowerCase();
        return (
          <div key={c.id} className="master-row vertical">
            <div className="mr-line">
              <div className="mr-main card-name">
                <b>
                  <i className="swatch" style={{ background: c.swatch }} />
                  {c.code} · 第{c.revision}版
                </b>
                <span>{c.name}</span>
              </div>
              <div className="mr-stock muted">修订 {c.revisedAt.slice(0, 10)}</div>
            </div>
            <div className="mr-actions">
              <input
                value={d.name}
                onChange={(e) =>
                  setDrafts((v) => ({ ...v, [c.id]: { ...d, name: e.target.value } }))
                }
              />
              <input
                className="swatch-input"
                value={d.swatch}
                onChange={(e) =>
                  setDrafts((v) => ({ ...v, [c.id]: { ...d, swatch: e.target.value } }))
                }
              />
              <input
                type="color"
                className="color-picker"
                value={/^#[0-9a-fA-F]{6}$/.test(d.swatch) ? d.swatch : "#000000"}
                onChange={(e) =>
                  setDrafts((v) => ({ ...v, [c.id]: { ...d, swatch: e.target.value } }))
                }
              />
              {confirmId === c.id ? (
                <>
                  <span className="warn">将使 {n} 张在途单失效留档并承接？</span>
                  <button
                    className="danger-btn"
                    onClick={() => {
                      if (
                        dispatch({
                          type: "REVISE_COLOR_CARD",
                          colorCardId: c.id,
                          name: d.name,
                          swatch: d.swatch,
                          at: isoNow(),
                        })
                      )
                        setConfirmId(null);
                    }}
                  >
                    修订发布
                  </button>
                  <button onClick={() => setConfirmId(null)}>取消</button>
                </>
              ) : (
                <button disabled={!changed} onClick={() => setConfirmId(c.id)}>
                  修订色卡{n > 0 ? `（影响 ${n} 单）` : ""}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
