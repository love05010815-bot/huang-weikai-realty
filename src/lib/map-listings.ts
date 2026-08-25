/**
 * 🏠 建案地圖的在售物件 —— 獨立於「精選好案」的一套資料
 *
 * ## 為什麼不共用精選好案
 *
 * 2026-08-23 系統擁有者拍板：**地圖上的物件不要從精選好案抓**。
 * 兩者的用途不一樣 ——
 *   ・精選好案 = 首頁與 /listings 主打的物件，數量少、要輪替
 *   ・地圖物件 = 掛在特定建案底下，客戶點到那棟樓才看得到，可以放比較多
 * 混在一起的話，「想在地圖上多掛幾間」就會連帶把首頁洗版。
 *
 * 先前那版用物件 `area` 欄的文字比對來掛（「清水區・聯悅聚」），已經廢掉 ——
 * 打錯字物件就默默消失，而且沒辦法只上架到地圖不上架到首頁。
 *
 * ## 跟精選好案的差異
 *
 *   ・多了 `projectId`：對應 `port-projects.ts` 的建案 id，決定掛在哪一棟
 *   ・沒有 slug：這些物件不會有自己的網址，不需要識別字
 *   ・沒有影片欄：系統擁有者指定地圖上只要「物件資訊」與「預約諮詢」兩顆按鈕
 *
 * 照片共用精選好案那支上傳 API（`/api/admin/listings/photo`），
 * 存的一樣是 Vercel Blob 網址，前台用 `resolvePhotoSrc` 解析。
 */

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

export type MapListingStatus = "active" | "sold";

/** 後台看到的一筆（比對外多了 id、排序、時間） */
export type MapListingRecord = {
  id: string;
  /** 對應 port-projects.ts 的建案 id */
  projectId: string;
  title: string;
  /**
   * 物件地址。**只給後台自己看，不會出現在 /map 上。**
   *
   * 用途是「我到底上架過哪一間」—— 標題（例：中高樓無限視野兩房平車）
   * 同一棟樓可能有好幾間長得一模一樣，光看標題認不出來。
   */
  address: string | null;
  points: string[];
  /** 第一張是封面。空陣列＝還沒有照片，畫面顯示佔位塊 */
  photos: string[];
  /** 「物件資訊」按鈕的網址（591、FB 貼文之類）。留空那顆按鈕就不出現 */
  linkHref: string | null;
  status: MapListingStatus;
  sortOrder: number;
  updatedAt: Date | null;
};

/** 存進資料庫前的輸入 */
export type MapListingInput = {
  projectId: string;
  title: string;
  /** 物件地址，可留空。後台辨識用，不對外顯示 */
  address: string;
  points: string[];
  photos: string[];
  linkHref: string;
  status: MapListingStatus;
};

/** 對外顯示用的精簡版 */
export type PublicMapListing = {
  id: string;
  title: string;
  points: string[];
  photos: string[];
  linkHref: string | null;
};

/** 一筆物件最多幾張照片，跟精選好案一致 */
export const MAX_PHOTOS = 8;

// ---------------------------------------------------------------- 建表

let ensured = false;

/**
 * 建表（不存在才建）。
 *
 * 這張表**沒有種子資料** —— 精選好案有 config 種子是因為它先有靜態檔再搬進資料庫；
 * 地圖物件一開始就是空的，由系統擁有者自己上架。
 */
export async function ensureMapListingTable(): Promise<void> {
  if (ensured) return;
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS map_listing (
      id          VARCHAR(36)  NOT NULL,
      project_id  VARCHAR(64)  NOT NULL,
      title       VARCHAR(255) NOT NULL,
      address     VARCHAR(255) NULL,
      points      TEXT         NULL,
      photos      TEXT         NULL,
      link_href   VARCHAR(500) NULL,
      status      VARCHAR(16)  NOT NULL DEFAULT 'active',
      sort_order  INT          NOT NULL DEFAULT 0,
      created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_map_listing_project (project_id, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 這張表 2026-08-23 就在正式庫建好了，當時沒有 address 欄。
  // CREATE TABLE IF NOT EXISTS 不會替既有的表補欄位，所以要另外 ALTER 一次。
  //
  // 先查再加，不用 try/catch 吞「重複欄位」—— 那樣每次啟動都會在 log 印一行
  // prisma:error，久了就會習慣性忽略 log，真的出事時反而看不見。
  const hasAddress = await db.$queryRawUnsafe<unknown[]>(`SHOW COLUMNS FROM map_listing LIKE 'address'`);
  if (hasAddress.length === 0) {
    await db.$executeRawUnsafe(`ALTER TABLE map_listing ADD COLUMN address VARCHAR(255) NULL AFTER title`);
  }

  ensured = true;
}

// ---------------------------------------------------------------- 讀

type Row = {
  id: string;
  project_id: string;
  title: string;
  address: string | null;
  points: string | null;
  photos: string | null;
  link_href: string | null;
  status: string;
  sort_order: number;
  updated_at: Date | null;
};

/** JSON 欄位壞掉時回空陣列，不要讓整頁掛掉 —— 一筆資料髒不該害整個後台開不起來 */
function parseArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
  } catch {
    return [];
  }
}

function toRecord(r: Row): MapListingRecord {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    address: r.address?.trim() ? r.address.trim() : null,
    points: parseArray(r.points),
    photos: parseArray(r.photos),
    linkHref: r.link_href?.trim() ? r.link_href.trim() : null,
    status: r.status === "sold" ? "sold" : "active",
    sortOrder: r.sort_order,
    updatedAt: r.updated_at,
  };
}

/** 後台用：全部拿出來，含已下架的 */
export async function listAllMapListings(): Promise<MapListingRecord[]> {
  await ensureMapListingTable();
  const rows = await db.$queryRawUnsafe<Row[]>(
    `SELECT id, project_id, title, address, points, photos, link_href, status, sort_order, updated_at
       FROM map_listing ORDER BY project_id ASC, sort_order ASC, created_at ASC`,
  );
  return rows.map(toRecord);
}

/**
 * 前台用：只回上架中的，依建案分組。
 *
 * 資料庫連不上時回空 Map 而不是丟例外 —— `/map` 的建案資訊是靜態的，
 * 不該因為物件讀不到就整頁開天窗。
 */
export async function getMapListingsByProject(): Promise<Map<string, PublicMapListing[]>> {
  const out = new Map<string, PublicMapListing[]>();
  try {
    await ensureMapListingTable();
    const rows = await db.$queryRawUnsafe<Row[]>(
      `SELECT id, project_id, title, address, points, photos, link_href, status, sort_order, updated_at
         FROM map_listing WHERE status = 'active' ORDER BY sort_order ASC, created_at ASC`,
    );
    for (const row of rows) {
      const r = toRecord(row);
      const item: PublicMapListing = {
        id: r.id,
        title: r.title,
        points: r.points,
        photos: r.photos,
        linkHref: r.linkHref,
      };
      const bucket = out.get(r.projectId);
      if (bucket) bucket.push(item);
      else out.set(r.projectId, [item]);
    }
  } catch {
    // 讀不到就當作沒有物件，建案資訊照常顯示
  }
  return out;
}

// ---------------------------------------------------------------- 驗證

export function validateMapListing(
  input: MapListingInput,
): { ok: true; value: MapListingInput } | { ok: false; error: string } {
  const projectId = input.projectId?.trim() ?? "";
  const title = input.title?.trim() ?? "";
  if (!projectId) return { ok: false, error: "要先選這筆物件屬於哪個建案" };
  if (!title) return { ok: false, error: "標題不能空白" };
  if (title.length > 255) return { ok: false, error: "標題太長（最多 255 字）" };

  // 地址可留空 —— 舊資料本來就沒有，強制必填會讓既有的三筆全部存不回去
  const address = (input.address ?? "").trim();
  if (address.length > 255) return { ok: false, error: "地址太長（最多 255 字）" };

  const points = (input.points ?? []).map((p) => p.trim()).filter(Boolean);
  const photos = (input.photos ?? []).map((p) => p.trim()).filter(Boolean);
  if (photos.length > MAX_PHOTOS) return { ok: false, error: `照片最多 ${MAX_PHOTOS} 張` };

  const linkHref = (input.linkHref ?? "").trim();
  if (linkHref && !/^https?:\/\//i.test(linkHref)) {
    return { ok: false, error: "物件資訊網址要以 http:// 或 https:// 開頭" };
  }
  if (linkHref.length > 500) return { ok: false, error: "網址太長（最多 500 字）" };

  return {
    ok: true,
    value: { projectId, title, address, points, photos, linkHref, status: input.status === "sold" ? "sold" : "active" },
  };
}

// ---------------------------------------------------------------- 寫

export async function createMapListing(input: MapListingInput): Promise<string> {
  await ensureMapListingTable();
  const id = randomUUID();
  // 新物件排在同一個建案的最後面
  const rows = await db.$queryRawUnsafe<{ next: number | null }[]>(
    `SELECT MAX(sort_order) + 1 AS next FROM map_listing WHERE project_id = ?`,
    input.projectId,
  );
  const next = rows[0]?.next ?? 0;
  await db.$executeRawUnsafe(
    `INSERT INTO map_listing (id, project_id, title, address, points, photos, link_href, status, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.projectId,
    input.title,
    input.address || null,
    JSON.stringify(input.points),
    JSON.stringify(input.photos),
    input.linkHref || null,
    input.status,
    next,
  );
  return id;
}

export async function updateMapListing(id: string, input: MapListingInput): Promise<void> {
  await ensureMapListingTable();
  await db.$executeRawUnsafe(
    `UPDATE map_listing
        SET project_id = ?, title = ?, address = ?, points = ?, photos = ?, link_href = ?, status = ?
      WHERE id = ?`,
    input.projectId,
    input.title,
    input.address || null,
    JSON.stringify(input.points),
    JSON.stringify(input.photos),
    input.linkHref || null,
    input.status,
    id,
  );
}

export async function setMapListingStatus(id: string, status: MapListingStatus): Promise<void> {
  await ensureMapListingTable();
  await db.$executeRawUnsafe(`UPDATE map_listing SET status = ? WHERE id = ?`, status, id);
}

export async function deleteMapListing(id: string): Promise<void> {
  await ensureMapListingTable();
  await db.$executeRawUnsafe(`DELETE FROM map_listing WHERE id = ?`, id);
}

/**
 * 在同一個建案裡上下移動。
 *
 * 只跟「同建案」的鄰居換位置 —— 跨建案換順序沒有意義，
 * 而且會讓使用者以為按了沒反應（因為畫面上是分建案分組的）。
 */
export async function moveMapListing(id: string, direction: "up" | "down"): Promise<void> {
  await ensureMapListingTable();
  const rows = await db.$queryRawUnsafe<{ project_id: string; sort_order: number }[]>(
    `SELECT project_id, sort_order FROM map_listing WHERE id = ? LIMIT 1`,
    id,
  );
  const me = rows[0];
  if (!me) return;

  const cmp = direction === "up" ? "<" : ">";
  const order = direction === "up" ? "DESC" : "ASC";
  const neighbours = await db.$queryRawUnsafe<{ id: string; sort_order: number }[]>(
    `SELECT id, sort_order FROM map_listing
      WHERE project_id = ? AND sort_order ${cmp} ?
      ORDER BY sort_order ${order} LIMIT 1`,
    me.project_id,
    me.sort_order,
  );
  const other = neighbours[0];
  if (!other) return; // 已經在頭或尾

  await db.$executeRawUnsafe(`UPDATE map_listing SET sort_order = ? WHERE id = ?`, other.sort_order, id);
  await db.$executeRawUnsafe(`UPDATE map_listing SET sort_order = ? WHERE id = ?`, me.sort_order, other.id);
}
