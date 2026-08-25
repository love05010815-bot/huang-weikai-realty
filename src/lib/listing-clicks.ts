/**
 * 👆 精選好案的點擊統計 —— 「哪一筆物件有幾個人次點過」
 *
 * ## 記的是四種不同的動作，不是攪成一個數字
 *
 * 卡片上可以點的東西意向強度差很多，混在一起看不出東西：
 *
 *   home    首頁那張卡整塊被點（→ 連到 /listings）  最弱：只是有點好奇
 *   link    「物件資訊」外連（591 之類）              想看細節
 *   video   「影片賞析」外連                          想看實景
 *   booking 「預約看屋」                              最強，這是要約了
 *
 * 「三筆物件都各 10 次」跟「其中一筆的 10 次全是預約看屋」是完全不同的情報，
 * 所以四種分開存。
 *
 * ## 這裡不存任何跟「人」有關的東西
 *
 * 一列 =（物件, 動作, 日期, 次數）。沒有 IP、沒有 cookie、沒有識別碼。
 * 跟 `site-visits.ts` 同一個原則，所以一樣不需要過 tracking-consent。
 *
 * 系統擁有者要的是**人次**（點幾次算幾次），不是不重複人數 ——
 * 所以這裡不做去重，同一個人點兩次就是 2。
 *
 * ## 為什麼要存「日期」這一欄
 *
 * 不存的話只有「從上線到現在總共幾次」，看不出「這週有沒有在動」。
 * 一筆三個月前爆紅、現在沒人看的物件，跟一筆這週剛起來的，
 * 累計數字可能一樣 —— 那個數字就沒有用了。多存一欄成本是零（同一句 upsert）。
 *
 * ## ⚠️ 連線紀律（2026-08-25 踩過）
 *
 * 這個專案 Vercel 上的 Prisma pool 只有 `connection_limit=3`。
 * 所以底下一律：**一次請求一趟 round trip、一條連線**，不用 `Promise.all` 拆開打，
 * 建表只在撞到「表不存在」時才做，撞到 P2024／P1017 退一步重試一次。
 * 詳細脈絡見 `src/lib/site-visits.ts` 的同名段落。
 */

import { db } from "@/lib/db";
import { taipeiDay } from "@/lib/site-visits";

/** 卡片上可以點的四種動作。⚠️ 新增動作要同步改 `isClickAction()` 與後台顯示 */
export const LISTING_CLICK_ACTIONS = ["home", "link", "video", "booking"] as const;
export type ListingClickAction = (typeof LISTING_CLICK_ACTIONS)[number];

export function isClickAction(value: unknown): value is ListingClickAction {
  return typeof value === "string" && (LISTING_CLICK_ACTIONS as readonly string[]).includes(value);
}

/** 後台一列物件的統計 */
export type ListingClickStat = {
  /** 四種動作加總、全期間 */
  total: number;
  /** 四種動作加總、最近 7 天（含今天） */
  recent: number;
  /** 拆開來的四種動作 */
  actions: Record<ListingClickAction, { total: number; recent: number }>;
};

/** key = 物件的 slug */
export type ListingClickStats = Record<string, ListingClickStat>;

/** 最近幾天算「近期」 */
const RECENT_DAYS = 7;

// ---------------------------------------------------------------- 連線紀律

function isConnectionError(error: unknown): boolean {
  const text = String((error as { message?: string })?.message ?? error);
  return (
    text.includes("Timed out fetching a new connection") ||
    text.includes("Server has closed the connection") ||
    text.includes("P2024") ||
    text.includes("P1017")
  );
}

function isMissingTable(error: unknown): boolean {
  const text = String((error as { message?: string })?.message ?? error);
  return text.includes("1146") || /doesn.t exist/i.test(text);
}

async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isConnectionError(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 350));
    return run();
  }
}

// ---------------------------------------------------------------- 建表

/**
 * 建表。**只在讀寫撞到「表不存在」時才會被呼叫**，不是每次冷啟動都跑 ——
 * 那會多佔一條稀缺的連線去做一件幾乎永遠不必做的事。
 */
export async function ensureListingClickTable(): Promise<void> {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS listing_click (
      slug   VARCHAR(120) NOT NULL,
      action VARCHAR(16)  NOT NULL,
      day    CHAR(10)     NOT NULL,
      clicks INT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (slug, action, day)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

// ---------------------------------------------------------------- 寫

const INSERT_SQL = `INSERT INTO listing_click (slug, action, day, clicks) VALUES (?, ?, ?, 1)
   ON DUPLICATE KEY UPDATE clicks = clicks + 1`;

/** 記一次點擊。回傳 false 代表沒記成功 —— 呼叫端不要因此讓畫面壞掉。 */
export async function recordListingClick(slug: string, action: ListingClickAction): Promise<void> {
  const day = taipeiDay();
  await withRetry(async () => {
    try {
      await db.$executeRawUnsafe(INSERT_SQL, slug, action, day);
    } catch (error) {
      if (!isMissingTable(error)) throw error;
      await ensureListingClickTable();
      await db.$executeRawUnsafe(INSERT_SQL, slug, action, day);
    }
  });
}

// ---------------------------------------------------------------- 讀

type StatRow = { slug: unknown; action: unknown; total: unknown; recent: unknown };

/** ⚠️ SUM() 在 TiDB 回 DECIMAL、Prisma 給字串。不要相信欄位型別，一律轉。 */
function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptyStat(): ListingClickStat {
  const actions = {} as ListingClickStat["actions"];
  for (const a of LISTING_CLICK_ACTIONS) actions[a] = { total: 0, recent: 0 };
  return { total: 0, recent: 0, actions };
}

/**
 * 全部物件的統計，**一趟 query 撈完**（不是一筆物件打一次）。
 *
 * `day` 是 `YYYY-MM-DD` 字串，ISO 日期的字典順序等於時間順序，
 * 所以 `day >= ?` 可以直接比字串，不用轉型。
 */
export async function getListingClickStats(): Promise<ListingClickStats> {
  const since = taipeiDay(new Date(Date.now() - (RECENT_DAYS - 1) * 24 * 60 * 60 * 1000));

  const run = async () =>
    db.$queryRawUnsafe<StatRow[]>(
      `SELECT slug,
              action,
              SUM(clicks)                                          AS total,
              COALESCE(SUM(CASE WHEN day >= ? THEN clicks END), 0)  AS recent
       FROM listing_click
       GROUP BY slug, action`,
      since,
    );

  const rows = await withRetry(async () => {
    try {
      return await run();
    } catch (error) {
      // 表還沒建（還沒有人點過任何東西）＝統計是空的，不是錯誤
      if (isMissingTable(error)) return [] as StatRow[];
      throw error;
    }
  });

  const stats: ListingClickStats = {};
  for (const row of rows) {
    const slug = String(row.slug ?? "");
    const action = row.action;
    if (!slug || !isClickAction(action)) continue;

    const stat = (stats[slug] ??= emptyStat());
    const total = toNumber(row.total);
    const recent = toNumber(row.recent);

    stat.actions[action] = { total, recent };
    stat.total += total;
    stat.recent += recent;
  }
  return stats;
}
