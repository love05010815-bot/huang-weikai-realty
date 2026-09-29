/**
 * 👁 房產消息的點閱次數
 *
 * 後台每篇文章旁邊顯示「幾次點閱」，讓他知道哪篇客戶真的有在看。
 *
 * ## 算的是「打開這篇內頁」，不是「在列表看到卡片」
 *
 * `/news` 列表捲過去十張卡片都會被看到，那個數字沒有意義。
 * **打開 `/news/<slug>` 內頁才算一次**，那才代表真的點進去看了。
 *
 * ## 不存任何跟「人」有關的東西
 *
 * 一列 =（文章 id, 日期, 次數）。沒有 IP、沒有 cookie、沒有識別碼，
 * 跟 `site-visits.ts`／`video-views.ts`／`listing-clicks.ts` 同一個原則，
 * 不用過 tracking-consent。算的是**人次**（按幾次算幾次），不做去重。
 *
 * ## ⚠️ 連線紀律
 *
 * Vercel 上 Prisma pool 只有 connection_limit=3。一次請求一趟 round trip、
 * 建表只在撞到 1146 才做、撞到 P2024／P1017 退一步重試一次。
 * 脈絡見 `src/lib/site-visits.ts`。
 */

import { db } from "@/lib/db";
import { taipeiDay } from "@/lib/site-visits";

/** key = 文章 id，value = 累計點閱次數 */
export type PostViewCounts = Record<string, number>;

/**
 * 後台看的：累計 ＋ 近 7 天。
 *
 * 欄位名 `total` / `recent` 跟 `video-views.ts`／`listing-clicks.ts` 一致，
 * 後台這幾頁的版型才共用得了。
 */
export type PostViewStat = { total: number; recent: number };
export type PostViewStats = Record<string, PostViewStat>;

/** 「近 N 天」的 N。跟 video-views.ts／listing-clicks.ts 一樣是 7，含今天。 */
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

export async function ensurePostViewTable(): Promise<void> {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS site_post_view (
      post_id VARCHAR(36)  NOT NULL,
      day     CHAR(10)     NOT NULL,
      views   INT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (post_id, day)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

// ---------------------------------------------------------------- 寫

const INSERT_SQL = `INSERT INTO site_post_view (post_id, day, views) VALUES (?, ?, 1)
   ON DUPLICATE KEY UPDATE views = views + 1`;

export async function recordPostView(postId: string): Promise<void> {
  const day = taipeiDay();
  await withRetry(async () => {
    try {
      await db.$executeRawUnsafe(INSERT_SQL, postId, day);
    } catch (error) {
      if (!isMissingTable(error)) throw error;
      await ensurePostViewTable();
      await db.$executeRawUnsafe(INSERT_SQL, postId, day);
    }
  });
}

// ---------------------------------------------------------------- 讀

type Row = { post_id: unknown; total: unknown; recent: unknown };

/** ⚠️ SUM() 在 TiDB 回 DECIMAL，Prisma 給字串。不要相信欄位型別，一律轉。 */
function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 近 7 天的起算日（含今天），`YYYY-MM-DD` */
function recentSince(): string {
  const today = taipeiDay();
  const t = Date.parse(`${today}T00:00:00Z`);
  return new Date(t - (RECENT_DAYS - 1) * 86400000).toISOString().slice(0, 10);
}

/**
 * 全部文章的點閱次數，**一趟 query 撈完**（不是一篇文章打一次）。
 * 累計與近 7 天在同一句 SQL 裡算完 —— 分兩句就是兩趟 round trip，
 * 而 Vercel 上 pool 只有 3 條。
 *
 * 🔴 讀不到就回空物件，**不要往上丟錯誤** —— 點閱次數是附加資訊，
 * 它壞掉不該讓後台打不開。
 */
export async function getPostViewStats(): Promise<PostViewStats> {
  const since = recentSince();
  const run = () =>
    db.$queryRawUnsafe<Row[]>(
      `SELECT post_id,
              SUM(views)                                        AS total,
              COALESCE(SUM(CASE WHEN day >= ? THEN views END), 0) AS recent
         FROM site_post_view
        GROUP BY post_id`,
      since,
    );

  try {
    const rows = await withRetry(async () => {
      try {
        return await run();
      } catch (error) {
        // 表還沒建 ＝ 還沒有人點過任何文章，不是錯誤
        if (isMissingTable(error)) return [] as Row[];
        throw error;
      }
    });

    const out: PostViewStats = {};
    for (const row of rows) {
      const id = String(row.post_id ?? "");
      if (id) out[id] = { total: toNumber(row.total), recent: toNumber(row.recent) };
    }
    return out;
  } catch (error) {
    console.error("[post-views] 讀不到點閱次數:", error);
    return {};
  }
}

/** 前台如果之後要用（例如「熱門文章」排序），只需要累計數字。故意共用同一句 SQL。 */
export async function getPostViewCounts(): Promise<PostViewCounts> {
  const stats = await getPostViewStats();
  const out: PostViewCounts = {};
  for (const [id, stat] of Object.entries(stats)) out[id] = stat.total;
  return out;
}

/** 刪文章時把它的點閱紀錄一起清掉，不要留孤兒資料 */
export async function deletePostViews(postId: string): Promise<void> {
  try {
    await withRetry(() =>
      db.$executeRawUnsafe(`DELETE FROM site_post_view WHERE post_id = ?`, postId),
    );
  } catch (error) {
    // 清不掉不影響刪文章本身 —— 那幾列是孤兒資料，不會顯示也不會出錯
    if (!isMissingTable(error)) console.error("[post-views] 清點閱紀錄失敗:", error);
  }
}
