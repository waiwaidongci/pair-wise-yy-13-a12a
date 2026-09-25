// 页面层 · 成本核对表：按投料计算用量与金额，并标出余量不足 / 超预算

import { calcCost, round2, type CostBreakdown } from "../../../calc/cost";
import type { ArchiveState } from "../../../archive/seed";
import type { Confirmation } from "../../../calc/types";
import { fmtMoney } from "../../../calc/diff";

export function computeConfCost(state: ArchiveState, conf: Confirmation): CostBreakdown {
  const sample = state.samples.find((s) => s.id === conf.sampleId);
  const recipe = state.recipes.find((r) => r.id === sample?.recipeId);
  const order = state.orders.find((o) => o.id === sample?.orderId);
  if (!sample || !recipe || !order) {
    return {
      weight: conf.fabricWeight,
      lines: [],
      total: conf.weighedCost ?? 0,
      stockOf: {},
      shortDyes: [],
      overBudget: false,
      budgetRemaining: conf.budgetSnapshot,
    };
  }
  const version =
    recipe.versions.find((v) => v.version === conf.recipeVersion) ??
    recipe.versions[recipe.versions.length - 1];
  return calcCost({
    sample: { fabricWeight: conf.fabricWeight, orderId: order.id },
    recipe: version,
    order,
    dyes: state.dyes,
  });
}

export function CostTable({
  state,
  conf,
}: {
  state: ArchiveState;
  conf: Confirmation;
}) {
  const cost = computeConfCost(state, conf);
  return (
    <div className="cost-box">
      <table className="cost-table">
        <thead>
          <tr>
            <th>染料</th>
            <th>投染 %</th>
            <th>用量(kg)</th>
            <th>单价(元/kg)</th>
            <th className="num">金额</th>
          </tr>
        </thead>
        <tbody>
          {cost.lines.map((line) => {
            const dye = state.dyes.find((d) => d.id === line.dyeId);
            const short = dye !== undefined && dye.stock < line.dosage;
            return (
              <tr key={line.dyeId} className={short ? "row-warn" : ""}>
                <td>
                  {line.name}
                  {short && <em className="tag-warn">余量不足</em>}
                  <small className="stock-hint">
                    库存 {dye ? round2(dye.stock) : "-"} kg
                  </small>
                </td>
                <td>{line.percent.toFixed(2)}%</td>
                <td>{line.dosage.toFixed(3)}</td>
                <td>{line.unitPrice.toFixed(0)}</td>
                <td className="num">{fmtMoney(line.amount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className={`cost-foot ${cost.shortDyes.length || cost.overBudget ? "cost-bad" : "cost-ok"}`}>
        <span>
          投料布重 <b>{cost.weight} kg</b> · 染料成本合计 <b>{fmtMoney(cost.total)}</b>
        </span>
        <span>
          订单剩余预算 <b>{fmtMoney(cost.budgetRemaining)}</b>
          {cost.overBudget ? (
            <em className="tag-bad">超预算 {fmtMoney(cost.total - cost.budgetRemaining)}</em>
          ) : (
            <em className="tag-ok">预算内</em>
          )}
        </span>
      </div>
    </div>
  );
}
