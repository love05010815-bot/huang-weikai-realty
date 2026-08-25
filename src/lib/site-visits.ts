/**
 * 📊 網站人氣計數器 —— 「今日人氣 / 統計人氣」
 *
 * ## 這裡不存任何跟「人」有關的東西
 *
 * 資料庫裡只有兩欄：日期、那天的次數。**沒有 IP、沒有 cookie、沒有雜湊過的
 * 識別碼、沒有任何可以還原成某個人的東西。** 所以這支不需要過同意權
 * （`tracking-consent`）—— 它跟 GA4／Meta CAPI 那些不是同一類東西，
 * 那些是為了辨識個別使用者，這支只是把整數加一。
 *
 * 「同一個人今天只算一次」的判斷**完全在瀏覽器端**做（localStorage 存一個
 * 當天的旗標），伺服器這邊看到的永遠只是「有人來了，+1」。
 *
 * ## 時區：一定要用台北時間算「今天」
 *
 * Vercel 的機器跑 UTC。如果直接用 `new Date().toISOString()` 取日期，
 * 「今日人氣」會在**台灣時間早上 8 點**歸零，不是午夜 —— 早上 7 點看到的
 * 數字還是昨天的，而且不會報錯、不會有人發現。所以底下一律用 `taipeiDay()`。
 *
 * ## `day` 為什麼是 CHAR(10) 不是 DATE
 *
 * 用 DATE 的話，值從資料庫讀回來會變成 JS `Date` 物件，中間又要再過一次
 * 時區換算 —— 又一個會默默差一天的機會。存成 `"2026-08-25"` 字串，
 * 進去什麼樣出來就什麼樣。
 */

import { db } from "@/lib/db";

/**
 * 網站上線前就已經累積的瀏覽數，會加進「統計人氣」。
 *
 * 預設 0 = 從裝這個計數器的那天開始從頭算，顯示的是真實數字。
 * 如果要把 GA4 的歷史瀏覽數接上來，把真實的累計數設進 Vercel 環境變數
 * `SITE_VISIT_SEED` 即可（設完要重新部署）。
 *
 * ⚠️ 這個數字會公開顯示給客戶看，填假的就是對外不實陳述，別亂填。
 */
function seedCount(): number {
  const raw = Number.parseInt(process.env.SITE_VISIT_SEED || "0", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/** 台北時間的今天，格式 `YYYY-MM-DD`。台灣沒有日光節約時間，固定 UTC+8。 */
export function taipeiDay(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export type VisitCounts = {
  /** 台北時間今天的人氣 */
  today: number;
  /** 累計人氣（含 SITE_VISIT_SEED 的歷史數） */
  total: number;
};

// ---------------------------------------------------------------- 建表

let ensured = false;

export async function ensureSiteVisitTable(): Promise<void> {
  if (ensured) return;
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS site_visit_daily (
      day    CHAR(10)     NOT NULL,
      visits INT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (day)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  ensured = true;
}

// ---------------------------------------------------------------- 讀 / 寫

type SumRow = { total: unknown };
type DayRow = { visits: unknown };

/**
 * 資料庫回來的數字統一轉成 JS number。
 *
 * ⚠️ 這裡踩過坑：**`SUM()` 在 TiDB 回的是 DECIMAL，Prisma 給的是「字串」**，
 * 不是 number 也不是 bigint。原本寫成 `seedCount() + total` 的話，
 * `0 + "2"` 會變成字串黏接 `"02"` —— API 照樣回 200、build 照樣過、
 * TypeScript 也沒話說（因為型別是我自己標錯的），只有畫面默默不顯示。
 * 所以這裡一律走 `Number(String(value))`，不要相信欄位型別。
 */
function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 只讀不寫 —— 已經算過的訪客重新整理頁面時走這條 */
export async function readVisitCounts(): Promise<VisitCounts> {
  await ensureSiteVisitTable();
  const day = taipeiDay();

  const [todayRows, sumRows] = await Promise.all([
    db.$queryRawUnsafe<DayRow[]>(`SELECT visits FROM site_visit_daily WHERE day = ?`, day),
    db.$queryRawUnsafe<SumRow[]>(`SELECT SUM(visits) AS total FROM site_visit_daily`),
  ]);

  return {
    today: toNumber(todayRows[0]?.visits),
    total: seedCount() + toNumber(sumRows[0]?.total),
  };
}

/** 記一次人氣，然後回傳更新後的數字 */
export async function recordVisit(): Promise<VisitCounts> {
  await ensureSiteVisitTable();
  const day = taipeiDay();

  await db.$executeRawUnsafe(
    `INSERT INTO site_visit_daily (day, visits) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE visits = visits + 1`,
    day,
  );

  return readVisitCounts();
}
