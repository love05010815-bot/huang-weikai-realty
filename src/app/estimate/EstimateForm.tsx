"use client";

/**
 * /estimate 的輸入表單。純 GET 表單：沒有 JS 也能送出；結果由 page.tsx（server）算好印在表單下面。
 *
 * 這裡的 JS 只做一件事：換行政區時，型態下拉旁即時顯示「這區近 2 年這種型態有幾筆成交」——
 * 選項要從資料算出來，別讓人選到一定查不出東西的那個（清水區公寓近 2 年 1 筆這種）。
 * 筆數是 server 算好傳進來的（props.counts），這裡不打資料庫。
 *
 * 驗證錯誤印在那一格底下，不是整頁一行（整頁一行訊息等於沒訊息）。
 */
import Link from "next/link";
import { useState } from "react";
import { LVR_DISTRICTS } from "@/lib/lvr-parse";
import {
  AGE_MAX,
  AGE_MIN,
  ESTIMATE_TYPES,
  PING_MAX,
  PING_MIN,
  isEstimateType,
  type EstimateInputError,
  type EstimateType,
  type EstimateTypeCounts,
} from "@/lib/lvr-estimate";
import tax from "../tax/tax.module.css";
import css from "./estimate.module.css";

export type EstimateFormValues = { district: string; type: string; ping: string; age: string };

/** 「不知道要填什麼？」的範例 —— 都是海線最常被問的組合 */
const EXAMPLES: { label: string; q: EstimateFormValues }[] = [
  { label: "沙鹿 住宅大樓 35 坪・3 年", q: { district: "沙鹿區", type: "apt", ping: "35", age: "3" } },
  { label: "梧棲 透天 60 坪・15 年", q: { district: "梧棲區", type: "house", ping: "60", age: "15" } },
  { label: "龍井 華廈 28 坪・20 年", q: { district: "龍井區", type: "mid", ping: "28", age: "20" } },
  { label: "清水 住宅大樓 42 坪・新成屋", q: { district: "清水區", type: "apt", ping: "42", age: "0" } },
];

export function estimateHref(q: EstimateFormValues): string {
  const p = new URLSearchParams();
  p.set("area", q.district);
  p.set("type", q.type);
  p.set("ping", q.ping);
  p.set("age", q.age);
  return `/estimate?${p.toString()}#result`;
}

export default function EstimateForm({
  values,
  counts,
  countMonths,
  errors,
}: {
  values: EstimateFormValues;
  counts: EstimateTypeCounts;
  countMonths: number;
  errors: EstimateInputError[];
}) {
  const [district, setDistrict] = useState(values.district);
  const [type, setType] = useState(values.type);
  const err = (field: EstimateInputError["field"]) => errors.find((e) => e.field === field)?.message;

  const countOf = (d: string, t: EstimateType): number | null => (counts[d] ? counts[d][t] : null);
  const selectedCount = district && isEstimateType(type) ? countOf(district, type) : null;
  const yearsText = countMonths % 12 === 0 ? `近 ${countMonths / 12} 年` : `近 ${countMonths} 個月`;

  return (
    <form action="/estimate#result" method="get" className={tax.form} aria-label="輸入房子的條件">
      <div className={css.examples}>
        <span className={css.examplesLabel}>先試試看：</span>
        {EXAMPLES.map((ex) => (
          <Link key={ex.label} href={estimateHref(ex.q)} className={css.exampleBtn}>
            {ex.label}
          </Link>
        ))}
      </div>

      <div className={tax.grid}>
        <label className={tax.field}>
          <span className={tax.label}>
            行政區
            <span className={tax.labelHint}>海線四區</span>
          </span>
          <select
            name="area"
            className={tax.input}
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            aria-invalid={Boolean(err("district"))}
            required
          >
            <option value="">請選擇</option>
            {LVR_DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          {err("district") ? <span className={css.fieldError}>{err("district")}</span> : null}
        </label>

        <label className={tax.field}>
          <span className={tax.label}>
            建物型態
            <span className={tax.labelHint}>看權狀或謄本的「建物型態」</span>
          </span>
          <select
            name="type"
            className={tax.input}
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-invalid={Boolean(err("type"))}
            required
          >
            <option value="">請選擇</option>
            {ESTIMATE_TYPES.map((t) => {
              const n = district ? countOf(district, t.key) : null;
              return (
                <option key={t.key} value={t.key}>
                  {t.label}（{t.hint}）{n !== null ? ` ・ ${yearsText} ${n} 筆` : ""}
                </option>
              );
            })}
          </select>
          {err("type") ? (
            <span className={css.fieldError}>{err("type")}</span>
          ) : selectedCount !== null ? (
            <span className={selectedCount === 0 ? css.hintWarn : css.hint}>
              {selectedCount === 0
                ? `${district}${yearsText}沒有這種型態的成交，查不出行情，換個型態或行政區看看`
                : selectedCount < 20
                  ? `${district}${yearsText}只有 ${selectedCount} 筆這種型態的成交，結果會放寬條件來算`
                  : `${district}${yearsText}有 ${selectedCount} 筆這種型態的成交可以比`}
            </span>
          ) : (
            <span className={css.hint}>先選行政區，這裡會顯示各型態有幾筆成交可以比</span>
          )}
        </label>

        <label className={tax.field}>
          <span className={tax.label}>
            權狀坪數
            <span className={tax.labelHint}>不含車位</span>
          </span>
          <div className={tax.amountWrap}>
            <input
              name="ping"
              className={tax.input}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="例：35"
              defaultValue={values.ping}
              aria-invalid={Boolean(err("ping"))}
              required
            />
            <span className={tax.unit}>坪</span>
          </div>
          {err("ping") ? (
            <span className={css.fieldError}>{err("ping")}</span>
          ) : (
            <span className={css.hint}>
              權狀上建物總面積（主建物＋附屬＋公設），車位另計；可填 {PING_MIN}～{PING_MAX} 坪
            </span>
          )}
        </label>

        <label className={tax.field}>
          <span className={tax.label}>
            屋齡
            <span className={tax.labelHint}>新成屋填 0</span>
          </span>
          <div className={tax.amountWrap}>
            <input
              name="age"
              className={tax.input}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="例：3"
              defaultValue={values.age}
              aria-invalid={Boolean(err("age"))}
              required
            />
            <span className={tax.unit}>年</span>
          </div>
          {err("age") ? (
            <span className={css.fieldError}>{err("age")}</span>
          ) : (
            <span className={css.hint}>
              不確定就看謄本的「建築完成日期」，用今年減掉它；可填 {AGE_MIN}～{AGE_MAX} 年
            </span>
          )}
        </label>
      </div>

      <div className={css.submitRow}>
        <button type="submit" className={css.submitBtn}>
          查這間房子的行情 →
        </button>
        <span className={css.submitNote}>只比對內政部實價登錄的成屋成交，不會留下您的資料</span>
      </div>
    </form>
  );
}
