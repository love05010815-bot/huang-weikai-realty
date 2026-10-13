"use client";

/**
 * 「統計數據」分頁：上面八格摘要（page.tsx 算好傳進來）、年度委託數量、選一年看每月。
 * 「委託日」的定義在 lib/owners-stats.ts 檔頭（合約起日 → 委託／成交日 → 建檔日）。
 * 條狀圖是純 CSS 寬度，不拉圖表套件——手機上要快、也不用互動。
 */
import { useMemo, useState } from "react";
import { CONTRACT_TYPE_LABEL } from "@/config/owners";
import { countByMonth, countByYear, yearsWithData, type PeriodCount, type StatRow } from "@/lib/owners-stats";
import styles from "./owners-admin.module.css";

export type StatCard = { value: number; label: string };

function Bar({ c, max }: { c: PeriodCount; max: number }) {
  const w = max > 0 ? Math.round((c.total / max) * 100) : 0;
  return (
    <div className={styles.bar} aria-hidden>
      <div className={styles.barFill} style={{ width: `${w}%` }}>
        {c.exclusive > 0 && <span className={styles.barSeg} style={{ flex: c.exclusive }} data-seg="exclusive" />}
        {c.general > 0 && <span className={styles.barSeg} style={{ flex: c.general }} data-seg="general" />}
        {c.untyped > 0 && <span className={styles.barSeg} style={{ flex: c.untyped }} data-seg="untyped" />}
      </div>
    </div>
  );
}

function Breakdown({ c }: { c: PeriodCount }) {
  const parts: string[] = [];
  if (c.exclusive) parts.push(`${CONTRACT_TYPE_LABEL.exclusive} ${c.exclusive}`);
  if (c.general) parts.push(`${CONTRACT_TYPE_LABEL.general} ${c.general}`);
  if (c.untyped) parts.push(`未選類型 ${c.untyped}`);
  if (c.land) parts.push(`土地 ${c.land}`);
  return <span className={styles.breakdown}>{parts.join("｜")}</span>;
}

export default function OwnersStats({ cards, rows, today }: { cards: StatCard[]; rows: StatRow[]; today: string }) {
  const years = useMemo(() => yearsWithData(rows, today), [rows, today]);
  const [year, setYear] = useState(years[0]);
  const byYear = useMemo(() => countByYear(rows), [rows]);
  const byMonth = useMemo(() => countByMonth(rows, year), [rows, year]);
  const yearMax = Math.max(0, ...byYear.map((c) => c.total));
  const monthMax = Math.max(0, ...byMonth.map((c) => c.total));
  const fallback = rows.filter((r) => r.daySource && r.daySource !== "contractStart").length;
  const undated = rows.filter((r) => !r.day).length;

  return (
    <div className={styles.wrap}>
      <ul className={styles.stats}>
        {cards.map((c) => (
          <li key={c.label}>
            <b>{c.value}</b>
            <span>{c.label}</span>
          </li>
        ))}
      </ul>

      <section className={styles.statSection}>
        <div className={styles.sectionHead}>
          <p className={styles.sectionTitle}>年度委託數量</p>
        </div>
        {byYear.length === 0 ? (
          <p className={styles.empty}>還沒有房子有委託日。</p>
        ) : (
          <ul className={styles.barList}>
            {byYear.map((c) => (
              <li key={c.key} className={styles.barRow}>
                <span className={styles.barLabel}>{c.key} 年</span>
                <Bar c={c} max={yearMax} />
                <b className={styles.barNum}>{c.total}</b>
                <Breakdown c={c} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.statSection}>
        <div className={styles.sectionHead}>
          <p className={styles.sectionTitle}>每月委託數量</p>
          <select className={styles.yearSelect} value={year} onChange={(e) => setYear(e.target.value)} aria-label="年份">
            {years.map((y) => (
              <option key={y} value={y}>
                {y} 年
              </option>
            ))}
          </select>
        </div>
        <ul className={styles.barList}>
          {byMonth.map((c) => (
            <li key={c.key} className={`${styles.barRow} ${c.total === 0 ? styles.barRowZero : ""}`}>
              <span className={styles.barLabel}>{Number(c.key.slice(5, 7))} 月</span>
              <Bar c={c} max={monthMax} />
              <b className={styles.barNum}>{c.total}</b>
              <Breakdown c={c} />
            </li>
          ))}
        </ul>
        <p className={styles.legend}>
          <i data-seg="exclusive" /> 專約　<i data-seg="general" /> 一般約　<i data-seg="untyped" /> 未選類型
        </p>
      </section>

      <p className={styles.count}>
        委託日＝合約起日；沒填合約起日的用「委託／成交日」，再沒有就用建檔日
        {fallback > 0 ? `（目前有 ${fallback} 筆是這樣算的）` : ""}
        {undated > 0 ? `；${undated} 筆三個日期都沒填，不在年月統計裡` : ""}。
        下架、已售出的房子也算在當初委託的那個月。
      </p>
    </div>
  );
}
