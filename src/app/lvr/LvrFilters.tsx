"use client";

/**
 * /lvr 的篩選列。純 GET 表單：沒有 JS 也能按「查詢」送出；有 JS 時改任何一個下拉就自動送出。
 * 不帶 page 參數 —— 換條件一律回第一頁。
 */
import { useRef } from "react";
import { LVR_DISTRICTS, LVR_CATEGORY_LABEL, type LvrCategory, type LvrKind } from "@/lib/lvr-parse";
import { LVR_SORTS, LVR_PERIOD_RECENT, type LvrSort } from "@/lib/lvr";
import styles from "./lvr.module.css";
import tax from "../tax/tax.module.css";

export type LvrFilterValues = {
  kind: LvrKind;
  area: string;
  type: LvrCategory | "";
  /** "recent6m"（預設）或民國年字串，例如 "115" */
  period: string;
  q: string;
  sort: LvrSort;
  fresh: boolean;
};

/** 不含 "presale" —— 預售屋現在是上面的分頁籤（kind），不再是這個下拉的選項 */
const CATEGORY_ORDER: (LvrCategory | "")[] = ["", "apt", "house", "shop", "land", "other"];

export default function LvrFilters({
  values,
  hasFresh,
  years,
}: {
  values: LvrFilterValues;
  hasFresh: boolean;
  /** 可查詢的民國年清單（新到舊）；空陣列就不畫「依年度查詢」 */
  years: string[];
}) {
  const form = useRef<HTMLFormElement>(null);
  const submit = () => form.current?.requestSubmit();

  return (
    <form ref={form} action="/lvr" method="get" className={styles.filters} role="search" aria-label="篩選成交資料">
      {/* kind 不在這個表單裡（它是上面的分頁籤、換頁即送出），這裡原樣帶著走避免被表單提交蓋掉 */}
      <input type="hidden" name="kind" value={values.kind} />

      <label className={tax.field}>
        <span className={tax.label}>行政區</span>
        <select name="area" className={tax.input} defaultValue={values.area} onChange={submit}>
          <option value="">四區全部</option>
          {LVR_DISTRICTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>

      <label className={tax.field}>
        <span className={tax.label}>型態</span>
        <select name="type" className={tax.input} defaultValue={values.type} onChange={submit}>
          {CATEGORY_ORDER.map((c) => (
            <option key={c || "all"} value={c}>
              {c ? LVR_CATEGORY_LABEL[c] : "全部型態（不含土地）"}
            </option>
          ))}
        </select>
      </label>

      <label className={tax.field}>
        <span className={tax.label}>期間</span>
        <select name="period" className={tax.input} defaultValue={values.period} onChange={submit}>
          <option value={LVR_PERIOD_RECENT}>近 6 個月</option>
          {years.map((y) => (
            <option key={y} value={y}>
              民國 {y} 年（全年）
            </option>
          ))}
        </select>
      </label>

      <label className={tax.field}>
        <span className={tax.label}>排序</span>
        <select name="sort" className={tax.input} defaultValue={values.sort} onChange={submit}>
          {LVR_SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label className={`${tax.field} ${styles.fieldWide}`}>
        <span className={tax.label}>
          路名／建案
          <span className={tax.labelHint}>例：中華路、勝興豐川</span>
        </span>
        <div className={styles.searchRow}>
          <input
            name="q"
            className={tax.input}
            type="search"
            defaultValue={values.q}
            placeholder="輸入路名或預售建案名"
            autoComplete="off"
            maxLength={40}
          />
          <button type="submit" className={styles.searchBtn}>
            查詢
          </button>
        </div>
      </label>

      {hasFresh ? (
        <label className={styles.freshToggle}>
          <input type="checkbox" name="fresh" value="1" defaultChecked={values.fresh} onChange={submit} />
          <span>只看本期新增</span>
        </label>
      ) : null}
    </form>
  );
}
