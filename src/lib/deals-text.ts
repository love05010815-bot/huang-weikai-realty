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

/**
 * 歷年每月件數（表 deal_legacy_count）：109～114 年他只有每月成交幾件、沒有一筆一筆的明細，
 * 所以只存件數。ym 是 "2025-03"。
 */
export type LegacyCount = { ym: string; count: number };

/** 有成交的年份（西元字串），新到舊；今年一定在裡面（年初還沒成交也要選得到今年） */
export function dealYears(rows: DealStatRow[], today: string, legacy: LegacyCount[] = []): string[] {
  const set = new Set<string>([today.slice(0, 4)]);
  for (const r of rows) set.add(r.day.slice(0, 4));
  for (const l of legacy) if (l.count > 0) set.add(l.ym.slice(0, 4));
  return [...set].sort().reverse();
}

/**
 * 某一年 12 個月的件數：每個月取「建檔的筆數」與「歷年件數」**比較大的那個**。
 * 不是相加——他哪天把 114 年的明細補建進來，同一個月才不會被算兩次；
 * 補到跟歷年件數一樣多之後，數字就完全由建檔的接手。
 */
export function monthCounts(rows: DealStatRow[], legacy: LegacyCount[], year: string): { counts: number[]; legacyOnly: number } {
  const recorded = sumByMonth(rows, year).map((m) => m.count);
  const counts = [...recorded];
  for (const l of legacy) {
    if (l.ym.slice(0, 4) !== year) continue;
    const i = Number(l.ym.slice(5, 7)) - 1;
    if (i >= 0 && i < 12 && l.count > counts[i]) counts[i] = l.count;
  }
  const total = counts.reduce((a, b) => a + b, 0);
  const rec = recorded.reduce((a, b) => a + b, 0);
  // legacyOnly：只有件數、沒有明細的有幾件（畫面上要講清楚金額沒算到它們）
  return { counts, legacyOnly: total - rec };
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

export type YearRow = DealSum & {
  months: number[];
  /** 有明細（建過檔）的件數；金額只算得到這些 */
  recorded: number;
  /** 只有件數、沒有明細的件數 */
  legacyOnly: number;
};

/** 歷年總表：每年一列，帶 12 個月的件數（含歷年件數）；新到舊。count 是合併後的件數，金額只來自建檔的。 */
export function sumByYear(rows: DealStatRow[], today: string, legacy: LegacyCount[] = []): YearRow[] {
  return dealYears(rows, today, legacy).map((y) => {
    const total = sumDeals(rows.filter((r) => r.day.slice(0, 4) === y), y);
    const { counts, legacyOnly } = monthCounts(rows, legacy, y);
    return { ...total, count: total.count + legacyOnly, months: counts, recorded: total.count, legacyOnly };
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
