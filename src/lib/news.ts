/**
 * 📰 房產新聞 —— 資料層與「每天抓一次」的流程。
 *
 * 兩張表，第一次用到時自己建（跟 site_video 同一套，撞到 1146 才建）：
 *   news_item  抓進來的新聞：標題、網址、來源、地區、摘要、全文、處理狀態
 *   news_run   每次抓取的紀錄：哪一天、誰觸發、抓到幾則、新增幾則、過程 log
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
  collectNews,
  countByRegion,
  enrichNews,
  normalizeTitle,
  reclassifyWithContent,
  taipeiStamp,
  type FetchedNews,
} from "@/lib/news-fetch";
import { taipeiDay } from "@/lib/site-visits";

// ---------------------------------------------------------------- 型別

export const NEWS_STATUSES = ["new", "picked", "done", "hidden"] as const;
export type NewsStatus = (typeof NEWS_STATUSES)[number];

/** 狀態的對外名稱。這是「你處理到哪」，不是新聞本身的狀態。 */
export const NEWS_STATUS_LABEL: Record<NewsStatus, string> = {
  new: "未處理",
  picked: "要改寫",
  done: "已完成",
  hidden: "隱藏",
};

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
};

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
  limit?: number;
};

/** 後台清單：海線 → 中部 → 全台，各區內新到舊。 */
export async function listNews(filter: NewsFilter = {}): Promise<NewsRecord[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.days) {
    where.push("COALESCE(published_at, fetched_at) >= ?");
    params.push(sinceStamp(filter.days));
  }
  if (filter.region) {
    where.push("region = ?");
    params.push(filter.region);
  }
  if (filter.status === "active") {
    where.push("status <> 'hidden'");
  } else if (filter.status) {
    where.push("status = ?");
    params.push(filter.status);
  }
  params.push(Math.min(1000, Math.max(1, filter.limit ?? 300)));
  const sql =
    "SELECT id, title, url, source, region, published_at, summary, content, status, note, fetched_at FROM news_item" +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY FIELD(region, 'coast', 'central', 'national'), COALESCE(published_at, fetched_at) DESC LIMIT ?";
  const rows = await withSchema(() => db.$queryRawUnsafe<ItemRow[]>(sql, ...params));
  return rows.map(toRecord);
}

export async function getNewsItem(id: string): Promise<NewsRecord | null> {
  const rows = await withSchema(() =>
    db.$queryRawUnsafe<ItemRow[]>(
      "SELECT id, title, url, source, region, published_at, summary, content, status, note, fetched_at FROM news_item WHERE id = ? LIMIT 1",
      id,
    ),
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
