// 页面层 · 版本差异：当前确认单与上一版留档确认单对比（配方 / 色卡 / 预算 / 投料 / 成本）

import { diffConfirmations, fmtMoney } from "../../../calc/diff";
import type { ArchiveState } from "../../../archive/seed";
import type { Confirmation } from "../../../calc/types";

function fmtLab(t?: { DL: number; Da: number; Db: number }) {
  if (!t) return "—";
  return `L ${t.DL.toFixed(1)} / a ${t.Da.toFixed(1)} / b ${t.Db.toFixed(1)}`;
}

export function VersionDiff({
  state,
  current,
  previous,
}: {
  state: ArchiveState;
  current: Confirmation;
  previous?: Confirmation;
}) {
  if (!previous) {
    return <p className="hint">首版确认单，无上一版差异可核对。</p>;
  }
  const diff = diffConfirmations(previous, current, state.dyes);
  const nameOf = (id: string) => state.dyes.find((d) => d.id === id)?.name ?? id;
  const deltaSign = diff.costDelta > 0 ? "+" : "";

  return (
    <div className="diff-box">
      <p className="diff-title">
        与上一版 {previous.id}（{previous.status}
        {previous.invalidReason ? ` · ${previous.invalidReason}` : ""}）差异
      </p>
      <ul className="diff-flags">
        <li className={diff.recipeChanged ? "on" : ""}>配方版本 v{previous.recipeVersion} → v{current.recipeVersion}</li>
        <li className={diff.cardChanged ? "on" : ""}>色卡版本 v{previous.cardVersion} → v{current.cardVersion}</li>
        <li className={diff.budgetChanged ? "on" : ""}>预算 ¥{diff.budgetFrom} → ¥{diff.budgetTo}</li>
        <li className={diff.weightChanged ? "on" : ""}>投料 {diff.weightFrom} kg → {diff.weightTo} kg</li>
      </ul>

      {(diff.recipeChanged || diff.itemChanges.length > 0) && diff.itemChanges.length > 0 && (
        <table className="diff-table">
          <thead>
            <tr><th>染料组分</th><th>旧投染%</th><th>新投染%</th></tr>
          </thead>
          <tbody>
            {diff.itemChanges.map((c) => (
              <tr key={c.dyeId}>
                <td>{nameOf(c.dyeId)}</td>
                <td>{c.fromPercent === undefined ? <em>新增</em> : `${c.fromPercent}%`}</td>
                <td>{c.toPercent === undefined ? <em>移除</em> : `${c.toPercent}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {diff.cardChanged && (
        <div className="diff-row">
          <span>色卡目标 Lab</span>
          <p>
            <del>{fmtLab(diff.cardFrom)}</del> → <b>{fmtLab(diff.cardTo)}</b>
          </p>
        </div>
      )}

      <div className="diff-row">
        <span>按投料测算成本</span>
        <p>
          {fmtMoney(diff.costFrom)} → <b>{fmtMoney(diff.costTo)}</b>
          <em className={diff.costDelta > 0 ? "tag-bad" : "tag-ok"}>
            {deltaSign}
            {fmtMoney(diff.costDelta)}
          </em>
        </p>
      </div>
    </div>
  );
}
