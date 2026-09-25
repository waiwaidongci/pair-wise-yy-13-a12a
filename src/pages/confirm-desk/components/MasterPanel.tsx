// 页面层 · 主数据维护：配方升版、色卡升版、订单预算调整、染料补库、新建小样

import { useState, type ReactNode } from "react";
import type { ArchiveState } from "../../../archive/seed";
import { latestRecipeVersion } from "../../../archive/store";
import type { RecipeItem } from "../../../calc/types";

interface Handlers {
  onBumpRecipe: (recipeId: string, note: string, items: RecipeItem[], actor: string) => void;
  onBumpCard: (cardId: string, target: { DL: number; Da: number; Db: number }, actor: string) => void;
  onAdjustBudget: (orderId: string, budget: number, actor: string) => void;
  onRestock: (dyeId: string, amount: number, actor: string) => void;
  onCreateSample: (input: {
    code: string;
    orderId: string;
    recipeId: string;
    cardId: string;
    fabricWeight: number;
    actor: string;
  }) => void;
}

function PanelCard({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <div className="master-card">
      <h4>{title}</h4>
      <p className="hint">{desc}</p>
      {children}
    </div>
  );
}

function ActorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="actor-input">
      <span>经办人</span>
      <input list="staff-list" placeholder="签名后生效" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function MasterPanel({ state, handlers }: { state: ArchiveState; handlers: Handlers }) {
  const [tab, setTab] = useState<"recipe" | "card" | "budget" | "stock" | "new">("recipe");

  return (
    <section className="panel master-panel">
      <div className="heading">
        <div>
          <p>主数据与变更</p>
          <h2>维护台</h2>
        </div>
      </div>
      <nav className="master-tabs">
        <button className={tab === "recipe" ? "active" : ""} onClick={() => setTab("recipe")}>配方升版</button>
        <button className={tab === "card" ? "active" : ""} onClick={() => setTab("card")}>色卡升版</button>
        <button className={tab === "budget" ? "active" : ""} onClick={() => setTab("budget")}>预算调整</button>
        <button className={tab === "stock" ? "active" : ""} onClick={() => setTab("stock")}>染料补库</button>
        <button className={tab === "new" ? "active" : ""} onClick={() => setTab("new")}>新建小样</button>
      </nav>

      {tab === "recipe" && <RecipeBump state={state} onBumpRecipe={handlers.onBumpRecipe} />}
      {tab === "card" && <CardBump state={state} onBumpCard={handlers.onBumpCard} />}
      {tab === "budget" && <BudgetAdjust state={state} onAdjustBudget={handlers.onAdjustBudget} />}
      {tab === "stock" && <Restock state={state} onRestock={handlers.onRestock} />}
      {tab === "new" && <NewSample state={state} onCreateSample={handlers.onCreateSample} />}
    </section>
  );
}

function RecipeBump({
  state,
  onBumpRecipe,
}: {
  state: ArchiveState;
  onBumpRecipe: Handlers["onBumpRecipe"];
}) {
  const [recipeId, setRecipeId] = useState(state.recipes[0].id);
  const recipe = state.recipes.find((r) => r.id === recipeId)!;

  return (
    <PanelCard
      title={`配方升版 · ${recipe.name}（当前 v${latestRecipeVersion(recipe).version}）`}
      desc="保存后生成 v(当前+1)；引用该配方且未出样的旧确认单立即失效留档，并按新版本重新生成、重新称料。"
    >
      <label className="row-input wide">
        <span>选择配方</span>
        <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
          {state.recipes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.id} · {r.name}（最新 v{latestRecipeVersion(r).version}）
            </option>
          ))}
        </select>
      </label>
      <RecipeBumpForm key={recipeId} state={state} recipeId={recipeId} onBumpRecipe={onBumpRecipe} />
    </PanelCard>
  );
}

function RecipeBumpForm({
  state,
  recipeId,
  onBumpRecipe,
}: {
  state: ArchiveState;
  recipeId: string;
  onBumpRecipe: Handlers["onBumpRecipe"];
}) {
  const recipe = state.recipes.find((r) => r.id === recipeId)!;
  const latest = latestRecipeVersion(recipe);
  const [items, setItems] = useState<RecipeItem[]>(latest.items.map((i) => ({ ...i })));
  const [note, setNote] = useState("");
  const [actor, setActor] = useState("");

  const setPercent = (dyeId: string, percent: number) =>
    setItems((list) => list.map((it) => (it.dyeId === dyeId ? { ...it, percent } : it)));

  return (
    <div className="form-rows">
      {items.map((it) => {
        const dye = state.dyes.find((d) => d.id === it.dyeId);
        return (
          <label key={it.dyeId} className="row-input">
            <span>{dye?.name ?? it.dyeId} 投染 %</span>
            <input
              type="number"
              step="0.05"
              value={it.percent}
              onChange={(e) => setPercent(it.dyeId, Number(e.target.value))}
            />
          </label>
        );
      })}
      <label className="row-input wide">
        <span>改版说明</span>
        <input placeholder="如：客户来样偏黄，提高红相" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <ActorField value={actor} onChange={setActor} />
      <button
        className="primary"
        disabled={!actor.trim() || items.some((i) => !(i.percent > 0))}
        onClick={() => {
          onBumpRecipe(recipeId, note, items, actor.trim());
          setNote("");
          setActor("");
        }}
      >
        发布新版本并作废旧单
      </button>
    </div>
  );
}

function CardBump({ state, onBumpCard }: { state: ArchiveState; onBumpCard: Handlers["onBumpCard"] }) {
  const [cardId, setCardId] = useState(state.cards[0].id);
  const card = state.cards.find((c) => c.id === cardId)!;

  return (
    <PanelCard
      title={`色卡升版 · ${card.name}（当前 v${card.version}）`}
      desc="更新目标 Lab 后版本号 +1，引用该色卡的未出样确认单失效留档并按新色卡重建。"
    >
      <label className="row-input wide">
        <span>选择色卡</span>
        <select value={cardId} onChange={(e) => setCardId(e.target.value)}>
          {state.cards.map((c) => (
            <option key={c.id} value={c.id}>{c.id} · {c.name}（v{c.version}）</option>
          ))}
        </select>
      </label>
      <CardBumpForm key={cardId} state={state} cardId={cardId} onBumpCard={onBumpCard} />
    </PanelCard>
  );
}

function CardBumpForm({
  state,
  cardId,
  onBumpCard,
}: {
  state: ArchiveState;
  cardId: string;
  onBumpCard: Handlers["onBumpCard"];
}) {
  const card = state.cards.find((c) => c.id === cardId)!;
  const [lab, setLab] = useState(card.target);
  const [actor, setActor] = useState("");

  const upd = (k: keyof typeof lab, v: number) => setLab((p) => ({ ...p, [k]: v }));

  return (
    <div className="form-rows">
      <label className="row-input"><span>目标 L*</span><input type="number" step="0.1" value={lab.DL} onChange={(e) => upd("DL", Number(e.target.value))} /></label>
      <label className="row-input"><span>目标 a*</span><input type="number" step="0.1" value={lab.Da} onChange={(e) => upd("Da", Number(e.target.value))} /></label>
      <label className="row-input"><span>目标 b*</span><input type="number" step="0.1" value={lab.Db} onChange={(e) => upd("Db", Number(e.target.value))} /></label>
      <ActorField value={actor} onChange={setActor} />
      <button className="primary" disabled={!actor.trim()} onClick={() => { onBumpCard(cardId, lab, actor.trim()); setActor(""); }}>
        发布新色卡并作废旧单
      </button>
    </div>
  );
}

function BudgetAdjust({ state, onAdjustBudget }: { state: ArchiveState; onAdjustBudget: Handlers["onAdjustBudget"] }) {
  const [orderId, setOrderId] = useState(state.orders[0].id);
  const order = state.orders.find((o) => o.id === orderId)!;

  return (
    <PanelCard title={`预算调整 · ${order.id}（${order.customer}）`} desc="预算变更后，该订单未出样的确认单失效留档并按新预算重建；预算不得低于已占用金额。">
      <label className="row-input wide">
        <span>选择订单</span>
        <select value={orderId} onChange={(e) => setOrderId(e.target.value)}>
          {state.orders.map((o) => (
            <option key={o.id} value={o.id}>{o.id} · {o.customer}</option>
          ))}
        </select>
      </label>
      <BudgetAdjustForm key={orderId} state={state} orderId={orderId} onAdjustBudget={onAdjustBudget} />
    </PanelCard>
  );
}

function BudgetAdjustForm({
  state,
  orderId,
  onAdjustBudget,
}: {
  state: ArchiveState;
  orderId: string;
  onAdjustBudget: Handlers["onAdjustBudget"];
}) {
  const order = state.orders.find((o) => o.id === orderId)!;
  const [budget, setBudget] = useState(order.budget);
  const [actor, setActor] = useState("");

  return (
    <div className="form-rows">
      <label className="row-input"><span>染料预算（元）</span><input type="number" step="0.5" value={budget} onChange={(e) => setBudget(Number(e.target.value))} /></label>
      <label className="row-input"><span>已占用（元）</span><input value={order.spent} disabled /></label>
      <ActorField value={actor} onChange={setActor} />
      <button
        className="primary"
        disabled={!actor.trim() || budget < order.spent}
        onClick={() => { onAdjustBudget(orderId, budget, actor.trim()); setActor(""); }}
      >
        调整预算并作废旧单
      </button>
    </div>
  );
}

function Restock({ state, onRestock }: { state: ArchiveState; onRestock: Handlers["onRestock"] }) {
  const [dyeId, setDyeId] = useState(state.dyes[0].id);
  const [amount, setAmount] = useState(1);
  const [actor, setActor] = useState("");
  return (
    <PanelCard title="染料补库" desc="补库不会自动放行，需对「待处理」确认单点「重新核对」通过后方可继续复核、出样。">
      <div className="form-rows">
        <label className="row-input">
          <span>染料（当前余量 kg）</span>
          <select value={dyeId} onChange={(e) => setDyeId(e.target.value)}>
            {state.dyes.map((d) => (
              <option key={d.id} value={d.id}>{d.name} · 库存 {d.stock} kg · ¥{d.unitPrice}/kg</option>
            ))}
          </select>
        </label>
        <label className="row-input"><span>补库数量 kg</span><input type="number" step="0.1" min="0" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></label>
        <ActorField value={actor} onChange={setActor} />
        <button className="primary" disabled={!actor.trim() || !(amount > 0)} onClick={() => { onRestock(dyeId, amount, actor.trim()); setActor(""); }}>
          补库入库
        </button>
      </div>
    </PanelCard>
  );
}

function NewSample({ state, onCreateSample }: { state: ArchiveState; onCreateSample: Handlers["onCreateSample"] }) {
  const [code, setCode] = useState("");
  const [orderId, setOrderId] = useState(state.orders[0].id);
  const [recipeId, setRecipeId] = useState(state.recipes[0].id);
  const [cardId, setCardId] = useState(state.cards[0].id);
  const [weight, setWeight] = useState(0.5);
  const [actor, setActor] = useState("");
  const recipe = state.recipes.find((r) => r.id === recipeId)!;
  const card = state.cards.find((c) => c.id === cardId)!;

  return (
    <PanelCard title="新建小样" desc="自动绑定订单、配方最新版本与色卡最新版本，并生成第一张「待称料」确认单。">
      <div className="form-rows">
        <label className="row-input"><span>小样编号</span><input placeholder="如 LAB-631M" value={code} onChange={(e) => setCode(e.target.value)} /></label>
        <label className="row-input"><span>客户订单</span><select value={orderId} onChange={(e) => setOrderId(e.target.value)}>{state.orders.map((o) => <option key={o.id} value={o.id}>{o.id} · {o.customer}</option>)}</select></label>
        <label className="row-input"><span>配方</span><select value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>{state.recipes.map((r) => <option key={r.id} value={r.id}>{r.id} · {r.name}（最新 v{latestRecipeVersion(r).version}）</option>)}</select></label>
        <label className="row-input"><span>色卡</span><select value={cardId} onChange={(e) => setCardId(e.target.value)}>{state.cards.map((c) => <option key={c.id} value={c.id}>{c.name}（最新 v{c.version}）</option>)}</select></label>
        <label className="row-input"><span>投料布重 kg</span><input type="number" step="0.1" min="0" value={weight} onChange={(e) => setWeight(Number(e.target.value))} /></label>
        <ActorField value={actor} onChange={setActor} />
        <button
          className="primary"
          disabled={!actor.trim() || !code.trim() || !(weight > 0)}
          onClick={() => {
            onCreateSample({ code, orderId, recipeId, cardId, fabricWeight: weight, actor: actor.trim() });
            setCode("");
            setActor("");
          }}
        >
          生成小样与确认单（绑定 {recipe.name} v{latestRecipeVersion(recipe).version} / {card.name} v{card.version}）
        </button>
      </div>
    </PanelCard>
  );
}
