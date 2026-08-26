/**
 * 🎬 影音 —— 系統擁有者自己拍的影片
 *
 * 分兩類（系統擁有者指定）：
 *   knowledge  知識型     買賣觀念、稅務、貸款、市場分析那種
 *   tour       房屋開箱   實際帶看某一間房子
 *
 * ## 為什麼是自己一筆一筆加，不是從 YouTube 頻道自動抓
 *
 * 分類這件事 YouTube 那邊沒有 —— 頻道上不會告訴你哪支是知識型、哪支是開箱。
 * 就算自動抓進來，還是得手動分一次類，那不如直接貼網址。
 * （要做自動帶入的話 YouTube 授權已經接好了，見 `src/lib/youtube.ts`，
 *   但那是另一件事，不要為了它把這個表設計得更複雜。）
 *
 * ## 影片可以有兩種來源
 *
 *   youtube  貼網址。認得出影片 ID 的（watch / youtu.be / shorts / embed）
 *            就存 `video_id`，前台嵌播放器、縮圖自動有。
 *            FB reels、IG 那種認不出來的只存網址，卡片變成「點了開新分頁」。
 *   upload   自己從電腦上傳的檔案，存在 Vercel Blob，`url` 是 blob 網址。
 *
 * ## ⚠️ 自己上傳的影片有兩條硬限制，改這裡之前先看懂
 *
 * 1. **單檔不能超過 512MB。** 超過的話 Vercel 的 CDN 就不快取它了，
 *    **每一次播放都算 cache MISS**，會一直吃 Fast Origin Transfer
 *    （Hobby 方案一個月只有約 10GB）。所以 `MAX_UPLOAD_BYTES` 壓在 200MB，
 *    離 512MB 有安全距離。
 *
 * 2. **Hobby 方案超量不會多收錢，但會「整個 Blob 停用 30 天」。**
 *    精選好案那 78 張照片跟影片放在同一個 Blob store ——
 *    影片吃爆額度，**照片會跟著一起消失**。這是最需要小心的一件事。
 *
 * 所以自己上傳的影片一律：
 *   ・上傳時在瀏覽器端截一張封面圖（`poster_url`）
 *   ・前台 `<video preload="none">` —— **沒人按播放就一個 byte 都不下載**
 * 這兩件事合起來，才讓「放在首頁」這件事不會默默把流量燒光。
 *
 * ## 連線紀律
 *
 * Vercel 上 Prisma pool 只有 connection_limit=3。一次請求一趟 round trip、
 * 一條連線；建表只在撞到 1146 才做；撞到 P2024／P1017 退一步重試一次。
 * 脈絡見 `src/lib/site-visits.ts`。
 */

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

export const VIDEO_CATEGORIES = ["knowledge", "tour"] as const;
export type VideoCategory = (typeof VIDEO_CATEGORIES)[number];

/** 分類的對外名稱與說明。要改文案只改這裡，前後台一起變。 */
export const CATEGORY_META: Record<VideoCategory, { label: string; eyebrow: string; desc: string }> = {
  knowledge: {
    label: "知識型",
    eyebrow: "KNOWLEDGE",
    desc: "買賣觀念、稅費、貸款、市場動向。看完再決定，比聽人說更踏實。",
  },
  tour: {
    label: "房屋開箱",
    eyebrow: "HOUSE TOUR",
    desc: "實際走一遍屋內。格局、採光、周邊環境，先在螢幕上看清楚，再決定要不要跑一趟。",
  },
};

export function isVideoCategory(value: unknown): value is VideoCategory {
  return typeof value === "string" && (VIDEO_CATEGORIES as readonly string[]).includes(value);
}

export type VideoStatus = "active" | "hidden";

export const VIDEO_SOURCES = ["youtube", "upload"] as const;
export type VideoSource = (typeof VIDEO_SOURCES)[number];

export function isVideoSource(value: unknown): value is VideoSource {
  return typeof value === "string" && (VIDEO_SOURCES as readonly string[]).includes(value);
}

/**
 * 自己上傳的單檔上限：200MB。
 *
 * ⚠️ 這個數字不是隨便訂的，**改之前先看檔頭那兩條硬限制**：
 * 超過 512MB 的檔案 Vercel CDN 不快取，每次播放都吃 Fast Origin Transfer。
 * 200MB 留了足夠的安全距離，也大概是「三到五分鐘的 1080p 壓過的影片」。
 * 手機直出的原始檔通常會超過，那要先壓過再傳。
 */
export const MAX_VIDEO_UPLOAD_BYTES = 200 * 1024 * 1024;

/** 允許上傳的影片格式。MP4（H.264）最保險，每個瀏覽器都能播。 */
export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;

/** 後台看到的一筆 */
export type VideoRecord = {
  id: string;
  category: VideoCategory;
  title: string;
  /** youtube＝貼的網址；upload＝Vercel Blob 的檔案網址 */
  url: string;
  source: VideoSource;
  /** YouTube 影片 ID。認不出來或不是 YouTube 就是 null */
  videoId: string | null;
  /** 自己上傳的影片才有的封面圖（上傳時在瀏覽器端截的）。YouTube 的用不到 */
  posterUrl: string | null;
  /** 自己上傳的檔案大小，用來讓後台看得到吃了多少空間 */
  bytes: number | null;
  /** 一句話說明，可留空 */
  summary: string;
  /**
   * 影片日期（`YYYY-MM-DD`）。側欄的「最新影片」照這個排、卡片上也顯示這個。
   *
   * ⚠️ 不能用 `created_at` 代替 —— 那是「什麼時候加進網站的」。
   * 補上一支 2024 年拍的舊片時，用 created_at 會讓它變成「最新」。
   */
  publishedAt: string;
  status: VideoStatus;
  sortOrder: number;
  updatedAt: Date | null;
};

/** 後台送進來的 */
export type VideoInput = {
  category: VideoCategory;
  title: string;
  url: string;
  source: VideoSource;
  posterUrl: string;
  bytes: number | null;
  summary: string;
  publishedAt: string;
  status: VideoStatus;
};

/** 對外顯示用 */
export type PublicVideo = {
  id: string;
  category: VideoCategory;
  title: string;
  url: string;
  source: VideoSource;
  videoId: string | null;
  summary: string;
  publishedAt: string;
  /**
   * 縮圖網址。YouTube 的自動組出來、自己上傳的用截下來的封面圖。
   * 兩種都沒有就是 null，卡片顯示佔位塊（不要留白或破圖）。
   */
  thumbnail: string | null;
};

// ---------------------------------------------------------------- 網址解析

/**
 * 從各種 YouTube 網址寫法裡挖出影片 ID。
 *
 * 認得四種：
 *   https://www.youtube.com/watch?v=ID
 *   https://youtu.be/ID
 *   https://www.youtube.com/shorts/ID
 *   https://www.youtube.com/embed/ID
 *
 * 認不出來就回 null，**不要用猜的** —— 猜錯會嵌入一個「影片無法播放」的
 * 播放器掛在頁面上，比直接給一個連結還糟。
 */
export function parseYoutubeId(rawUrl: string): string | null {
  const url = (rawUrl || "").trim();
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const isYoutube = host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be";
  if (!isYoutube) return null;

  // YouTube 的影片 ID 固定是 11 個字元的 [A-Za-z0-9_-]
  const valid = (id: string | null | undefined): string | null =>
    id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;

  if (host === "youtu.be") return valid(parsed.pathname.slice(1).split("/")[0]);

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments[0] === "shorts" || segments[0] === "embed" || segments[0] === "live") {
    return valid(segments[1]);
  }
  return valid(parsed.searchParams.get("v"));
}

/** YouTube 官方縮圖。hqdefault 每一支影片都一定有，maxres 有些沒有會破圖。 */
export function youtubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

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

/**
 * 「Unknown column」（MySQL 1054）。
 *
 * ⚠️ 這個一定要跟「表不存在」分開處理：表已經在正式庫建好了，
 * `CREATE TABLE IF NOT EXISTS` 對既有的表**什麼都不會做**，所以新加的
 * `source`／`poster_url`／`bytes` 三欄不會自己出現 —— 只會在 SELECT 的時候
 * 炸一個 1054。撞到就跑一次 `ensureVideoTable()`（裡面有補欄位的 ALTER）再重試。
 */
function isMissingColumn(error: unknown): boolean {
  const text = String((error as { message?: string })?.message ?? error);
  return text.includes("1054") || /unknown column/i.test(text);
}

function needsSchemaFix(error: unknown): boolean {
  return isMissingTable(error) || isMissingColumn(error);
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
 * 建表。只在讀寫撞到「表不存在」時才會被呼叫 ——
 * 不要每次冷啟動無條件跑一次，那會多佔一條稀缺的連線。
 */
export async function ensureVideoTable(): Promise<void> {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS site_video (
      id         VARCHAR(36)  NOT NULL,
      category   VARCHAR(16)  NOT NULL,
      title      VARCHAR(255) NOT NULL,
      url        VARCHAR(500) NOT NULL,
      source     VARCHAR(16)  NOT NULL DEFAULT 'youtube',
      video_id   VARCHAR(32)  NULL,
      poster_url VARCHAR(500) NULL,
      bytes      BIGINT       NULL,
      summary    VARCHAR(500) NULL,
      published_at CHAR(10)   NULL,
      status     VARCHAR(16)  NOT NULL DEFAULT 'active',
      sort_order INT          NOT NULL DEFAULT 0,
      created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_site_video_order (category, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ⚠️ `CREATE TABLE IF NOT EXISTS` 對「已經存在的表」什麼都不會做 ——
  //    表已經在正式庫建好了（上一版沒有這三欄），所以要另外補。
  //    先 SHOW COLUMNS 再 ALTER，重複跑不會炸。
  for (const [column, ddl] of [
    ["source", "ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'youtube' AFTER url"],
    ["poster_url", "ADD COLUMN poster_url VARCHAR(500) NULL AFTER video_id"],
    ["bytes", "ADD COLUMN bytes BIGINT NULL AFTER poster_url"],
    // CHAR(10) 存 "YYYY-MM-DD"，跟 site_visit_daily 的 day 同一個理由：
    // 用 DATE 讀回來會變 JS Date，中間再過一次時區換算，又是一個會默默差一天的機會
    ["published_at", "ADD COLUMN published_at CHAR(10) NULL AFTER summary"],
  ] as const) {
    const existing = await db.$queryRawUnsafe<unknown[]>(`SHOW COLUMNS FROM site_video LIKE ?`, column);
    if (existing.length === 0) {
      await db.$executeRawUnsafe(`ALTER TABLE site_video ${ddl}`);
    }
  }
}

// ---------------------------------------------------------------- 讀

type Row = {
  id: string;
  category: string;
  title: string;
  url: string;
  source: string | null;
  video_id: string | null;
  poster_url: string | null;
  bytes: unknown;
  summary: string | null;
  published_at: string | null;
  created_at: Date | null;
  status: string;
  sort_order: number;
  updated_at: Date | null;
};

/** 台北時間的今天，`YYYY-MM-DD` */
function todayTaipei(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 影片日期。舊資料沒有 `published_at`（那一欄是後來才加的），
 * 就退回用 `created_at` —— **不要回空字串**，畫面上會出現一個沒有日期的洞。
 */
function resolvePublishedAt(row: Row): string {
  if (row.published_at && /^\d{4}-\d{2}-\d{2}$/.test(row.published_at)) return row.published_at;
  if (row.created_at) {
    const d = new Date(row.created_at);
    if (Number.isFinite(d.getTime())) return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  }
  return todayTaipei();
}

/** ⚠️ BIGINT 在 TiDB 經 Prisma 回來可能是 bigint 或字串，不要相信欄位型別 */
function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function toRecord(row: Row): VideoRecord {
  return {
    id: row.id,
    // 資料庫裡萬一有不認得的分類（手改過、或以後拿掉某一類），
    // 一律當知識型，不要讓整頁掛掉
    category: isVideoCategory(row.category) ? row.category : "knowledge",
    title: row.title,
    url: row.url,
    source: isVideoSource(row.source) ? row.source : "youtube",
    videoId: row.video_id || null,
    posterUrl: row.poster_url || null,
    bytes: toNumberOrNull(row.bytes),
    summary: row.summary || "",
    publishedAt: resolvePublishedAt(row),
    status: row.status === "hidden" ? "hidden" : "active",
    sortOrder: Number(row.sort_order ?? 0),
    updatedAt: row.updated_at ?? null,
  };
}

/**
 * 排序：**影片日期由新到舊**（2026-08-26 系統擁有者指定「最新的在最上面」）。
 *
 * ⚠️ 這裡刻意**不用 `sort_order`**，後台也沒有上下箭頭了。
 *    原本兩種都有的時候，日期不同的兩支影片交換 `sort_order` 根本不會改變順序 ——
 *    按鈕按了畫面不動，那比沒有按鈕更糟。**一個排序來源就好。**
 *    要把某支拉到最前面，就把它的「影片日期」改新一點。
 *
 * `published_at` 是 `YYYY-MM-DD` 字串，ISO 日期的字典順序等於時間順序，
 * 直接比字串就對，不用轉型。同一天的用 `created_at` 當第二順位，
 * 一次加好幾支時才不會每次重新整理都換位置（沒有第二順位的話順序是未定義的）。
 */
const SELECT_SQL = `SELECT id, category, title, url, source, video_id, poster_url, bytes, summary,
            published_at, created_at, status, sort_order, updated_at
     FROM site_video ORDER BY published_at DESC, created_at DESC`;

/** 後台用：全部，含隱藏的 */
export async function listAllVideos(): Promise<VideoRecord[]> {
  return withRetry(async () => {
    try {
      const rows = await db.$queryRawUnsafe<Row[]>(SELECT_SQL);
      return rows.map(toRecord);
    } catch (error) {
      // 表還沒建、或少了新加的欄位 —— 兩種都是先修好 schema 再重試一次。
      // ⚠️ 不能只判斷「表不存在」：表早就在正式庫了，缺的是欄位（1054）。
      if (!needsSchemaFix(error)) throw error;
      await ensureVideoTable();
      const rows = await db.$queryRawUnsafe<Row[]>(SELECT_SQL);
      return rows.map(toRecord);
    }
  });
}

/**
 * 對外用：只回上架中的。
 *
 * 🔴 讀不到就回空陣列，**不要往上丟錯誤** —— 影音區塊掛掉不該讓整個首頁 500。
 * 這裡是資料庫通往前台的唯一出口，新增對外欄位時這個 map 沒補就等於沒做，
 * 而且不會有人告訴你（`getPublicListings()` 那邊踩過一次）。
 */
export async function getPublicVideos(): Promise<PublicVideo[]> {
  try {
    const rows = await listAllVideos();
    return rows
      .filter((row) => row.status === "active")
      .map((row) => ({
        id: row.id,
        category: row.category,
        title: row.title,
        url: row.url,
        source: row.source,
        videoId: row.videoId,
        summary: row.summary,
        publishedAt: row.publishedAt,
        // YouTube 的縮圖現組，自己上傳的用上傳時截下來的封面
        thumbnail: row.videoId ? youtubeThumbnail(row.videoId) : row.posterUrl,
      }));
  } catch (error) {
    console.error("[videos] 讀不到影音:", error);
    return [];
  }
}

// ---------------------------------------------------------------- 驗證

export type Validated = { ok: true; value: VideoInput } | { ok: false; error: string };

export function validateVideo(input: VideoInput): Validated {
  const title = (input.title ?? "").trim().slice(0, 255);
  const url = (input.url ?? "").trim().slice(0, 500);
  const summary = (input.summary ?? "").trim().slice(0, 500);
  const posterUrl = (input.posterUrl ?? "").trim().slice(0, 500);
  const source: VideoSource = isVideoSource(input.source) ? input.source : "youtube";

  if (!title) return { ok: false, error: "標題不能空白" };
  if (!isVideoCategory(input.category)) return { ok: false, error: "分類不對" };
  if (!url) {
    return {
      ok: false,
      error: source === "upload" ? "還沒有上傳影片檔，或上傳還沒完成" : "影片網址不能空白",
    };
  }

  // 不是 YouTube 也收（FB reels、IG 之類），但至少要是個看起來像網址的東西 ——
  // 貼錯的話卡片會變成一顆連到不存在頁面的按鈕，客戶點下去是死的
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (!/^https?:$/.test(parsed.protocol)) return { ok: false, error: "網址要以 http 或 https 開頭" };
  } catch {
    return { ok: false, error: "這不是一個有效的網址" };
  }

  // 日期格式不對就當今天 —— 擋在這裡，不要讓髒字串進資料庫害排序亂掉
  const publishedAt = /^\d{4}-\d{2}-\d{2}$/.test((input.publishedAt ?? "").trim())
    ? input.publishedAt.trim()
    : todayTaipei();

  const bytes = typeof input.bytes === "number" && Number.isFinite(input.bytes) ? input.bytes : null;
  if (source === "upload" && bytes !== null && bytes > MAX_VIDEO_UPLOAD_BYTES) {
    return { ok: false, error: `影片太大了（上限 ${Math.round(MAX_VIDEO_UPLOAD_BYTES / 1024 / 1024)}MB）` };
  }

  return {
    ok: true,
    value: {
      category: input.category,
      title,
      url,
      source,
      // 封面圖只有自己上傳的用得到；YouTube 的縮圖是現組的，存了也是死資料
      posterUrl: source === "upload" ? posterUrl : "",
      bytes: source === "upload" ? bytes : null,
      summary,
      publishedAt,
      status: input.status === "hidden" ? "hidden" : "active",
    },
  };
}

// ---------------------------------------------------------------- 寫

async function ensureThenRun<T>(run: () => Promise<T>): Promise<T> {
  return withRetry(async () => {
    try {
      return await run();
    } catch (error) {
      // 表不存在（1146）或少欄位（1054）都靠 ensureVideoTable() 修
      if (!needsSchemaFix(error)) throw error;
      await ensureVideoTable();
      return run();
    }
  });
}

/** 自己上傳的檔案不是 YouTube，不要去解析它的網址（解不出來，而且沒意義） */
function youtubeIdFor(input: VideoInput): string | null {
  return input.source === "upload" ? null : parseYoutubeId(input.url);
}

export async function createVideo(input: VideoInput): Promise<string> {
  const id = randomUUID();
  const videoId = youtubeIdFor(input);
  return ensureThenRun(async () => {
    // 新的排在最後面。用 MAX+1 而不是筆數，中間刪過東西才不會撞號。
    await db.$executeRawUnsafe(
      `INSERT INTO site_video (id, category, title, url, source, video_id, poster_url, bytes, summary, published_at, status, sort_order)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(MAX(sort_order), -1) + 1 FROM site_video`,
      id,
      input.category,
      input.title,
      input.url,
      input.source,
      videoId,
      input.posterUrl || null,
      input.bytes,
      input.summary,
      input.publishedAt,
      input.status,
    );
    return id;
  });
}

export async function updateVideo(id: string, input: VideoInput): Promise<void> {
  const videoId = youtubeIdFor(input);
  await ensureThenRun(() =>
    db.$executeRawUnsafe(
      `UPDATE site_video SET category = ?, title = ?, url = ?, source = ?, video_id = ?,
              poster_url = ?, bytes = ?, summary = ?, published_at = ?, status = ?
       WHERE id = ?`,
      input.category,
      input.title,
      input.url,
      input.source,
      videoId,
      input.posterUrl || null,
      input.bytes,
      input.summary,
      input.publishedAt,
      input.status,
      id,
    ),
  );
}

export async function setVideoStatus(id: string, status: VideoStatus): Promise<void> {
  await ensureThenRun(() =>
    db.$executeRawUnsafe(`UPDATE site_video SET status = ? WHERE id = ?`, status, id),
  );
}

/**
 * 刪除一筆影片。自己上傳的檔案會**連 Blob 上的檔案一起刪掉**。
 *
 * ⚠️ 這件事非做不可：Hobby 方案最稀缺的就是儲存空間，只刪資料庫那一列的話，
 * 影片檔會留在 Blob 上永遠吃著空間，而且後台再也看不到它、沒人會發現。
 *
 * Blob 刪失敗不擋資料庫那一列 —— 使用者按了刪除就是要它從網站上消失，
 * 檔案沒清掉頂多是浪費空間，但那一列沒刪掉他會以為功能壞了。
 */
export async function deleteVideo(id: string): Promise<void> {
  const rows = await ensureThenRun(() =>
    db.$queryRawUnsafe<{ url: string; source: string | null; poster_url: string | null }[]>(
      `SELECT url, source, poster_url FROM site_video WHERE id = ?`,
      id,
    ),
  );

  await ensureThenRun(() => db.$executeRawUnsafe(`DELETE FROM site_video WHERE id = ?`, id));

  // 觀看紀錄一起清掉，不要留孤兒資料
  const { deleteVideoViews } = await import("@/lib/video-views");
  await deleteVideoViews(id);

  const row = rows[0];
  if (!row || row.source !== "upload") return;

  const targets = [row.url, row.poster_url].filter(
    (u): u is string => typeof u === "string" && u.includes(".blob.vercel-storage.com"),
  );
  if (targets.length === 0) return;

  try {
    const { del } = await import("@vercel/blob");
    await del(targets);
  } catch (error) {
    console.error("[videos] 影片檔從 Blob 刪不掉（資料庫那一列已經刪了）:", error);
  }
}

