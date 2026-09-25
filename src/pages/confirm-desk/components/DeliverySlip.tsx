// 页面层 · 送样单：双签齐备且余量/预算通过后才允许出具（仅已出样确认单可查看）

import type { ArchiveState } from "../../../archive/seed";
import { computeConfCost } from "./CostTable";
import { fmtDateTime } from "./common";
import { fmtMoney } from "../../../calc/diff";

export function DeliverySlip({
  state,
  confirmationId,
  onClose,
}: {
  state: ArchiveState;
  confirmationId: string | null;
  onClose: () => void;
}) {
  if (!confirmationId) return null;
  const conf = state.confirmations.find((c) => c.id === confirmationId);
  if (!conf || conf.status !== "已出样") return null;
  const sample = state.samples.find((s) => s.id === conf.sampleId);
  const order = state.orders.find((o) => o.id === sample?.orderId);
  const recipe = state.recipes.find((r) => r.id === sample?.recipeId);
  const card = state.cards.find((c) => c.id === sample?.cardId);
  const cost = computeConfCost(state, conf);

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="slip" onClick={(e) => e.stopPropagation()}>
        <header className="slip-head">
          <div>
            <h2>染整小样送样单</h2>
            <p>{conf.deliveryNo}</p>
          </div>
          <button className="ghost" onClick={onClose}>关闭</button>
        </header>
        <dl className="slip-grid">
          <div><dt>小样编号</dt><dd>{sample?.code}</dd></div>
          <div><dt>客户订单</dt><dd>{order?.id}（{order?.customer}）</dd></div>
          <div><dt>配方 / 版本</dt><dd>{recipe?.name} / v{conf.recipeVersion}</dd></div>
          <div><dt>色卡 / 版本</dt><dd>{card?.name} / v{conf.cardVersion}</dd></div>
          <div><dt>投料布重</dt><dd>{conf.fabricWeight} kg</dd></div>
          <div><dt>浴比 / 温度 / 保温</dt><dd>{recipe?.liquorRatio} · {recipe?.temperature} · {recipe?.holdMinutes}min</dd></div>
          <div><dt>后整理</dt><dd>{recipe?.finishing}</dd></div>
          <div><dt>染料成本</dt><dd>{fmtMoney(cost.total)}（预算 {fmtMoney(cost.budgetRemaining + cost.total)}）</dd></div>
          <div><dt>称料确认</dt><dd>{conf.weigher} · {conf.weighedAt ? fmtDateTime(conf.weighedAt) : ""}</dd></div>
          <div><dt>复核确认</dt><dd>{conf.reviewer} · {conf.reviewedAt ? fmtDateTime(conf.reviewedAt) : ""}</dd></div>
        </dl>
        <table className="cost-table">
          <thead><tr><th>染料</th><th>投染 %</th><th>用量(kg)</th><th>金额</th></tr></thead>
          <tbody>
            {cost.lines.map((l) => (
              <tr key={l.dyeId}><td>{l.name}</td><td>{l.percent}%</td><td>{l.dosage.toFixed(3)}</td><td>{fmtMoney(l.amount)}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="slip-foot">出样时间：{conf.issuedAt ? fmtDateTime(conf.issuedAt) : "-"}　·　本单经称料、复核两人分别确认，余量与预算核对通过。</p>
      </div>
    </div>
  );
}
