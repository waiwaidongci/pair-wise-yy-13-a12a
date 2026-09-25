// 页面层 · 双签区：称料与复核两人分别确认，禁止同一人补签

import { useState } from "react";
import type { Confirmation } from "../../../calc/types";
import { fmtDateTime } from "./common";

interface Props {
  conf: Confirmation;
  onWeigh: (id: string, actor: string) => void;
  onReview: (id: string, actor: string, note: string) => void;
  onRecheck: (id: string, actor: string) => void;
  onIssue: (id: string, actor: string) => void;
}

function ActorInput({
  label,
  value,
  onChange,
  disabled,
  sameAs,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  sameAs?: string;
}) {
  const clash = sameAs !== undefined && value.trim() !== "" && value.trim() === sameAs;
  return (
    <label className={`actor-input ${clash ? "invalid" : ""}`}>
      <span>
        {label}
        {clash && <em className="tag-bad">不能与{label === "复核人" ? "称料人" : "复核人"}相同</em>}
      </span>
      <input
        list="staff-list"
        placeholder="签名（选择或输入姓名）"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function ApprovalZone({ conf, onWeigh, onReview, onRecheck, onIssue }: Props) {
  const [weigher, setWeigher] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const blocked = conf.status === "待处理";

  return (
    <div className="approval">
      <div className="sign-grid">
        <div className={`sign-card ${conf.weigher ? "signed" : ""}`}>
          <h4>① 称料确认（第一人）</h4>
          {conf.weigher ? (
            <p>
              <b>{conf.weigher}</b> · {conf.weighedAt ? fmtDateTime(conf.weighedAt) : ""}
              <small>称料成本 ¥{conf.weighedCost ?? "-"}</small>
            </p>
          ) : (
            <>
              <ActorInput label="称料人" value={weigher} onChange={setWeigher} />
              <button
                className="primary"
                disabled={!weigher.trim()}
                onClick={() => {
                  onWeigh(conf.id, weigher.trim());
                  setWeigher("");
                }}
              >
                称料确认
              </button>
            </>
          )}
        </div>

        <div className={`sign-card ${conf.reviewer ? "signed" : ""}`}>
          <h4>② 复核确认（第二人）</h4>
          {conf.reviewer ? (
            <p>
              <b>{conf.reviewer}</b> · {conf.reviewedAt ? fmtDateTime(conf.reviewedAt) : ""}
              <small>{conf.reviewNote}</small>
            </p>
          ) : (
            <>
              <ActorInput
                label="复核人"
                value={reviewer}
                onChange={setReviewer}
                disabled={conf.status !== "待复核"}
                sameAs={conf.weigher}
              />
              <input
                className="review-note"
                placeholder="复核意见（色差 / 工艺 / 投料核对）"
                value={note}
                disabled={conf.status !== "待复核"}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                disabled={conf.status !== "待复核" || !reviewer.trim() || reviewer.trim() === conf.weigher}
                onClick={() => {
                  onReview(conf.id, reviewer.trim(), note);
                  setReviewer("");
                  setNote("");
                }}
              >
                复核确认
              </button>
            </>
          )}
        </div>
      </div>

      {blocked && (
        <div className="block-bar">
          <div>
            <b>停在待处理，不能出送样单：</b>
            <ul>
              {(conf.blockReasons ?? []).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
          <div className="inline-action">
            <input
              list="staff-list"
              placeholder="处理人签名"
              value={weigher}
              onChange={(e) => setWeigher(e.target.value)}
            />
            <button
              className="ghost"
              disabled={!weigher.trim()}
              onClick={() => {
                onRecheck(conf.id, weigher.trim());
                setWeigher("");
              }}
            >
              补库/调预算后重新核对
            </button>
          </div>
        </div>
      )}

      {conf.status === "待出样" && (
        <div className="issue-bar">
          <span>双签齐备，成本与余量复核通过，可出具送样单。</span>
          <div className="inline-action">
            <input
              list="staff-list"
              placeholder="出样经办人"
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
            />
            <button
              className="primary"
              disabled={!reviewer.trim()}
              onClick={() => {
                onIssue(conf.id, reviewer.trim());
                setReviewer("");
              }}
            >
              出具送样单
            </button>
          </div>
        </div>
      )}

      {conf.status === "已出样" && (
        <div className="issued-banner">
          送样单 <b>{conf.deliveryNo}</b> · 出样时间 {conf.issuedAt ? fmtDateTime(conf.issuedAt) : "-"}
        </div>
      )}
      {conf.status === "已失效" && (
        <div className="invalid-banner">
          本单因{conf.invalidReason}已于 {conf.invalidatedAt ? fmtDateTime(conf.invalidatedAt) : "-"} 失效，仅留档备查。
        </div>
      )}
    </div>
  );
}
