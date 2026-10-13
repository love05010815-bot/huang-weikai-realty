/**
 * 屋主建檔「統計數據」分頁的純計算 —— **沒有任何 import**，客戶端元件可以直接用，
 * `npm run check:owners` 會測。
 *
 * 「委託日」怎麼定（2026-10-13 他要「年／月的委託數量」）：
 *   合約起日 → 沒填就用「委託／成交日」→ 再沒有就用建檔日。
 * 查過真資料：13 筆全部都有合約起日，所以實際上幾乎都是看合約起日；
 * 後兩個只是讓沒填的那幾筆不會從統計裡消失（消失了他會以為少建了）。
 */

export type StatRow = {
  /** 委託日 YYYY-MM-DD（照上面的順序挑出來的；三個都沒有就是 null，不計入年月） */
  day: string | null;
  /** 委託日是從哪個欄位來的，畫面上標「※ N 筆用建檔日」用 */
  daySource: "contractStart" | "dealDate" | "createdAt" | null;
  contractType: "general" | "exclusive" | null;
  kind: string;
  status: string;
};

export function pickCommissionDay(p: {
  contractStart: string | null;
  dealDate: string | null;
  createdAt: string | null;
}): Pick<StatRow, "day" | "daySource"> {
  if (p.contractStart) return { day: p.contractStart, daySource: "contractStart" };
  if (p.dealDate) return { day: p.dealDate, daySource: "dealDate" };
  if (p.createdAt) return { day: p.createdAt.slice(0, 10), daySource: "createdAt" };
  return { day: null, daySource: null };
}

export type PeriodCount = {
  /** "2026" 或 "2026-09" */
  key: string;
  total: number;
  general: number;
  exclusive: number;
  /** 沒選合約類型的 */
  untyped: number;
  land: number;
};

function emptyCount(key: string): PeriodCount {
  return { key, total: 0, general: 0, exclusive: 0, untyped: 0, land: 0 };
}

function bump(c: PeriodCount, r: StatRow): void {
  c.total++;
  if (r.contractType === "general") c.general++;
  else if (r.contractType === "exclusive") c.exclusive++;
  else c.untyped++;
  if (r.kind === "土地") c.land++;
}

/** 年度委託數量，新到舊 */
export function countByYear(rows: StatRow[]): PeriodCount[] {
  const map = new Map<string, PeriodCount>();
  for (const r of rows) {
    if (!r.day) continue;
    const y = r.day.slice(0, 4);
    let c = map.get(y);
    if (!c) map.set(y, (c = emptyCount(y)));
    bump(c, r);
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
}

/** 某一年 1～12 月，每個月都一格（沒資料也列 0，他要一眼看出哪個月空的） */
export function countByMonth(rows: StatRow[], year: string): PeriodCount[] {
  const out: PeriodCount[] = [];
  for (let m = 1; m <= 12; m++) out.push(emptyCount(`${year}-${String(m).padStart(2, "0")}`));
  for (const r of rows) {
    if (!r.day || r.day.slice(0, 4) !== year) continue;
    const idx = Number(r.day.slice(5, 7)) - 1;
    if (idx >= 0 && idx < 12) bump(out[idx], r);
  }
  return out;
}

/** 有資料的年份清單（新到舊）；一筆都沒有就回今年 */
export function yearsWithData(rows: StatRow[], today: string): string[] {
  const ys = new Set<string>();
  for (const r of rows) if (r.day) ys.add(r.day.slice(0, 4));
  if (ys.size === 0) ys.add(today.slice(0, 4));
  return [...ys].sort((a, b) => (a < b ? 1 : -1));
}
