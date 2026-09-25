import { useMemo, useState } from "react";
import type { DomainState, SampleSheet } from "../domain/types";
import {
  computeVersionDiff,
  dyeAvailable,
  plannedSheetCost,
  sheetCost,
} from "../domain/calculations";
import { describeBlock } from "../archive/engine";
import { fmtTime, gram, yuan, yuan2 } from "./meta";

interface Props {
  sheet: SampleSheet;
  state: DomainState;
  /** 称料表单 / 复核操作开关（列表内用；留档与已出单只读） */
  interactive: boolean;
  onWeigh: (sheetId: string, staffId: string, actual: Record<string, number>) => void;
  onReviewPass: (sheetId: string, staffId: string) => void;
  onReviewReject: (sheetId: string, staffId: string, reason: string) => void;
  onIssue: (sheetId: string) => void;
  onLocate: (sheetId: string) => void;
}

function StaffSelect({
  state,
  excludeId,
  value,
  onChange,
  placeholder,
}: {
  state: DomainState;
  excludeId?: string;
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {state.staff
        .filter((s) => s.id !== excludeId)
        .map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}（{s.role}）
          </option>
        ))}
    </select>
  );
}

export function SheetDetail({
  sheet,
  state,
  interactive,
  onWeigh,
  onReviewPass,
  onReviewReject,
  onIssue,
  onLocate,
}: Props) {
  const order = state.orders.find((o) => o.id === sheet.orderId)!;
  const recipe =
    state.recipes.find((r) => r.id === sheet.recipeVersionId) ??
    sheet.snapshot?.recipe;
  const card =
    state.colorCards.find((c) => c.id === sheet.colorCardId) ??
    sheet.snapshot?.colorCard;
  const latestRecipe = state.recipes
    .filter((r) => r.recipeId === recipe?.recipeId)
    .sort((a, b) => b.version - a.version)[0];
  const cost = sheetCost(sheet);
  const planCost = plannedSheetCost(sheet);
  const spent = state.sheets
    .filter((s) => s.orderId === order.id && s.status === "ISSUED")
    .reduce((sum, s) => sum + sheetCost(s), 0);
  const budgetLeft = order.budget - spent;

  const [actual, setActual] = useState<Record<string, number>>(() =>
    Object.fromEntries(sheet.lines.map((l) => [l.dyeId, l.actualGram]))
  );
  const [weighStaff, setWeighStaff] = useState("");
  const [reviewStaff, setReviewStaff] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  const dyeName = (id: string) => state.dyes.find((d) => d.id === id)?.name ?? id;

  const diff = useMemo(
    () =>
      recipe && card
        ? computeVersionDiff(
            sheet,
            latestRecipe,
            state.colorCards.find((c) => c.id === card.id),
            order.budget,
            dyeName
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sheet, state]
  );

  const sheetEvents = state.ledger
    .filter((e) => e.sheetId === sheet.id)
    .sort((a, b) => a.id - b.id);
  const successor = sheet.successorId
    ? state.sheets.find((s) => s.id === sheet.successorId)
    : null;
  const predecessor = state.sheets.find((s) => s.successorId === sheet.id);

  const showWeighForm = interactive && sheet.status === "WEIGH";
  const showReviewBar =
    interactive && (sheet.status === "REVIEW" || sheet.status === "BLOCKED");

  return (
    <div className="detail">
      {/* 绑定信息 */}
      <div className="detail-grid">
        <div className="bind-card">
          <small>绑定订单</small>
          <b>{order.id}</b>
          <span>
            {order.customer} · {order.fabric}
          </span>
        </div>
        <div className="bind-card">
          <small>绑定配方版本</small>
          <b>
            {recipe?.recipeName} v{recipe?.version}
          </b>
          <span>
            浴比 {recipe?.bathRatio} · 保温 {recipe?.holdMinutes}min
          </span>
        </div>
        <div className="bind-card">
          <small>绑定色卡</small>
          <b className="card-name">
            <i className="swatch" style={{ background: card?.swatch }} />
            {card?.code} · 第{card?.revision}版
          </b>
          <span>{card?.name}</span>
        </div>
        <div className="bind-card">
          <small>布样重量</small>
          <b>{sheet.fabricWeight}g</b>
          <span>{recipe?.tempCurve}</span>
        </div>
      </div>

      {/* 投料与成本 */}
      <h4>投料明细（成本按实际称料）</h4>
      <div className="lines-table">
        <table>
          <thead>
            <tr>
              <th>染料</th>
              <th>配方 %</th>
              <th>计划用量</th>
              <th>实际称料</th>
              <th>单价</th>
              <th>成本</th>
              <th>余量核对</th>
            </tr>
          </thead>
          <tbody>
            {sheet.lines.map((line) => {
              const dye = state.dyes.find((d) => d.id === line.dyeId);
              const available = dye
                ? dyeAvailable(dye, state.sheets, sheet.id)
                : 0;
              const short = line.actualGram > available + 1e-9;
              return (
                <tr key={line.dyeId} className={short ? "row-short" : ""}>
                  <td>{dyeName(line.dyeId)}</td>
                  <td>{line.plannedPercent.toFixed(2)}%</td>
                  <td>{gram(line.plannedGram)}</td>
                  <td>
                    {showWeighForm ? (
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={actual[line.dyeId] ?? 0}
                        onChange={(e) =>
                          setActual((a) => ({
                            ...a,
                            [line.dyeId]: Number(e.target.value),
                          }))
                        }
                      />
                    ) : (
                      gram(line.actualGram)
                    )}
                  </td>
                  <td>{yuan2(line.unitPrice)}/g</td>
                  <td>{yuan(line.actualGram * line.unitPrice)}</td>
                  <td className={short ? "danger" : ""}>
                    可用 {gram(available)}
                    {short ? " ⚠ 不足" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="cost-row">
        <div className="cost-box">
          <small>计划成本</small>
          <b>{yuan(planCost)}</b>
        </div>
        <div className="cost-box">
          <small>本单实际投料成本</small>
          <b className="cost-actual">{yuan(cost)}</b>
        </div>
        <div className="cost-box budget-box">
          <small>
            订单 {order.id} 预算（已出 {yuan2(spent)} / 预算 {yuan2(order.budget)}）
          </small>
          <div className="budget-track">
            <div
              className="budget-fill"
              style={{
                width: `${Math.min(100, ((spent + cost) / order.budget) * 100)}%`,
                background:
                  spent + cost > order.budget ? "var(--danger)" : "var(--accent)",
              }}
            />
          </div>
          <b className={budgetLeft - cost < -0.005 ? "danger" : ""}>
            本单后剩余 {yuan2(budgetLeft - cost)}
          </b>
        </div>
      </div>

      {sheet.block &&
        (sheet.block.shortDyes.length > 0 || sheet.block.overBudget) && (
          <div className="block-banner">⛔ {describeBlock(sheet.block)} —— 停在待处理，不能出送样单</div>
        )}

      {/* 双人签名 */}
      <h4>称料 / 复核双人确认（不得同一人补签）</h4>
      <div className="sign-row">
        <div className={`sign-card ${sheet.weighSignature ? "signed" : ""}`}>
          <small>① 称料员签名</small>
          {sheet.weighSignature ? (
            <b>
              ✓ {sheet.weighSignature.staffName}
              <span>{fmtTime(sheet.weighSignature.at)}</span>
            </b>
          ) : (
            <b className="muted">未签名</b>
          )}
        </div>
        <div className="sign-arrow">→</div>
        <div className={`sign-card ${sheet.reviewSignature ? "signed" : ""}`}>
          <small>② 复核员签名（须为另一人）</small>
          {sheet.reviewSignature ? (
            <b>
              ✓ {sheet.reviewSignature.staffName}
              <span>{fmtTime(sheet.reviewSignature.at)}</span>
            </b>
          ) : (
            <b className="muted">未签名</b>
          )}
        </div>
      </div>

      {showWeighForm && (
        <div className="action-bar">
          <StaffSelect
            state={state}
            value={weighStaff}
            onChange={setWeighStaff}
            placeholder="选择称料员（本人签名）"
          />
          <button
            className="primary"
            onClick={() => onWeigh(sheet.id, weighStaff, actual)}
            disabled={!weighStaff}
          >
            确认称料并签名
          </button>
          <span className="tip">签名后自动校验染料余量与订单预算</span>
        </div>
      )}

      {showReviewBar && (
        <div className="action-bar">
          <StaffSelect
            state={state}
            excludeId={sheet.weighSignature?.staffId}
            value={reviewStaff}
            onChange={setReviewStaff}
            placeholder="选择复核员（不可与称料同人）"
          />
          <button
            className="primary"
            onClick={() => onReviewPass(sheet.id, reviewStaff)}
            disabled={!reviewStaff}
          >
            复核通过
          </button>
          <button onClick={() => setShowReject((v) => !v)}>
            退回重新称料
          </button>
          {showReject && (
            <span className="reject-inline">
              <input
                placeholder="退回原因（可选）"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
              <button
                onClick={() => {
                  if (!reviewStaff) return;
                  onReviewReject(sheet.id, reviewStaff, rejectReason);
                }}
                disabled={!reviewStaff}
              >
                确认退回
              </button>
            </span>
          )}
        </div>
      )}

      {interactive && sheet.status === "READY" && (
        <div className="action-bar issue-bar">
          <span className="tip">校验通过、双人签名齐全</span>
          <button className="success" onClick={() => onIssue(sheet.id)}>
            生成送样单并扣减染料库存
          </button>
        </div>
      )}

      {sheet.status === "ISSUED" && (
        <div className="delivery-note">
          <b>送样单号 {sheet.deliveryNo}</b>
          <span>出单时间 {fmtTime(sheet.issuedAt)}</span>
          <span>实际投料成本 {yuan(cost)}，染料库存已扣减</span>
        </div>
      )}

      {sheet.status === "VOID" && (
        <div className="void-banner">
          <div>
            <b>本确认单已失效留档</b>
            <span>{sheet.voidReason}</span>
            <span>失效时间 {fmtTime(sheet.voidedAt)}</span>
          </div>
          {successor && (
            <button onClick={() => onLocate(successor.id)}>
              查看承接单 {successor.sampleCode}
            </button>
          )}
        </div>
      )}
      {predecessor && sheet.status !== "VOID" && (
        <div className="predecessor">
          承接自已失效的 {predecessor.sampleCode}（
          {predecessor.voidReason}）
        </div>
      )}

      {/* 版本差异 */}
      {diff &&
        (diff.recipeChanged ||
          diff.colorCardChanged ||
          diff.budgetChanged ||
          sheet.status === "VOID") && (
          <div className="diff-box">
            <h4>版本差异核对（当前单 vs 现行主数据）</h4>
            {diff.recipeLineDiffs.length > 0 && (
              <ul className="diff-list">
                {diff.recipeLineDiffs.map((d) => (
                  <li key={d.dyeId}>
                    {d.dyeName}：
                    {d.oldPercent === null ? (
                      <>
                        新增 <b className="new-val">{d.newPercent}%</b>
                      </>
                    ) : d.newPercent === null ? (
                      <>
                        删除 <b className="old-val">{d.oldPercent}%</b>
                      </>
                    ) : (
                      <>
                        <b className="old-val">{d.oldPercent}%</b> →{" "}
                        <b className="new-val">{d.newPercent}%</b>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {diff.processChanged.bathRatio && (
              <p>浴比 {diff.processChanged.bathRatio[0]} → {diff.processChanged.bathRatio[1]}</p>
            )}
            {diff.processChanged.tempCurve && (
              <p>温度曲线：{diff.processChanged.tempCurve[0]} → {diff.processChanged.tempCurve[1]}</p>
            )}
            {diff.processChanged.holdMinutes && (
              <p>
                保温时间 {diff.processChanged.holdMinutes[0]}min →{" "}
                {diff.processChanged.holdMinutes[1]}min
              </p>
            )}
            {diff.colorCard && (
              <p>
                色卡 {diff.colorCard.oldCode} 第{diff.colorCard.oldRevision}版（
                {diff.colorCard.oldName}）→ {diff.colorCard.newCode} 第
                {diff.colorCard.newRevision}版（{diff.colorCard.newName}）
              </p>
            )}
            {diff.budget && (
              <p>
                订单预算 {yuan2(diff.budget[0])} → {yuan2(diff.budget[1])}
              </p>
            )}
            {sheet.status === "VOID" &&
              !diff.recipeChanged &&
              !diff.colorCardChanged &&
              !diff.budgetChanged && <p className="muted">无后续差异（主数据未再变更）</p>}
          </div>
        )}

      {/* 事件台账 */}
      <div className="ledger-strip">
        <h4>审批与操作留痕</h4>
        <ol>
          {sheetEvents.map((e) => (
            <li key={e.id}>
              <span className="ledger-time">{fmtTime(e.at)}</span>
              <span className="ledger-detail">{e.detail}</span>
              {e.staffName && <span className="ledger-staff">{e.staffName}</span>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
