"use client";

/**
 * 「統計數據」分頁，照他 Excel 的三塊排：
 *   ① 選一年 → 三格合計（件數／服務費／總業績）＋ 1～12 月每月件數與金額
 *      （2026-11-23 他看了畫面說「成交總金額不用列入」：加總的地方都不放成交金額，單筆卡片上的照舊）
 *   ② 那一年的成交方式（開發／銷售／獨得 各幾件、占幾 %）
 *   ③ 歷年每月成交數量總表（年 × 12 個月，最右邊合計，最下面全部加總）
 * 年份畫面上一律民國；條狀圖是純 CSS 寬度，不拉圖表套件。
 *
 * 109～114 年只有每月件數、沒有明細（legacy，見 deals-text.ts 的 monthCounts）：
 * 件數照算，金額與成交方式只算得到有建檔的——只有件數的年份金額印「—」不印 0，
 * 0 會被讀成「那年沒業績」。
 */
import { useMemo, useState } from "react";
import { DEAL_METHODS, DEAL_METHOD_LABEL } from "@/config/deals";
import {
  dealYears,
  fmtNum,
  fmtWan,
  methodShares,
  monthCounts,
  sumByMonth,
  sumByYear,
  sumDeals,
  type DealStatRow,
  type LegacyCount,
} from "@/lib/deals-text";
import styles from "./deals-admin.module.css";

const roc = (y: string) => Number(y) - 1911;

export default function DealsStats({ rows, legacy, today }: { rows: DealStatRow[]; legacy: LegacyCount[]; today: string }) {
  const years = useMemo(() => dealYears(rows, today, legacy), [rows, today, legacy]);
  const [year, setYear] = useState(years[0]);

  const yearRows = useMemo(() => rows.filter((r) => r.day.slice(0, 4) === year), [rows, year]);
  const yearSum = useMemo(() => sumDeals(yearRows), [yearRows]);
  const months = useMemo(() => sumByMonth(rows, year), [rows, year]);
  const merged = useMemo(() => monthCounts(rows, legacy, year), [rows, legacy, year]);
  const shares = useMemo(() => methodShares(yearRows, DEAL_METHODS), [yearRows]);
  const byYear = useMemo(() => sumByYear(rows, today, legacy), [rows, today, legacy]);
  const all = useMemo(() => sumDeals(rows), [rows]);

  const yearCount = yearSum.count + merged.legacyOnly;
  const monthMax = Math.max(0, ...merged.counts);
  const hasDetail = yearSum.count > 0;
  const money = (n: number) => (hasDetail ? fmtNum(n) : "—");
  const allCount = byYear.reduce((n, y) => n + y.count, 0);
  const allLegacyOnly = byYear.reduce((n, y) => n + y.legacyOnly, 0);

  return (
    <div className={styles.wrap}>
      <div className={styles.sectionHead}>
        <p className={styles.sectionTitle}>{roc(year)} 年成交</p>
        <select className={styles.yearSelect} value={year} onChange={(e) => setYear(e.target.value)} aria-label="年度">
          {years.map((y) => (
            <option key={y} value={y}>
              {roc(y)} 年
            </option>
          ))}
        </select>
      </div>

      <ul className={styles.stats}>
        <li>
          <b>{yearCount}</b>
          <span>成交件數</span>
        </li>
        <li>
          <b>{money(yearSum.feeWan)}</b>
          <span>服務費總額（萬）</span>
        </li>
        <li className={styles.statHot}>
          <b>{money(yearSum.perfWan)}</b>
          <span>總業績（萬）</span>
        </li>
      </ul>

      {merged.legacyOnly > 0 && (
        <p className={styles.legacyNote}>
          {roc(year)} 年有 <b>{merged.legacyOnly}</b> 件只有每月件數、沒有建檔明細
          {hasDetail ? `，上面的金額只算有建檔的 ${yearSum.count} 件` : "，所以這一年沒有金額與成交方式"}。
        </p>
      )}

      <section className={styles.statSection}>
        <p className={styles.sectionTitle}>{roc(year)} 年每月成交數量與金額</p>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>月份</th>
                <th className={styles.barCol}>件數</th>
                <th>服務費（萬）</th>
                <th>達成業績（萬）</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m, i) => {
                const count = merged.counts[i];
                return (
                  <tr key={m.key} className={count === 0 ? styles.rowZero : undefined}>
                    <th>{i + 1} 月</th>
                    <td className={styles.barCol}>
                      <span className={styles.barCell}>
                        <b>{count}</b>
                        <i className={styles.bar} aria-hidden>
                          <i style={{ width: `${monthMax > 0 ? Math.round((count / monthMax) * 100) : 0}%` }} />
                        </i>
                      </span>
                    </td>
                    <td>{m.count ? fmtNum(m.feeWan) : ""}</td>
                    <td>{m.count ? fmtNum(m.perfWan) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th>合計</th>
                <td className={styles.barCol}>
                  <b>{yearCount}</b>
                </td>
                <td>{money(yearSum.feeWan)}</td>
                <td>{money(yearSum.perfWan)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className={styles.statSection}>
        <p className={styles.sectionTitle}>{roc(year)} 年成交方式</p>
        {!hasDetail ? (
          <p className={styles.mute}>這一年沒有建檔明細，分不出開發／銷售／獨得。</p>
        ) : (
          <div className={styles.tableScroll}>
            <table className={`${styles.table} ${styles.tableNarrow}`}>
              <thead>
                <tr>
                  <th>方式</th>
                  <th>件數</th>
                  <th>占比</th>
                  <th>達成業績（萬）</th>
                </tr>
              </thead>
              <tbody>
                {shares.map((s) => (
                  <tr key={s.method} className={s.count === 0 ? styles.rowZero : undefined}>
                    <th>{DEAL_METHOD_LABEL[s.method]}</th>
                    <td>
                      <b>{s.count}</b>
                    </td>
                    <td>{s.pct}%</td>
                    <td>{s.count ? fmtNum(s.perfWan) : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>合計</th>
                  <td>
                    <b>{yearSum.count}</b>
                  </td>
                  <td />
                  <td>{fmtNum(yearSum.perfWan)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className={styles.statSection}>
        <p className={styles.sectionTitle}>歷年每月成交數量</p>
        <div className={styles.tableScroll}>
          <table className={`${styles.table} ${styles.matrix}`}>
            <thead>
              <tr>
                <th>年度</th>
                {Array.from({ length: 12 }, (_, i) => (
                  <th key={i}>{i + 1}月</th>
                ))}
                <th>合計</th>
                <th>業績（萬）</th>
              </tr>
            </thead>
            <tbody>
              {byYear.map((y) => (
                <tr key={y.key}>
                  <th>{roc(y.key)}</th>
                  {y.months.map((n, i) => (
                    <td key={i} className={n === 0 ? styles.cellZero : undefined}>
                      {n || ""}
                    </td>
                  ))}
                  <td>
                    <b>{y.count}</b>
                  </td>
                  <td>{y.recorded ? fmtNum(y.perfWan) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>總計</th>
                <td colSpan={12} />
                <td>
                  <b>{allCount}</b>
                </td>
                <td>{fmtNum(all.perfWan)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <p className={styles.count}>
        依「成交日期」歸月份；金額單位都是萬。有建檔明細的累計總業績 <b>{fmtWan(all.perfWan)}</b>
        {allLegacyOnly > 0 ? `；另有 ${allLegacyOnly} 件只有每月件數（沒有明細），件數有算、金額沒有` : ""}。
      </p>
    </div>
  );
}
