// 页面层 · 档案流水：双签、阻断、出样、升版失效等全过程留痕

import type { ArchiveState } from "../../../archive/seed";
import { fmtDateTime } from "./common";

export function AuditTrail({ state }: { state: ArchiveState }) {
  return (
    <section className="panel audit-panel">
      <div className="heading">
        <div>
          <p>留档</p>
          <h2>档案流水</h2>
        </div>
      </div>
      <ol className="audit-list">
        {state.audit.slice(0, 30).map((a, i) => (
          <li key={i}>
            <time>{fmtDateTime(a.at)}</time>
            <span className="audit-actor">{a.actor}</span>
            <span className="audit-action">{a.action}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
