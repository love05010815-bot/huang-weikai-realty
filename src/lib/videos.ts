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
 * ## YouTube 以外的網址也收
 *
 * 認得出 YouTube 影片 ID 的（watch / youtu.be / shorts / embed 四種寫法）
 * 就存 `video_id`，前台可以直接嵌入播放器、縮圖也自動有。
 * FB reels、IG 那種認不出來的就只存網址，卡片變成「點了開新分頁」。
 * **兩種都能上架**，不要因為不是 YouTube 就擋掉。
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

/**
 * 首頁每一類各放幾支。
 *
 * 兩類各 2 支 ＝ 首頁一排 4 張，跟精選好案那排 3 張錯開，不會看起來像同一區。
 * 要調整首頁放哪幾支不用改這個數字 —— 到後台把想放的那幾支用箭頭移到最前面就好。
 */
export const HOME_VIDEO_PER_CATEGORY = 2;

export function isVideoCategory(value: unknown): value is VideoCategory {
  return typeof value === "string" && (VIDEO_CATEGORIES as readonly string[]).includes(value);
}

export type VideoStatus = "active" | "hidden";

/** 後台看到的一筆 */
export type VideoRecord = {
  id: string;
  category: VideoCategory;
  title: string;
  /** 原始網址（後台貼進來的那個） */
  url: string;
  /** YouTube 影片 ID。認不出來就是 null，那種卡片不嵌入、只連出去 */
  videoId: string | null;
  /** 一句話說明，可留空 */
  summary: string;
  status: VideoStatus;
  sortOrder: number;
  updatedAt: Date | null;
};

/** 後台送進來的 */
export type VideoInput = {
  category: VideoCategory;
  title: string;
  url: string;
  summary: string;
  status: VideoStatus;
};

/** 對外顯示用 */
export type PublicVideo = {
  id: string;
  category: VideoCategory;
  title: string;
  url: string;
  videoId: string | null;
  summary: string;
  /** 縮圖網址。YouTube 的自動組出來，其他來源是 null（卡片顯示佔位塊） */
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
      video_id   VARCHAR(32)  NULL,
      summary    VARCHAR(500) NULL,
      status     VARCHAR(16)  NOT NULL DEFAULT 'active',
      sort_order INT          NOT NULL DEFAULT 0,
      created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_site_video_order (category, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

// ---------------------------------------------------------------- 讀

type Row = {
  id: string;
  category: string;
  title: string;
  url: string;
  video_id: string | null;
  summary: string | null;
  status: string;
  sort_order: number;
  updated_at: Date | null;
};

function toRecord(row: Row): VideoRecord {
  return {
    id: row.id,
    // 資料庫裡萬一有不認得的分類（手改過、或以後拿掉某一類），
    // 一律當知識型，不要讓整頁掛掉
    category: isVideoCategory(row.category) ? row.category : "knowledge",
    title: row.title,
    url: row.url,
    videoId: row.video_id || null,
    summary: row.summary || "",
    status: row.status === "hidden" ? "hidden" : "active",
    sortOrder: Number(row.sort_order ?? 0),
    updatedAt: row.updated_at ?? null,
  };
}

const SELECT_SQL = `SELECT id, category, title, url, video_id, summary, status, sort_order, updated_at
     FROM site_video ORDER BY sort_order ASC, created_at ASC`;

/** 後台用：全部，含隱藏的 */
export async function listAllVideos(): Promise<VideoRecord[]> {
  return withRetry(async () => {
    try {
      const rows = await db.$queryRawUnsafe<Row[]>(SELECT_SQL);
      return rows.map(toRecord);
    } catch (error) {
      // 表還沒建 ＝ 還沒有任何影片，不是錯誤
      if (isMissingTable(error)) return [];
      throw error;
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
        videoId: row.videoId,
        summary: row.summary,
        thumbnail: row.videoId ? youtubeThumbnail(row.videoId) : null,
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

  if (!title) return { ok: false, error: "標題不能空白" };
  if (!url) return { ok: false, error: "影片網址不能空白" };
  if (!isVideoCategory(input.category)) return { ok: false, error: "分類不對" };

  // 不是 YouTube 也收（FB reels、IG 之類），但至少要是個看起來像網址的東西 ——
  // 貼錯的話卡片會變成一顆連到不存在頁面的按鈕，客戶點下去是死的
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (!/^https?:$/.test(parsed.protocol)) return { ok: false, error: "網址要以 http 或 https 開頭" };
  } catch {
    return { ok: false, error: "這不是一個有效的網址" };
  }

  return {
    ok: true,
    value: {
      category: input.category,
      title,
      url,
      summary,
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
      if (!isMissingTable(error)) throw error;
      await ensureVideoTable();
      return run();
    }
  });
}

export async function createVideo(input: VideoInput): Promise<string> {
  const id = randomUUID();
  const videoId = parseYoutubeId(input.url);
  return ensureThenRun(async () => {
    // 新的排在最後面。用 MAX+1 而不是筆數，中間刪過東西才不會撞號。
    await db.$executeRawUnsafe(
      `INSERT INTO site_video (id, category, title, url, video_id, summary, status, sort_order)
       SELECT ?, ?, ?, ?, ?, ?, ?, COALESCE(MAX(sort_order), -1) + 1 FROM site_video`,
      id,
      input.category,
      input.title,
      input.url,
      videoId,
      input.summary,
      input.status,
    );
    return id;
  });
}

export async function updateVideo(id: string, input: VideoInput): Promise<void> {
  const videoId = parseYoutubeId(input.url);
  await ensureThenRun(() =>
    db.$executeRawUnsafe(
      `UPDATE site_video SET category = ?, title = ?, url = ?, video_id = ?, summary = ?, status = ?
       WHERE id = ?`,
      input.category,
      input.title,
      input.url,
      videoId,
      input.summary,
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

export async function deleteVideo(id: string): Promise<void> {
  await ensureThenRun(() => db.$executeRawUnsafe(`DELETE FROM site_video WHERE id = ?`, id));
}

/**
 * 上移／下移。跟同分類裡的鄰居交換 sort_order。
 *
 * 只跟「同一個分類裡」的鄰居換 —— 不然按上移會跳到別的分類去，看起來像壞掉。
 * 前台是先照分類分區、區內再照 sort_order，所以號碼連不連續不重要。
 */
export async function moveVideo(id: string, direction: "up" | "down"): Promise<void> {
  const rows = await listAllVideos();
  const current = rows.find((r) => r.id === id);
  if (!current) return;

  const sameCategory = rows.filter((r) => r.category === current.category);
  const localIndex = sameCategory.findIndex((r) => r.id === id);
  const neighbour = direction === "up" ? sameCategory[localIndex - 1] : sameCategory[localIndex + 1];
  if (!neighbour) return;

  await ensureThenRun(async () => {
    await db.$executeRawUnsafe(
      `UPDATE site_video SET sort_order = ? WHERE id = ?`,
      neighbour.sortOrder,
      current.id,
    );
    await db.$executeRawUnsafe(
      `UPDATE site_video SET sort_order = ? WHERE id = ?`,
      current.sortOrder,
      neighbour.id,
    );
  });
}
