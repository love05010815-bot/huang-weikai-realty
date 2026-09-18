/**
 * 📰 房產消息 —— 前台 `/news` 上那些文章的資料層
 *
 * 這是「房產新聞 → 待產文案」的最後一段：他在 `/admin/content` 改寫好的稿，
 * 按「放到前台」就會變成這張表的一筆草稿，到 `/admin/posts` 潤稿、配圖、發佈。
 * 也可以完全不經過新聞系統，直接在 `/admin/posts` 按「寫一篇新的」貼上去
 * （第一篇「第二戶房貸放寬至7成」就是這樣進來的，他自己在外面寫好的）。
 *
 * ## 兩個狀態就好，不要三個
 *
 *   draft      草稿。前台**完全看不到**（列表、內頁、sitemap 都沒有它）
 *   published  已發佈。前台看得到
 *
 * 影音那張表是 active／hidden，這裡刻意不照抄 —— 影音是「先有片再上架」，
 * 文章是「先有草稿再發佈」，多一個 hidden 只會讓他每次都要想「下架跟草稿差在哪」。
 * 收回來就是回草稿，網址照舊（同一個 slug 再發佈會回到原網址，不會斷）。
 *
 * ## 網址（slug）自動產生，不讓他自己取
 *
 * 中文 slug 貼到 LINE 會變成 `%E7%AC%AC%E4%BA%8C...` 一長串亂碼，
 * 他一天要傳好幾次連結給客戶，這比 SEO 那一點點好處重要得多。
 * 所以是 `p20260918a` 這種：日期看得出來、排序正確、複製貼上乾淨。
 * ⚠️ slug 一旦發佈就**不要再改** —— 客戶傳出去的連結會死掉，Google 也要重收一次。
 *
 * ## 時間一律存台北時間字串
 *
 * 理由跟 `news.ts`／`site-visits.ts` 同一個：Vercel 跑 UTC、TiDB 也是 UTC，
 * 用 DATETIME 會多一次時區換算，而那種錯誤是「默默差 8 小時」，不會報錯。
 *
 * ## 連線紀律
 *
 * Vercel 上 Prisma pool 只有 connection_limit=3。一次請求一趟 round trip、
 * 建表只在撞到 1146 才做、撞到 P2024／P1017 退一步重試一次。
 */

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { taipeiStamp } from "@/lib/news-fetch";
import { postExcerpt } from "@/lib/posts-text";
import { taipeiDay } from "@/lib/site-visits";

// ---------------------------------------------------------------- 型別

/**
 * 分類。他要的是「最新消息**及**知識」，所以就是這兩類，不要先開一堆空的分類 ——
 * 前台會出現「這個分類還沒有文章」的空頁，那比沒有那個分類更糟。
 * 之後真要加（例如「稅務法規」），在這裡加一行，前後台一起長出來。
 */
export const POST_CATEGORIES = ["news", "knowledge"] as const;
export type PostCategory = (typeof POST_CATEGORIES)[number];

export const POST_CATEGORY_META: Record<PostCategory, { label: string; eyebrow: string; desc: string }> = {
  news: {
    label: "房市快訊",
    eyebrow: "MARKET NEWS",
    desc: "央行政策、房貸成數、稅制與法規異動。跟你買賣有關的，我整理成人話再放上來。",
  },
  knowledge: {
    label: "房產知識",
    eyebrow: "KNOW-HOW",
    desc: "買賣流程、貸款試算、稅費怎麼算、合約要看哪裡。先搞懂再決定，比較不會踩雷。",
  },
};

export function isPostCategory(value: unknown): value is PostCategory {
  return typeof value === "string" && (POST_CATEGORIES as readonly string[]).includes(value);
}

export const POST_STATUSES = ["draft", "published"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const POST_STATUS_LABEL: Record<PostStatus, string> = {
  draft: "草稿",
  published: "已發佈",
};

export function isPostStatus(value: unknown): value is PostStatus {
  return value === "draft" || value === "published";
}

export type PostRecord = {
  id: string;
  /** 網址用的代號，例如 `p20260918a`。發佈後不要改 */
  slug: string;
  category: PostCategory;
  title: string;
  /** 列表卡片與 og:description 用。留白的話前台自己從內文截 */
  summary: string;
  body: string;
  /** 封面圖網址（Vercel Blob）。沒有的話前台畫一張漸層底圖，不會破圖 */
  coverUrl: string;
  /** 原文連結（從新聞改寫的就帶著來源，純知識文章可以留白） */
  sourceUrl: string;
  sourceName: string;
  status: PostStatus;
  /** 釘在最上面 */
  pinned: boolean;
  /** 對外顯示的日期時間，台北時間 `YYYY-MM-DD HH:MM:SS`。他可以自己改 */
  publishedAt: string;
  createdAt: string;
  updatedAt: string | null;
  /** 從待產文案哪一題帶過來的（`news_task.id`）。自己寫的就是空字串 */
  taskId: string;
};

/** 前台列表要的欄位。內文不帶 —— 一頁 30 篇的內文加起來很肥，列表用不到。 */
export type PublicPostCard = {
  id: string;
  slug: string;
  category: PostCategory;
  title: string;
  summary: string;
  coverUrl: string;
  publishedAt: string;
  pinned: boolean;
};

export type PostInput = {
  category: PostCategory;
  title: string;
  summary: string;
  body: string;
  coverUrl: string;
  sourceUrl: string;
  sourceName: string;
  status: PostStatus;
  pinned: boolean;
  /** 空字串＝沿用原本的時間（新文章則是現在） */
  publishedAt: string;
  taskId?: string;
};

// ---------------------------------------------------------------- 連線紀律

function errorText(error: unknown): string {
  return String((error as { message?: string })?.message ?? error);
}

function isConnectionError(error: unknown): boolean {
  const text = errorText(error);
  return (
    text.includes("Timed out fetching a new connection") ||
    text.includes("Server has closed the connection") ||
    text.includes("P2024") ||
    text.includes("P1017")
  );
}

function isMissingTable(error: unknown): boolean {
  const text = errorText(error);
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

/** 撞到「表不存在」就建表再試一次；其餘錯誤照樣往外丟。 */
async function withSchema<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await withRetry(run);
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    await ensurePostTables();
    return withRetry(run);
  }
}

// ---------------------------------------------------------------- 建表

/**
 * 建表。只在讀寫撞到「表不存在」時才會被呼叫 ——
 * 不要每次冷啟動無條件跑一次，那會多佔一條稀缺的連線。
 */
export async function ensurePostTables(): Promise<void> {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS site_post (
      id           VARCHAR(36)   NOT NULL,
      slug         VARCHAR(80)   NOT NULL,
      category     VARCHAR(16)   NOT NULL DEFAULT 'news',
      title        VARCHAR(255)  NOT NULL,
      summary      VARCHAR(500)  NULL,
      body         MEDIUMTEXT    NOT NULL,
      cover_url    VARCHAR(500)  NULL,
      source_url   VARCHAR(2000) NULL,
      source_name  VARCHAR(120)  NULL,
      status       VARCHAR(16)   NOT NULL DEFAULT 'draft',
      pinned       TINYINT       NOT NULL DEFAULT 0,
      published_at VARCHAR(19)   NOT NULL,
      created_at   VARCHAR(19)   NOT NULL,
      updated_at   VARCHAR(19)   NULL,
      task_id      VARCHAR(36)   NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_site_post_slug (slug),
      KEY idx_site_post_public (status, pinned, published_at),
      KEY idx_site_post_cat (category, published_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

// ---------------------------------------------------------------- 讀

type PostRow = {
  id: string;
  slug: string;
  category: string;
  title: string;
  summary: string | null;
  body: string;
  cover_url: string | null;
  source_url: string | null;
  source_name: string | null;
  status: string;
  pinned: number;
  published_at: string;
  created_at: string;
  updated_at: string | null;
  task_id: string | null;
};

const POST_COLUMNS =
  "id, slug, category, title, summary, body, cover_url, source_url, source_name, status, pinned, published_at, created_at, updated_at, task_id";

function toPost(r: PostRow): PostRecord {
  return {
    id: r.id,
    slug: r.slug,
    category: isPostCategory(r.category) ? r.category : "news",
    title: r.title,
    summary: r.summary ?? "",
    body: r.body ?? "",
    coverUrl: r.cover_url ?? "",
    sourceUrl: r.source_url ?? "",
    sourceName: r.source_name ?? "",
    status: isPostStatus(r.status) ? r.status : "draft",
    pinned: Number(r.pinned) === 1,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    taskId: r.task_id ?? "",
  };
}

/**
 * 後台清單：草稿與已發佈全部都要，釘選的在最上面、再依發佈時間新到舊。
 */
export async function listAllPosts(limit = 300): Promise<PostRecord[]> {
  const rows = await withSchema(() =>
    db.$queryRawUnsafe<PostRow[]>(
      `SELECT ${POST_COLUMNS} FROM site_post ORDER BY pinned DESC, published_at DESC, created_at DESC LIMIT ?`,
      limit,
    ),
  );
  return rows.map(toPost);
}

export async function getPost(id: string): Promise<PostRecord | null> {
  const rows = await withSchema(() =>
    db.$queryRawUnsafe<PostRow[]>(`SELECT ${POST_COLUMNS} FROM site_post WHERE id = ? LIMIT 1`, id),
  );
  return rows.length ? toPost(rows[0]) : null;
}

/**
 * 前台列表。**只回已發佈的**，而且內文不帶回來。
 *
 * 🔴 這支跟 `getPublicPost()` 是資料庫到前台的唯一兩個出口 ——
 *    要讓某篇文章不給客戶看，把 status 改成 draft 就好，不要在畫面上藏它。
 */
export async function getPublicPosts(limit = 60): Promise<PublicPostCard[]> {
  try {
    const rows = await withSchema(() =>
      db.$queryRawUnsafe<
        Pick<PostRow, "id" | "slug" | "category" | "title" | "summary" | "body" | "cover_url" | "published_at" | "pinned">[]
      >(
        `SELECT id, slug, category, title, summary, body, cover_url, published_at, pinned
           FROM site_post WHERE status = 'published'
          ORDER BY pinned DESC, published_at DESC LIMIT ?`,
        limit,
      ),
    );
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      category: isPostCategory(r.category) ? r.category : "news",
      title: r.title,
      // 他沒填摘要就從內文截一段，卡片不要開天窗
      summary: (r.summary ?? "").trim() || postExcerpt(r.body ?? ""),
      coverUrl: r.cover_url ?? "",
      publishedAt: r.published_at,
      pinned: Number(r.pinned) === 1,
    }));
  } catch (error) {
    // 讀不到就回空陣列 —— 這頁不能因為資料庫抽風就整個 500
    console.error("[posts] 讀不到文章:", error);
    return [];
  }
}

/** 前台內頁。草稿讀不到（回 null → 那頁 404）。 */
export async function getPublicPost(slug: string): Promise<PostRecord | null> {
  try {
    const rows = await withSchema(() =>
      db.$queryRawUnsafe<PostRow[]>(
        `SELECT ${POST_COLUMNS} FROM site_post WHERE slug = ? AND status = 'published' LIMIT 1`,
        slug,
      ),
    );
    return rows.length ? toPost(rows[0]) : null;
  } catch (error) {
    console.error("[posts] 讀不到這篇文章:", error);
    return null;
  }
}

// ---------------------------------------------------------------- slug

const SLUG_SUFFIX = "abcdefghijklmnopqrstuvwxyz";

/**
 * 產生今天的下一個網址代號：`p20260918a`、`p20260918b`…
 *
 * 同一天超過 26 篇（不會發生，但不要讓它爆掉）就退回亂數尾碼。
 */
export async function nextPostSlug(): Promise<string> {
  const day = taipeiDay().replace(/-/g, "");
  const prefix = `p${day}`;
  const rows = await withSchema(() =>
    db.$queryRawUnsafe<{ slug: string }[]>("SELECT slug FROM site_post WHERE slug LIKE ?", `${prefix}%`),
  );
  const used = new Set(rows.map((r) => r.slug));
  for (const c of SLUG_SUFFIX) {
    if (!used.has(`${prefix}${c}`)) return `${prefix}${c}`;
  }
  return `${prefix}${randomUUID().slice(0, 4)}`;
}

// ---------------------------------------------------------------- 驗證

export type ValidatedPost = { ok: true; value: PostInput } | { ok: false; error: string };

/** 欄位長度對齊建表的宣告 —— 超過長度 MySQL 會**默默截斷**，不會報錯。 */
export function validatePost(input: PostInput): ValidatedPost {
  const title = (input.title ?? "").trim().slice(0, 255);
  const summary = (input.summary ?? "").trim().slice(0, 500);
  const body = (input.body ?? "").replace(/\r\n?/g, "\n").trim();
  const coverUrl = (input.coverUrl ?? "").trim().slice(0, 500);
  const sourceUrl = (input.sourceUrl ?? "").trim().slice(0, 2000);
  const sourceName = (input.sourceName ?? "").trim().slice(0, 120);
  const publishedAt = (input.publishedAt ?? "").trim();

  if (!title) return { ok: false, error: "標題不能空白" };
  if (!isPostCategory(input.category)) return { ok: false, error: "分類不對" };
  if (!body) return { ok: false, error: "內文不能空白" };
  if (!isPostStatus(input.status)) return { ok: false, error: "狀態不對" };
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) {
    return { ok: false, error: "原文連結要以 http:// 或 https:// 開頭" };
  }
  if (publishedAt && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(publishedAt)) {
    return { ok: false, error: "發佈時間的格式要是 YYYY-MM-DD HH:MM:SS" };
  }

  return {
    ok: true,
    value: {
      category: input.category,
      title,
      summary,
      body,
      coverUrl,
      sourceUrl,
      sourceName,
      status: input.status,
      pinned: !!input.pinned,
      publishedAt,
      taskId: (input.taskId ?? "").trim().slice(0, 36),
    },
  };
}

// ---------------------------------------------------------------- 寫

export async function createPost(input: PostInput): Promise<{ id: string; slug: string }> {
  const id = randomUUID();
  const slug = await nextPostSlug();
  const now = taipeiStamp();
  await withSchema(() =>
    db.$executeRawUnsafe(
      `INSERT INTO site_post
         (id, slug, category, title, summary, body, cover_url, source_url, source_name, status, pinned, published_at, created_at, task_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      slug,
      input.category,
      input.title,
      input.summary,
      input.body,
      input.coverUrl,
      input.sourceUrl,
      input.sourceName,
      input.status,
      input.pinned ? 1 : 0,
      input.publishedAt || now,
      now,
      input.taskId || null,
    ),
  );
  return { id, slug };
}

export async function updatePost(id: string, input: PostInput): Promise<void> {
  const now = taipeiStamp();
  await withSchema(() =>
    db.$executeRawUnsafe(
      `UPDATE site_post SET category = ?, title = ?, summary = ?, body = ?, cover_url = ?,
              source_url = ?, source_name = ?, status = ?, pinned = ?,
              published_at = COALESCE(NULLIF(?, ''), published_at), updated_at = ?
        WHERE id = ?`,
      input.category,
      input.title,
      input.summary,
      input.body,
      input.coverUrl,
      input.sourceUrl,
      input.sourceName,
      input.status,
      input.pinned ? 1 : 0,
      input.publishedAt,
      now,
      id,
    ),
  );
}

export async function setPostStatus(id: string, status: PostStatus): Promise<void> {
  await withSchema(() =>
    db.$executeRawUnsafe("UPDATE site_post SET status = ?, updated_at = ? WHERE id = ?", status, taipeiStamp(), id),
  );
}

export async function setPostPinned(id: string, pinned: boolean): Promise<void> {
  await withSchema(() =>
    db.$executeRawUnsafe(
      "UPDATE site_post SET pinned = ?, updated_at = ? WHERE id = ?",
      pinned ? 1 : 0,
      taipeiStamp(),
      id,
    ),
  );
}

/**
 * 刪掉一篇。
 *
 * ⚠️ 只刪這一個 id，**沒有任何一支函式會整表刪** —— 這是 `learning_destructive_db_cleanup`
 *    那次誤刪換來的規矩。封面圖留在 Blob 不動（別篇可能也在用同一張）。
 */
export async function deletePost(id: string): Promise<void> {
  await withSchema(() => db.$executeRawUnsafe("DELETE FROM site_post WHERE id = ?", id));
}
