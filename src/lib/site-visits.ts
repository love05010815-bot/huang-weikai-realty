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
 * 如果要把歷史瀏覽數接上來，把真實的累計數設進 Vercel 環境變數
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

// ---------------------------------------------------------------- 連線很稀缺

/**
 * ⚠️ 這個專案的資料庫連線很稀缺：Vercel 上每個 serverless function 的
 * Prisma pool 是 `connection_limit=3`、`pool_timeout=5`（見 `src/lib/db.ts`），
 * 上游 TiDB Cloud 還有叢集層級的上限。
 *
 * 2026-08-25 線上實測到 `P2024 Timed out fetching a new connection` ——
 * 計數器整個消失，而且**不報錯、頁面照常打得開**（API 回 200 帶
 * `available:false`）。同一時間 `/admin/inbox` 的 YouTube／FB／IG 抓取
 * 也在吃同一個錯。
 *
 * 所以這支的原則是：**一次請求只佔用一條連線、只打一趟 round trip**，
 * 撞到連線錯誤時退一步重試一次（冷啟動搶連線是暫時的）。
 * 原本用 `Promise.all` 同時打兩個 query —— 那等於一次抓兩條連線，
 * 在只有 3 條的池子裡是自己人跟自己人搶。
 */

/** 撞到「連線拿不到／連線被關掉」時值得重試；其他錯誤重試沒有意義 */
function isConnectionError(error: unknown): boolean {
  const text = String((error as { message?: string })?.message ?? error);
  return (
    text.includes("Timed out fetching a new connection") ||
    text.includes("Server has closed the connection") ||
    text.includes("P2024") ||
    text.includes("P1017")
  );
}

/** 表還沒建的錯（MySQL 1146）。第一次跑、或換了資料庫時會遇到 */
function isMissingTable(error: unknown): boolean {
  const text = String((error as { message?: string })?.message ?? error);
  return text.includes("1146") || /doesn.t exist/i.test(text);
}

async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isConnectionError(error)) throw error;
    // 冷啟動搶連線是暫時的，等一下再試一次通常就過了
    await new Promise((resolve) => setTimeout(resolve, 350));
    return run();
  }
}

// ---------------------------------------------------------------- 建表

/**
 * 建表。
 *
 * ⚠️ 這支**不是每次請求都跑** —— 只在讀寫時撞到「表不存在」才會被呼叫。
 * 原本的寫法是每個 lambda 冷啟動先無條件跑一次 `CREATE TABLE IF NOT EXISTS`，
 * 等於每次冷啟動都多花一趟 round trip 跟一條連線，去做一件幾乎永遠不必做的事。
 */
export async function ensureSiteVisitTable(): Promise<void> {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS site_visit_daily (
      day    CHAR(10)     NOT NULL,
      visits INT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (day)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

// ---------------------------------------------------------------- 讀 / 寫

type CountsRow = { today: unknown; total: unknown };

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

const INSERT_SQL = `INSERT INTO site_visit_daily (day, visits) VALUES (?, 1)
   ON DUPLICATE KEY UPDATE visits = visits + 1`;

/**
 * 今日與累計一次撈完 —— **一趟 round trip、一條連線**。
 *
 * 分成兩個 query 用 `Promise.all` 打會同時佔用兩條連線，
 * 在 `connection_limit=3` 的池子裡是自己跟自己搶。
 */
async function selectCounts(day: string): Promise<VisitCounts> {
  const rows = await db.$queryRawUnsafe<CountsRow[]>(
    `SELECT
       COALESCE(SUM(CASE WHEN day = ? THEN visits END), 0) AS today,
       COALESCE(SUM(visits), 0)                            AS total
     FROM site_visit_daily`,
    day,
  );
  return {
    today: toNumber(rows[0]?.today),
    total: seedCount() + toNumber(rows[0]?.total),
  };
}

/** 只讀不寫 —— 已經算過的訪客重新整理頁面時走這條 */
export async function readVisitCounts(): Promise<VisitCounts> {
  const day = taipeiDay();
  return withRetry(async () => {
    try {
      return await selectCounts(day);
    } catch (error) {
      if (!isMissingTable(error)) throw error;
      await ensureSiteVisitTable();
      return selectCounts(day);
    }
  });
}

/** 記一次人氣，然後回傳更新後的數字 */
export async function recordVisit(): Promise<VisitCounts> {
  const day = taipeiDay();
  return withRetry(async () => {
    try {
      await db.$executeRawUnsafe(INSERT_SQL, day);
    } catch (error) {
      if (!isMissingTable(error)) throw error;
      await ensureSiteVisitTable();
      await db.$executeRawUnsafe(INSERT_SQL, day);
    }
    return selectCounts(day);
  });
}
