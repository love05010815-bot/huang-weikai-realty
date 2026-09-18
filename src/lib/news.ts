/**
 * 📰 房產新聞 —— 資料層與「每天抓一次」的流程。
 *
 * 四張表，第一次用到時自己建（跟 site_video 同一套，撞到 1146 才建）：
 *   news_item  抓進來的新聞：標題、網址、來源、地區、摘要、全文、處理狀態
 *   news_run   每次抓取的紀錄：哪一天、誰觸發、抓到幾則、新增幾則、過程 log
 *   news_task  「待產文案」：他按「拿去做」選的線（知識文章／短影音），一則新聞一條線一筆
 *   news_draft 「派工寫稿」：ChatGPT 替某一題寫出來的文案，每按一次多一筆（舊版留著可以比）
 *
 * news_item.status 只是 news_task 的快取（沒排＝new、有待做＝picked、全做完＝done），
 * 每次動 news_task 都用 syncNewsStatus() 重算，不要在別處直接改它。
 *
 * ## 時間一律存字串或毫秒，不用 DATETIME
 *
 * Vercel 跑 UTC、TiDB 也是 UTC；DATETIME 讀回來會變 JS Date、再過一次時區換算，
 * 又是一個會默默差 8 小時的機會。所以 `published_at`／`fetched_at` 存台北時間字串
 * `YYYY-MM-DD HH:MM:SS`（排序照樣正確），`news_run` 的時間存 epoch 毫秒。
 * 理由與 `site-visits.ts` 的 CHAR(10) 同一個。
 *
 * ## 「每天一次」怎麼保證
 *
 * `runDailyNewsFetch()` 自己判斷該不該跑：台北時間過了 09:00、今天還沒成功過、
 * 沒有另一次正在跑（10 分鐘內開始的 running 紀錄）。所以觸發它的端點可以公開 ——
 * 誰來打都一樣，一天最多成功一次，失敗最多再試 `maxAutoAttemptsPerDay` 次。
 * 觸發來源是 `.github/workflows/keep-warm.yml`（每 10 分鐘一次），不需要任何新的密鑰。
 *
 * ## 連線紀律
 *
 * Vercel 上 Prisma pool 只有 connection_limit=3。一次請求一趟 round trip、
 * 撞到 P2024／P1017 退一步重試一次。脈絡見 `src/lib/site-visits.ts`。
 */
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { NEWS_CONFIG, type NewsRegion } from "@/config/news";
import {
  classifyRegion,
  collectNews,
  countByRegion,
  enrichNews,
  fetchArticleByUrl,
  normalizeTitle,
  reclassifyWithContent,
  taipeiStamp,
  type FetchedNews,
} from "@/lib/news-fetch";
import { taipeiDay } from "@/lib/site-visits";

// ---------------------------------------------------------------- 型別

export const NEWS_STATUSES = ["new", "picked", "done", "hidden"] as const;
export type NewsStatus = (typeof NEWS_STATUSES)[number];

/** 狀態的對外名稱。這是「你處理到哪」，不是新聞本身的狀態。hidden 已經沒有按鈕會設，留著是相容舊資料。 */
export const NEWS_STATUS_LABEL: Record<NewsStatus, string> = {
  new: "還沒排",
  picked: "已排入待產",
  done: "已完成",
  hidden: "隱藏",
};

/** 待產文案的兩條線。 */
export const NEWS_LINES = ["article", "video"] as const;
export type NewsLine = (typeof NEWS_LINES)[number];

export const NEWS_LINE_LABEL: Record<NewsLine, string> = {
  article: "知識文章",
  video: "短影音",
};

export function isNewsLine(value: unknown): value is NewsLine {
  return value === "article" || value === "video";
}

export type NewsTaskStatus = "todo" | "done";

export function isNewsTaskStatus(value: unknown): value is NewsTaskStatus {
  return value === "todo" || value === "done";
}

/** 一則新聞排了哪幾條線（清單上畫小標籤用）。 */
export type NewsTaskRef = { line: NewsLine; status: NewsTaskStatus };

export function isNewsStatus(value: unknown): value is NewsStatus {
  return typeof value === "string" && (NEWS_STATUSES as readonly string[]).includes(value);
}

export function isNewsRegion(value: unknown): value is NewsRegion {
  return value === "coast" || value === "central" || value === "national";
}

export type NewsRecord = {
  id: string;
  title: string;
  url: string;
  source: string;
  region: NewsRegion;
  /** 台北時間 `YYYY-MM-DD HH:MM:SS`，來源沒給就是 null */
  publishedAt: string | null;
  summary: string;
  content: string | null;
  status: NewsStatus;
  note: string;
  fetchedAt: string;
  /** 排了哪幾條線；沒排就是空陣列 */
  tasks: NewsTaskRef[];
};

/** 待產文案的一筆：一條線＋它來自哪則新聞。 */
export type NewsTaskRecord = {
  id: string;
  newsId: string;
  line: NewsLine;
  status: NewsTaskStatus;
  /** 台北時間 `YYYY-MM-DD HH:MM:SS`，他按「拿去做」的時間 */
  createdAt: string;
  updatedAt: string | null;
  news: NewsRecord;
};

export type NewsTaskCounts = {
  todo: Record<NewsLine, number>;
  done: number;
};

/** 派工寫稿的一版文案。 */
export type NewsDraftRecord = {
  id: string;
  taskId: string;
  line: NewsLine;
  model: string;
  content: string;
  /** 生成花了幾毫秒 */
  ms: number;
  tokensIn: number;
  tokensOut: number;
  /** 被 token 上限截斷，結尾可能不完整 */
  truncated: boolean;
  /** 台北時間 `YYYY-MM-DD HH:MM:SS` */
  createdAt: string;
};

export type NewsRunStatus = "running" | "success" | "error";

export type NewsRunRecord = {
  id: string;
  /** 台北日期 `YYYY-MM-DD` */
  day: string;
  trigger: "auto" | "manual";
  status: NewsRunStatus;
  startedMs: number;
  finishedMs: number | null;
  found: number;
  inserted: number;
  log: string;
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
    await ensureNewsTables();
    return withRetry(run);
  }
}

// ---------------------------------------------------------------- 建表

/**
 * 建表。只在讀寫撞到「表不存在」時才會被呼叫 ——
 * 不要每次冷啟動無條件跑一次，那會多佔一條稀缺的連線。
 * Prisma 一次只能跑一句 SQL，所以兩張表分兩次。
 */
export async function ensureNewsTables(): Promise<void> {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS news_item (
      id           VARCHAR(36)   NOT NULL,
      url_hash     CHAR(40)      NOT NULL,
      title_norm   VARCHAR(191)  NOT NULL,
      title        VARCHAR(500)  NOT NULL,
      url          VARCHAR(2000) NOT NULL,
      source       VARCHAR(120)  NULL,
      region       VARCHAR(16)   NOT NULL DEFAULT 'national',
      published_at VARCHAR(19)   NULL,
      summary      TEXT          NULL,
      content      MEDIUMTEXT    NULL,
      status       VARCHAR(16)   NOT NULL DEFAULT 'new',
      note         TEXT          NULL,
      fetched_at   VARCHAR(19)   NOT NULL,
      updated_at   VARCHAR(19)   NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_news_item_url (url_hash),
      KEY idx_news_item_title (title_norm),
      KEY idx_news_item_region (region, published_at),
      KEY idx_news_item_fetched (fetched_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS news_run (
      id          VARCHAR(36) NOT NULL,
      day         CHAR(10)    NOT NULL,
      trigger_by  VARCHAR(16) NOT NULL,
      status      VARCHAR(16) NOT NULL DEFAULT 'running',
      started_ms  BIGINT      NOT NULL,
      finished_ms BIGINT      NULL,
      found       INT         NOT NULL DEFAULT 0,
      inserted    INT         NOT NULL DEFAULT 0,
      log         TEXT        NULL,
      PRIMARY KEY (id),
      KEY idx_news_run_day (day, started_ms)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS news_task (
      id         VARCHAR(36) NOT NULL,
      news_id    VARCHAR(36) NOT NULL,
      line       VARCHAR(16) NOT NULL,
      status     VARCHAR(16) NOT NULL DEFAULT 'todo',
      created_at VARCHAR(19) NOT NULL,
      updated_at VARCHAR(19) NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_news_task_line (news_id, line),
      KEY idx_news_task_status (status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS news_draft (
      id         VARCHAR(36) NOT NULL,
      task_id    VARCHAR(36) NOT NULL,
      line       VARCHAR(16) NOT NULL,
      model      VARCHAR(64) NOT NULL,
      content    MEDIUMTEXT  NOT NULL,
      ms         INT         NOT NULL DEFAULT 0,
      tokens_in  INT         NOT NULL DEFAULT 0,
      tokens_out INT         NOT NULL DEFAULT 0,
      truncated  TINYINT     NOT NULL DEFAULT 0,
      created_at VARCHAR(19) NOT NULL,
      PRIMARY KEY (id),
      KEY idx_news_draft_task (task_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

// ---------------------------------------------------------------- 讀

type ItemRow = {
  id: string;
  title: string;
  url: string;
  source: string | null;
  region: string;
  published_at: string | null;
  summary: string | null;
  content: string | null;
  status: string;
  note: string | null;
  fetched_at: string;
  /** `article:todo,video:done` 這種字串（見 TASKS_SUBQUERY），沒排就是 null */
  tasks: string | null;
};

const ITEM_COLUMNS =
  "n.id, n.title, n.url, n.source, n.region, n.published_at, n.summary, n.content, n.status, n.note, n.fetched_at";

/** 每則新聞排了哪幾條線，一個子查詢帶回來，免得清單 500 則再查 500 次。 */
const TASKS_SUBQUERY =
  "(SELECT GROUP_CONCAT(CONCAT(k.line, ':', k.status) ORDER BY k.line SEPARATOR ',') FROM news_task k WHERE k.news_id = n.id) AS tasks";

function parseTasks(raw: string | null): NewsTaskRef[] {
  if (!raw) return [];
  const out: NewsTaskRef[] = [];
  for (const part of String(raw).split(",")) {
    const [line, status] = part.split(":");
    if (isNewsLine(line)) out.push({ line, status: status === "done" ? "done" : "todo" });
  }
  return out;
}

function toRecord(r: ItemRow): NewsRecord {
  return {
    id: r.id,
    title: r.title,
    url: r.url,
    source: r.source || "",
    region: isNewsRegion(r.region) ? r.region : "national",
    publishedAt: r.published_at,
    summary: r.summary || "",
    content: r.content,
    status: isNewsStatus(r.status) ? r.status : "new",
    note: r.note || "",
    fetchedAt: r.fetched_at,
    tasks: parseTasks(r.tasks),
  };
}

function sinceStamp(days: number): string {
  return taipeiStamp(new Date(Date.now() - days * 86_400_000));
}

export type NewsFilter = {
  /** 只看幾天內（依發布時間，沒有發布時間就看抓取時間） */
  days?: number;
  region?: NewsRegion;
  /** 指定狀態；"active" = 除了隱藏的全部 */
  status?: NewsStatus | "active";
  /** 關鍵字：標題、來源、摘要、內文都找。給了就別再給 days，不然搜不到舊的 */
  q?: string;
  limit?: number;
};

/** `%` 與 `_` 在 LIKE 裡是萬用字元，使用者打進去要當成一般字元。 */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}

/** 後台清單：海線 → 中部 → 全台，各區內新到舊。 */
export async function listNews(filter: NewsFilter = {}): Promise<NewsRecord[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.days) {
    where.push("COALESCE(n.published_at, n.fetched_at) >= ?");
    params.push(sinceStamp(filter.days));
  }
  if (filter.region) {
    where.push("n.region = ?");
    params.push(filter.region);
  }
  if (filter.status === "active") {
    where.push("n.status <> 'hidden'");
  } else if (filter.status) {
    where.push("n.status = ?");
    params.push(filter.status);
  }
  const q = filter.q?.trim();
  if (q) {
    // 內文也找 —— 他要找的常常是「某一篇講到沙鹿的」，那三個字多半在內文不在標題
    where.push("(n.title LIKE ? OR n.source LIKE ? OR n.summary LIKE ? OR n.content LIKE ?)");
    const like = `%${escapeLike(q)}%`;
    params.push(like, like, like, like);
  }
  params.push(Math.min(1000, Math.max(1, filter.limit ?? 300)));
  const sql =
    `SELECT ${ITEM_COLUMNS}, ${TASKS_SUBQUERY} FROM news_item n` +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY FIELD(n.region, 'coast', 'central', 'national'), COALESCE(n.published_at, n.fetched_at) DESC LIMIT ?";
  const rows = await withSchema(() => db.$queryRawUnsafe<ItemRow[]>(sql, ...params));
  return rows.map(toRecord);
}

export async function getNewsItem(id: string): Promise<NewsRecord | null> {
  const rows = await withSchema(() =>
    db.$queryRawUnsafe<ItemRow[]>(`SELECT ${ITEM_COLUMNS}, ${TASKS_SUBQUERY} FROM news_item n WHERE n.id = ? LIMIT 1`, id),
  );
  return rows.length ? toRecord(rows[0]) : null;
}

/**
 * 各地區「還沒隱藏」的則數，時間窗依地區不同（海線看 3 天、其餘 1 天，跟抓取一致）。
 * 給後台上方的三個數字用。
 */
export async function countNewsByRegion(): Promise<Record<NewsRegion, number>> {
  const rows = await withSchema(() =>
    db.$queryRawUnsafe<{ region: string; n: unknown }[]>(
      "SELECT region, COUNT(*) AS n FROM news_item WHERE status <> 'hidden' AND (" +
        "(region = 'coast' AND COALESCE(published_at, fetched_at) >= ?) OR " +
        "(region = 'central' AND COALESCE(published_at, fetched_at) >= ?) OR " +
        "(region = 'national' AND COALESCE(published_at, fetched_at) >= ?)) GROUP BY region",
      sinceStamp(NEWS_CONFIG.regionDays.coast),
      sinceStamp(NEWS_CONFIG.regionDays.central),
      sinceStamp(NEWS_CONFIG.regionDays.national),
    ),
  );
  const counts: Record<NewsRegion, number> = { coast: 0, central: 0, national: 0 };
  for (const r of rows) if (isNewsRegion(r.region)) counts[r.region] = Number(r.n);
  return counts;
}

// ---------------------------------------------------------------- 寫

export async function setNewsStatus(id: string, status: NewsStatus): Promise<void> {
  await withSchema(() =>
    db.$executeRawUnsafe("UPDATE news_item SET status = ?, updated_at = ? WHERE id = ?", status, taipeiStamp(), id),
  );
}

// ---------------------------------------------------------------- 待產文案（news_task）

/** 依 news_task 重算這則新聞的 status：沒排＝new、還有待做＝picked、全做完＝done。 */
async function syncNewsStatus(newsId: string): Promise<void> {
  const rows = await withSchema(() =>
    db.$queryRawUnsafe<{ status: string }[]>("SELECT status FROM news_task WHERE news_id = ?", newsId),
  );
  const status: NewsStatus = rows.length === 0 ? "new" : rows.some((r) => r.status === "todo") ? "picked" : "done";
  await setNewsStatus(newsId, status);
}

/**
 * 「拿去做」：把一則新聞排進某條線。同一則同一條線只會有一筆（唯一鍵）——
 * 已經排過就回那一筆；已經做完再按一次，就翻回待做。
 */
export async function addNewsTask(newsId: string, line: NewsLine): Promise<{ taskId: string; created: boolean }> {
  const news = await getNewsItem(newsId);
  if (!news) throw new Error("找不到這則新聞");
  const id = randomUUID();
  const n = await withSchema(() =>
    db.$executeRawUnsafe(
      "INSERT IGNORE INTO news_task (id, news_id, line, status, created_at) VALUES (?, ?, ?, 'todo', ?)",
      id,
      newsId,
      line,
      taipeiStamp(),
    ),
  );
  if (Number(n) > 0) {
    await syncNewsStatus(newsId);
    return { taskId: id, created: true };
  }
  const rows = await withSchema(() =>
    db.$queryRawUnsafe<{ id: string; status: string }[]>(
      "SELECT id, status FROM news_task WHERE news_id = ? AND line = ? LIMIT 1",
      newsId,
      line,
    ),
  );
  if (!rows.length) throw new Error("排入失敗，請再試一次");
  if (rows[0].status !== "todo") await setNewsTaskStatus(rows[0].id, "todo");
  else await syncNewsStatus(newsId);
  return { taskId: rows[0].id, created: false };
}

/**
 * 貼一條新聞連結進來，抓好存進 news_item，再排進待產文案的某一條線。
 *
 * 同一個網址已經在資料庫裡（不管是排程抓的還是他自己貼過的）就沿用那一筆，
 * 不會產生第二則一樣的新聞 —— 他只會多一條線，或者被告知早就排過了。
 * 手動貼的**不過房產相關性那一關**：他都特地貼了，就是他要的。
 */
export type AddNewsOutcome = {
  taskId: string;
  newsId: string;
  title: string;
  region: NewsRegion;
  hasContent: boolean;
  /** 這個網址資料庫裡本來就有（排程抓過，或他貼過） */
  newsExisted: boolean;
  /** 這條線是這次新排的；false = 本來就排過了 */
  taskCreated: boolean;
};

/** 存成 news_item（同網址就沿用舊的那筆）再排進待產文案。兩條路（抓網頁／自己貼）共用。 */
async function saveAndQueue(item: FetchedNews, line: NewsLine): Promise<AddNewsOutcome> {
  const hash = sha1(item.url);
  const existing = await withSchema(() =>
    db.$queryRawUnsafe<{ id: string }[]>("SELECT id FROM news_item WHERE url_hash = ? LIMIT 1", hash),
  );

  let newsId: string;
  const newsExisted = existing.length > 0;
  if (newsExisted) {
    newsId = existing[0].id;
    // 舊那筆可能只有標題（排程沒抓到全文），這次有內文就補上；原本就有的不覆蓋
    if (item.content) {
      await withSchema(() =>
        db.$executeRawUnsafe(
          "UPDATE news_item SET content = COALESCE(content, ?), updated_at = ? WHERE id = ?",
          item.content,
          taipeiStamp(),
          newsId,
        ),
      );
    }
  } else {
    newsId = randomUUID();
    await withSchema(() =>
      db.$executeRawUnsafe(
        "INSERT INTO news_item (id, url_hash, title_norm, title, url, source, region, published_at, summary, content, status, fetched_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)",
        newsId,
        hash,
        normalizeTitle(item.title).slice(0, 191),
        item.title.slice(0, 500),
        item.url.slice(0, 2000),
        item.source.slice(0, 120) || null,
        item.region,
        item.publishedAt,
        item.summary || null,
        item.content,
        taipeiStamp(),
      ),
    );
  }

  const { taskId, created } = await addNewsTask(newsId, line);
  return { taskId, newsId, title: item.title, region: item.region, hasContent: !!item.content, newsExisted, taskCreated: created };
}

export async function addNewsFromUrl(rawUrl: string, line: NewsLine): Promise<AddNewsOutcome> {
  return saveAndQueue(await fetchArticleByUrl(rawUrl), line);
}

/**
 * 備援：那個網站擋程式抓取（或要登入）時，他自己把標題與內文貼進來。
 * 網址仍然要給 —— 去重、之後回去看原文都靠它。
 */
export async function addNewsFromText(rawUrl: string, title: string, text: string, line: NewsLine): Promise<AddNewsOutcome> {
  const url = (rawUrl || "").trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("請貼完整的網址（要以 http:// 或 https:// 開頭）。");
  const cleanTitle = (title || "").trim();
  if (!cleanTitle) throw new Error("請填標題。");
  const content = (text || "").trim();
  if (content.length < 50) throw new Error("內文太短（至少 50 字），確認有把新聞的內容複製到嗎？");

  let source = "";
  try {
    source = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    throw new Error("這不是一個看得懂的網址。");
  }

  const item: FetchedNews = {
    title: cleanTitle,
    url,
    source,
    summary: "",
    content: content.slice(0, NEWS_CONFIG.maxContentChars),
    publishedAt: null,
    region: "national",
  };
  item.region = classifyRegion(item);
  return saveAndQueue(item, line);
}

async function taskNewsId(taskId: string): Promise<string | null> {
  const rows = await withSchema(() =>
    db.$queryRawUnsafe<{ news_id: string }[]>("SELECT news_id FROM news_task WHERE id = ? LIMIT 1", taskId),
  );
  return rows.length ? rows[0].news_id : null;
}

export async function setNewsTaskStatus(taskId: string, status: NewsTaskStatus): Promise<void> {
  const newsId = await taskNewsId(taskId);
  if (!newsId) throw new Error("找不到這一題");
  await withSchema(() =>
    db.$executeRawUnsafe("UPDATE news_task SET status = ?, updated_at = ? WHERE id = ?", status, taipeiStamp(), taskId),
  );
  await syncNewsStatus(newsId);
}

/** 「退回」：這條線刪掉（連同替它寫過的文案）。新聞沒有別條線就回到「還沒排」。 */
export async function removeNewsTask(taskId: string): Promise<void> {
  const newsId = await taskNewsId(taskId);
  if (!newsId) return;
  await withSchema(() => db.$executeRawUnsafe("DELETE FROM news_draft WHERE task_id = ?", taskId));
  await withSchema(() => db.$executeRawUnsafe("DELETE FROM news_task WHERE id = ?", taskId));
  await syncNewsStatus(newsId);
}

type TaskRow = ItemRow & {
  task_id: string;
  line: string;
  task_status: string;
  created_at: string;
  updated_at: string | null;
};

const TASK_COLUMNS = "t.id AS task_id, t.line, t.status AS task_status, t.created_at, t.updated_at";

function toTask(r: TaskRow): NewsTaskRecord {
  return {
    id: r.task_id,
    newsId: r.id,
    line: isNewsLine(r.line) ? r.line : "article",
    status: r.task_status === "done" ? "done" : "todo",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    news: toRecord(r),
  };
}

export type NewsTaskFilter = {
  status?: NewsTaskStatus;
  line?: NewsLine;
  limit?: number;
};

/** 待產文案清單：最新排入的在最上面。 */
export async function listNewsTasks(filter: NewsTaskFilter = {}): Promise<NewsTaskRecord[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    where.push("t.status = ?");
    params.push(filter.status);
  }
  if (filter.line) {
    where.push("t.line = ?");
    params.push(filter.line);
  }
  params.push(Math.min(1000, Math.max(1, filter.limit ?? 300)));
  const sql =
    `SELECT ${TASK_COLUMNS}, ${ITEM_COLUMNS}, ${TASKS_SUBQUERY} FROM news_task t JOIN news_item n ON n.id = t.news_id` +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY t.created_at DESC, t.id LIMIT ?";
  const rows = await withSchema(() => db.$queryRawUnsafe<TaskRow[]>(sql, ...params));
  return rows.map(toTask);
}

export async function getNewsTask(taskId: string): Promise<NewsTaskRecord | null> {
  const rows = await withSchema(() =>
    db.$queryRawUnsafe<TaskRow[]>(
      `SELECT ${TASK_COLUMNS}, ${ITEM_COLUMNS}, ${TASKS_SUBQUERY} FROM news_task t JOIN news_item n ON n.id = t.news_id WHERE t.id = ? LIMIT 1`,
      taskId,
    ),
  );
  return rows.length ? toTask(rows[0]) : null;
}

/** 上方三個數字：兩條線各還有幾題待做、做完幾題。 */
export async function countNewsTasks(): Promise<NewsTaskCounts> {
  const rows = await withSchema(() =>
    db.$queryRawUnsafe<{ line: string; status: string; n: unknown }[]>(
      "SELECT line, status, COUNT(*) AS n FROM news_task GROUP BY line, status",
    ),
  );
  const counts: NewsTaskCounts = { todo: { article: 0, video: 0 }, done: 0 };
  for (const r of rows) {
    if (r.status === "done") counts.done += Number(r.n);
    else if (isNewsLine(r.line)) counts.todo[r.line] += Number(r.n);
  }
  return counts;
}

// ---------------------------------------------------------------- 派工寫稿（news_draft）

type DraftRow = {
  id: string;
  task_id: string;
  line: string;
  model: string;
  content: string;
  ms: unknown;
  tokens_in: unknown;
  tokens_out: unknown;
  truncated: unknown;
  created_at: string;
};

const DRAFT_COLUMNS = "id, task_id, line, model, content, ms, tokens_in, tokens_out, truncated, created_at";

function toDraft(r: DraftRow): NewsDraftRecord {
  return {
    id: r.id,
    taskId: r.task_id,
    line: isNewsLine(r.line) ? r.line : "article",
    model: r.model,
    content: r.content,
    ms: Number(r.ms),
    tokensIn: Number(r.tokens_in),
    tokensOut: Number(r.tokens_out),
    truncated: Number(r.truncated) === 1,
    createdAt: r.created_at,
  };
}

export type NewDraftInput = Omit<NewsDraftRecord, "id" | "createdAt">;

/** 存一版文案，回傳存進去的那筆。 */
export async function insertNewsDraft(input: NewDraftInput): Promise<NewsDraftRecord> {
  const id = randomUUID();
  const createdAt = taipeiStamp();
  await withSchema(() =>
    db.$executeRawUnsafe(
      "INSERT INTO news_draft (id, task_id, line, model, content, ms, tokens_in, tokens_out, truncated, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      input.taskId,
      input.line,
      input.model.slice(0, 64),
      input.content,
      Math.round(input.ms),
      input.tokensIn,
      input.tokensOut,
      input.truncated ? 1 : 0,
      createdAt,
    ),
  );
  return { ...input, id, createdAt };
}

/** 這幾題的所有文案，最新的在前。一次最多問 100 題，超過就分批。 */
export async function listNewsDraftsForTasks(taskIds: string[]): Promise<NewsDraftRecord[]> {
  const out: NewsDraftRecord[] = [];
  for (let i = 0; i < taskIds.length; i += 100) {
    const batch = taskIds.slice(i, i + 100);
    if (batch.length === 0) continue;
    const rows = await withSchema(() =>
      db.$queryRawUnsafe<DraftRow[]>(
        `SELECT ${DRAFT_COLUMNS} FROM news_draft WHERE task_id IN (${batch.map(() => "?").join(",")}) ORDER BY created_at DESC, id`,
        ...batch,
      ),
    );
    out.push(...rows.map(toDraft));
  }
  return out;
}

export async function removeNewsDraft(draftId: string): Promise<void> {
  await withSchema(() => db.$executeRawUnsafe("DELETE FROM news_draft WHERE id = ?", draftId));
}

function sha1(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

/** 把最近 7 天已經在資料庫裡的（同網址或同標題）濾掉，回傳真正新的。 */
export async function filterNewItems(items: FetchedNews[]): Promise<FetchedNews[]> {
  if (items.length === 0) return [];
  const existing = await withSchema(() =>
    db.$queryRawUnsafe<{ url_hash: string; title_norm: string }[]>(
      "SELECT url_hash, title_norm FROM news_item WHERE fetched_at >= ?",
      sinceStamp(7),
    ),
  );
  const seenHash = new Set(existing.map((r) => r.url_hash));
  const seenTitle = new Set(existing.map((r) => r.title_norm));
  const fresh: FetchedNews[] = [];
  for (const it of items) {
    const hash = sha1(it.url);
    const norm = normalizeTitle(it.title).slice(0, 191);
    if (seenHash.has(hash) || (norm && seenTitle.has(norm))) continue;
    seenHash.add(hash);
    if (norm) seenTitle.add(norm);
    fresh.push(it);
  }
  return fresh;
}

/** 寫進資料庫，一次 40 筆。同網址（唯一鍵）的 INSERT IGNORE 會靜默略過。 */
export async function insertNewsItems(items: FetchedNews[]): Promise<number> {
  const fetchedAt = taipeiStamp();
  let inserted = 0;
  for (let i = 0; i < items.length; i += 40) {
    const batch = items.slice(i, i + 40);
    const placeholders = batch.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?)").join(",");
    const params = batch.flatMap((it) => [
      randomUUID(),
      sha1(it.url),
      normalizeTitle(it.title).slice(0, 191),
      it.title.slice(0, 500),
      it.url.slice(0, 2000),
      it.source.slice(0, 120) || null,
      it.region,
      it.publishedAt,
      it.summary || null,
      it.content,
      "new",
      fetchedAt,
    ]);
    const n = await withSchema(() =>
      db.$executeRawUnsafe(
        "INSERT IGNORE INTO news_item (id, url_hash, title_norm, title, url, source, region, published_at, summary, content, status, fetched_at) VALUES " +
          placeholders,
        ...params,
      ),
    );
    inserted += Number(n);
  }
  return inserted;
}

// ---------------------------------------------------------------- 抓取紀錄

type RunRow = {
  id: string;
  day: string;
  trigger_by: string;
  status: string;
  started_ms: unknown;
  finished_ms: unknown;
  found: unknown;
  inserted: unknown;
  log: string | null;
};

function toRun(r: RunRow): NewsRunRecord {
  const status: NewsRunStatus = r.status === "success" || r.status === "error" ? r.status : "running";
  return {
    id: r.id,
    day: r.day,
    trigger: r.trigger_by === "manual" ? "manual" : "auto",
    status,
    startedMs: Number(r.started_ms),
    finishedMs: r.finished_ms == null ? null : Number(r.finished_ms),
    found: Number(r.found),
    inserted: Number(r.inserted),
    log: r.log || "",
  };
}

const RUN_COLUMNS = "id, day, trigger_by, status, started_ms, finished_ms, found, inserted, log";

export async function listRunsForDay(day: string): Promise<NewsRunRecord[]> {
  const rows = await withSchema(() =>
    db.$queryRawUnsafe<RunRow[]>(`SELECT ${RUN_COLUMNS} FROM news_run WHERE day = ? ORDER BY started_ms DESC`, day),
  );
  return rows.map(toRun);
}

export async function latestNewsRun(): Promise<NewsRunRecord | null> {
  const rows = await withSchema(() =>
    db.$queryRawUnsafe<RunRow[]>(`SELECT ${RUN_COLUMNS} FROM news_run ORDER BY started_ms DESC LIMIT 1`),
  );
  return rows.length ? toRun(rows[0]) : null;
}

async function createRun(day: string, trigger: "auto" | "manual", startedMs: number): Promise<string> {
  const id = randomUUID();
  await withSchema(() =>
    db.$executeRawUnsafe(
      "INSERT INTO news_run (id, day, trigger_by, status, started_ms) VALUES (?, ?, ?, 'running', ?)",
      id,
      day,
      trigger,
      startedMs,
    ),
  );
  return id;
}

async function finishRun(id: string, status: NewsRunStatus, found: number, inserted: number, log: string): Promise<void> {
  await withSchema(() =>
    db.$executeRawUnsafe(
      "UPDATE news_run SET status = ?, finished_ms = ?, found = ?, inserted = ?, log = ? WHERE id = ?",
      status,
      Date.now(),
      found,
      inserted,
      log.slice(0, 60_000),
      id,
    ),
  );
}

// ---------------------------------------------------------------- 每天一次的流程

/** 一次 running 紀錄超過這個時間還沒結束，就當它已經死了（函式被砍、沒機會寫 finished）。 */
const STALE_RUNNING_MS = 10 * 60_000;

/** 整個流程的時間預算。Vercel 一支函式最多 60 秒，留一點給資料庫寫入。 */
const RUN_BUDGET_MS = 48_000;

export type RunNewsOptions = {
  /** true = 不管幾點、今天跑過沒，都跑（後台按鈕用）。仍會擋「另一次正在跑」。 */
  force?: boolean;
  trigger: "auto" | "manual";
};

export type RunNewsOutcome = {
  ran: boolean;
  ok?: boolean;
  /** 沒跑或失敗的原因：not_due / done_today / running / too_many_errors，或錯誤訊息 */
  reason?: string;
  found?: number;
  inserted?: number;
  counts?: Record<NewsRegion, number>;
  log?: string[];
  runId?: string;
  ms?: number;
};

export async function runDailyNewsFetch(opts: RunNewsOptions): Promise<RunNewsOutcome> {
  const startedMs = Date.now();
  const deadline = startedMs + RUN_BUDGET_MS;
  const day = taipeiDay();
  const hourTaipei = Number(taipeiStamp().slice(11, 13));

  const runs = await listRunsForDay(day);
  if (runs.some((r) => r.status === "running" && startedMs - r.startedMs < STALE_RUNNING_MS)) {
    return { ran: false, reason: "running" };
  }
  if (!opts.force) {
    if (hourTaipei < NEWS_CONFIG.startHour) return { ran: false, reason: "not_due" };
    if (runs.some((r) => r.status === "success")) return { ran: false, reason: "done_today" };
    // 失敗的、以及開了卻沒寫完的（函式被砍）都算一次嘗試，免得整天每 10 分鐘撞一次
    const attempts = runs.filter((r) => r.status === "error" || r.status === "running").length;
    if (attempts >= NEWS_CONFIG.maxAutoAttemptsPerDay) return { ran: false, reason: "too_many_errors" };
  }

  const lines: string[] = [];
  const log = (s: string) => lines.push(`[${taipeiStamp().slice(11, 19)}] ${s}`);
  const runId = await createRun(day, opts.trigger, startedMs);

  try {
    log("開始抓取新聞…");
    const { items } = await collectNews(log);
    const fresh = await filterNewItems(items);
    log(`其中 ${fresh.length} 則是資料庫裡還沒有的`);
    if (fresh.length) {
      await enrichNews(fresh, deadline, log);
      reclassifyWithContent(fresh, log);
    }
    const inserted = await insertNewsItems(fresh);
    log(`已存入 ${inserted} 則新新聞`);
    const counts = countByRegion(fresh);
    await finishRun(runId, "success", items.length, inserted, lines.join("\n"));
    return { ran: true, ok: true, found: items.length, inserted, counts, log: lines, runId, ms: Date.now() - startedMs };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`發生錯誤：${msg}`);
    try {
      await finishRun(runId, "error", 0, 0, lines.join("\n"));
    } catch {
      // 連紀錄都寫不進去（多半是資料庫連線問題）—— 錯誤已在回傳值裡，不要再丟一次蓋掉它
    }
    return { ran: true, ok: false, reason: msg, log: lines, runId, ms: Date.now() - startedMs };
  }
}
