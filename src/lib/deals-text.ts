/**
 * 成交紀錄的純計算 —— 只 import 同樣零相依的 owners-text 與 config，**不碰 Prisma**，
 * 客戶端元件可以直接用；`npm run check:deals` 測的就是這支。
 *
 * 金額單位一律是「萬」（跟他的 Excel 一樣：成交金額 1288 萬、服務費 59.32 萬、業績 17.796 萬）。
 */
import { POINTS_BASE, type DealMethod } from "@/config/deals";

/** 四捨五入到小數 n 位，順便把 0.1+0.2 那種浮點尾巴收掉 */
export function roundTo(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/**
 * 他手打的數字 → number。收「1,288」「1288萬」「4.6%」「 59.32 」。
 * 空白回 null（＝沒填）；看不懂回 NaN（呼叫端要擋下來，不要默默當 0）。
 */
export function parseNum(raw: string | null | undefined): number | null {
  const s = (raw ?? "").replace(/[,，\s　萬%％點]/g, "");
  if (!s) return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

/** 服務費％數 ＝ 服務費總額 ÷ 成交金額，取到小數 3 位 */
export function calcFeePct(priceWan: number | null, feeWan: number | null): number | null {
  if (priceWan == null || feeWan == null || !(priceWan > 0)) return null;
  return roundTo((feeWan / priceWan) * 100, 3);
}

/** 達成業績（萬）＝ 服務費總額 × 分得點數 ÷ 10 */
export function calcPerf(feeWan: number | null, points: number | null): number | null {
  if (feeWan == null || points == null) return null;
  return roundTo((feeWan * points) / POINTS_BASE, 4);
}

/** 1288 → "1,288"、17.796 → "17.796"、433.67880001 → "433.6788"；null → "—" */
export function fmtNum(n: number | null | undefined, digits = 4): string {
  if (n == null || Number.isNaN(n)) return "—";
  return roundTo(n, digits).toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function fmtWan(n: number | null | undefined): string {
  return n == null || Number.isNaN(n) ? "—" : `${fmtNum(n)} 萬`;
}

/** "2026-11-02" → 115（民國年）；不是 ISO 回 null */
export function rocYearOf(iso: string | null | undefined): number | null {
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec(iso ?? "");
  return m ? Number(m[1]) - 1911 : null;
}

// ---------------------------------------------------------------- 統計

export type DealStatRow = {
  /** 成交日期 YYYY-MM-DD */
  day: string;
  method: DealMethod;
  priceWan: number | null;
  feeWan: number | null;
  perfWan: number | null;
};

export type DealSum = {
  /** "2026"（年）或 "2026-03"（月） */
  key: string;
  count: number;
  priceWan: number;
  feeWan: number;
  perfWan: number;
};

function emptySum(key: string): DealSum {
  return { key, count: 0, priceWan: 0, feeWan: 0, perfWan: 0 };
}

function addTo(sum: DealSum, r: DealStatRow): void {
  sum.count += 1;
  sum.priceWan = roundTo(sum.priceWan + (r.priceWan ?? 0), 4);
  sum.feeWan = roundTo(sum.feeWan + (r.feeWan ?? 0), 4);
  sum.perfWan = roundTo(sum.perfWan + (r.perfWan ?? 0), 4);
}

/** 加總一批（卡片、合計列用） */
export function sumDeals(rows: DealStatRow[], key = "all"): DealSum {
  const s = emptySum(key);
  for (const r of rows) addTo(s, r);
  return s;
}

/** 有成交的年份（西元字串），新到舊；今年一定在裡面（年初還沒成交也要選得到今年） */
export function dealYears(rows: DealStatRow[], today: string): string[] {
  const set = new Set<string>([today.slice(0, 4)]);
  for (const r of rows) set.add(r.day.slice(0, 4));
  return [...set].sort().reverse();
}

/** 某一年的 1～12 月，沒成交的月份也回一格 0（少一格他會以為漏了） */
export function sumByMonth(rows: DealStatRow[], year: string): DealSum[] {
  const out = Array.from({ length: 12 }, (_, i) => emptySum(`${year}-${String(i + 1).padStart(2, "0")}`));
  for (const r of rows) {
    if (r.day.slice(0, 4) !== year) continue;
    const m = Number(r.day.slice(5, 7));
    if (m >= 1 && m <= 12) addTo(out[m - 1], r);
  }
  return out;
}

export type YearRow = DealSum & { months: number[] };

/** 歷年總表：每年一列，帶 12 個月的件數；新到舊 */
export function sumByYear(rows: DealStatRow[], today: string): YearRow[] {
  return dealYears(rows, today).map((y) => {
    const months = sumByMonth(rows, y);
    const total = sumDeals(rows.filter((r) => r.day.slice(0, 4) === y), y);
    return { ...total, months: months.map((m) => m.count) };
  });
}

export type MethodShare = { method: DealMethod; count: number; pct: number; perfWan: number };

/** 開發／銷售／獨得各幾件、占幾 %（四捨五入到整數，跟他的表一樣） */
export function methodShares(rows: DealStatRow[], methods: readonly DealMethod[]): MethodShare[] {
  const total = rows.length;
  return methods.map((method) => {
    const mine = rows.filter((r) => r.method === method);
    return {
      method,
      count: mine.length,
      pct: total > 0 ? Math.round((mine.length / total) * 100) : 0,
      perfWan: sumDeals(mine).perfWan,
    };
  });
}
