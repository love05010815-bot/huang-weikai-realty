/**
 * 🏠 精選好案 —— 資料層
 *
 * 2026-08-20 起物件改存資料庫，後台 /admin/listings 可以自己新增、改字、上下架、排順序，
 * **改完立刻生效，不用部署**。
 *
 * ⚠️ `src/config/listings.ts` 現在的角色是「初始種子 ＋ 資料庫連不上時的備援」，
 *    不再是唯一真相來源。改物件請進後台，不要再改那個檔（改了也不會生效，
 *    因為種子只在第一次跑的時候灌一次）。
 *
 * 為什麼不開 Prisma model：這個專案既有的做法就是 raw SQL 自建表（appointment、
 * appointment_config、appointment_case_sequence 全都是），跟著走才不會有人下次
 * `prisma migrate` 把別人的表洗掉。
 *
 * 📷 2026-08-21 起照片改成**後台直接從電腦上傳**（存 Vercel Blob，見 lib/listing-photos.ts），
 *    不用再把圖檔加進 repo 部署一次。**一筆物件可以放多張**（photos 陣列，第一張是封面），
 *    兩張以上前台卡片會自動變成可左右滑的相簿。
 *    photos 裡存的是可直接顯示的網址，舊資料的 `/listings/xxx.jpg` 也還讀得動。
 */
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getConfig, setConfig } from "@/lib/google-calendar";
import { LISTINGS, MAX_PHOTOS, type Listing } from "@/config/listings";

export type ListingStatus = "active" | "sold";

/** 後台看到的一筆物件（比對外多了 id、排序、時間） */
export type ListingRecord = {
  id: string;
  slug: string;
  title: string;
  points: string[];
  area: string;
  /** 第一張是封面。空陣列＝還沒有照片，畫面顯示佔位塊。 */
  photos: string[];
  /** 物件詳情頁（例如 591）。null＝後台留空，前台就不顯示這顆按鈕。 */
  link: { label: string; href: string } | null;
  /** 影片賞析（例如 YouTube）。null＝後台留空，前台就不顯示這顆按鈕。 */
  video: { label: string; href: string } | null;
  status: ListingStatus;
  sortOrder: number;
  updatedAt: Date | null;
};

/** 存進資料庫前的輸入（新增時 id 省略） */
export type ListingInput = {
  slug: string;
  title: string;
  points: string[];
  area: string;
  photos: string[];
  linkLabel: string;
  linkHref: string;
  videoHref: string;
  status: ListingStatus;
};

/** 種子只灌一次的旗標，存在 appointment_config */
const SEEDED_KEY = "listings_seeded_v1";

/** 單張 photo 搬成 photos 陣列的一次性遷移旗標 */
const PHOTOS_MIGRATED_KEY = "listings_photos_migrated_v1";

// ---------------------------------------------------------------- 建表 / 種子

let ensured = false;

/**
 * 建表（不存在才建）＋ 第一次執行時把 config 裡的物件灌進去。
 *
 * 🔴 種子只灌一次，靠 appointment_config 的旗標擋。
 *    不然你在後台把某一筆刪掉，下次部署它又自己長回來。
 */
export async function ensureListingTable(): Promise<void> {
  if (ensured) return;

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS listing (
      id          VARCHAR(36)  NOT NULL,
      slug        VARCHAR(120) NOT NULL,
      title       VARCHAR(255) NOT NULL,
      points      TEXT         NULL,
      area        VARCHAR(120) NOT NULL DEFAULT '',
      photos      TEXT         NULL,
      photo       VARCHAR(160) NULL,
      link_label  VARCHAR(80)  NULL,
      link_href   VARCHAR(500) NULL,
      video_href  VARCHAR(500) NULL,
      status      VARCHAR(16)  NOT NULL DEFAULT 'active',
      sort_order  INT          NOT NULL DEFAULT 0,
      created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_listing_slug (slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 這張表 2026-08-20 就在正式庫建好了，當時照片只有單張的 photo 欄。
  // CREATE TABLE IF NOT EXISTS 不會替既有的表補欄位，所以要另外 ALTER 一次。
  //
  // 先查再加，不用 try/catch 吞「重複欄位」—— 那樣每次啟動都會在 log 印一行
  // prisma:error，久了就會習慣性忽略 log，真的出事時反而看不見。
  const hasPhotos = await db.$queryRawUnsafe<unknown[]>(`SHOW COLUMNS FROM listing LIKE 'photos'`);
  if (hasPhotos.length === 0) {
    await db.$executeRawUnsafe(`ALTER TABLE listing ADD COLUMN photos TEXT NULL AFTER area`);
  }

  const hasVideoHref = await db.$queryRawUnsafe<unknown[]>(`SHOW COLUMNS FROM listing LIKE 'video_href'`);
  if (hasVideoHref.length === 0) {
    await db.$executeRawUnsafe(`ALTER TABLE listing ADD COLUMN video_href VARCHAR(500) NULL AFTER link_href`);
  }

  // 舊資料的單張 photo 搬進 photos 陣列，只跑一次。
  // 就算這段沒跑成功也不會壞 —— toRecord 讀不到 photos 時會自己退回 [photo]。
  if (!(await getConfig(PHOTOS_MIGRATED_KEY))) {
    await db.$executeRawUnsafe(
      `UPDATE listing SET photos = JSON_ARRAY(photo)
        WHERE photos IS NULL AND photo IS NOT NULL AND photo <> ''`,
    );
    await db.$executeRawUnsafe(`UPDATE listing SET photos = '[]' WHERE photos IS NULL`);
    await setConfig(PHOTOS_MIGRATED_KEY, new Date().toISOString());
  }

  if (!(await getConfig(SEEDED_KEY))) {
    for (const [index, item] of LISTINGS.entries()) {
      await db.$executeRaw`
        INSERT IGNORE INTO listing
          (id, slug, title, points, area, photos, photo, link_label, link_href, video_href, status, sort_order)
        VALUES (
          ${randomUUID()}, ${item.slug}, ${item.title}, ${JSON.stringify(item.points)},
          ${item.area}, ${JSON.stringify(item.photos)}, ${item.photos[0] ?? null},
          ${item.link?.label ?? null}, ${item.link?.href ?? null}, ${item.video?.href ?? null},
          ${item.status}, ${index}
        )
      `;
    }
    await setConfig(SEEDED_KEY, new Date().toISOString());
  }

  ensured = true;
}

// ---------------------------------------------------------------- 讀

type Row = {
  id: string;
  slug: string;
  title: string;
  points: string | null;
  area: string;
  photos: string | null;
  photo: string | null;
  link_label: string | null;
  link_href: string | null;
  video_href: string | null;
  status: string;
  sort_order: number;
  updated_at: Date | null;
};

function toRecord(row: Row): ListingRecord {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    points: parseStringArray(row.points),
    area: row.area,
    // photos 是後來才加的欄位。萬一 ALTER 或遷移沒跑到，就退回舊的單張 photo，
    // 讓畫面至少還有封面圖，不要整片變成「照片準備中」。
    photos: parseStringArray(row.photos, () => (row.photo ? [row.photo] : [])),
    link: row.link_href ? { label: row.link_label || "物件資訊", href: row.link_href } : null,
    video: row.video_href ? { label: "影片賞析", href: row.video_href } : null,
    status: row.status === "sold" ? "sold" : "active",
    sortOrder: Number(row.sort_order) || 0,
    updatedAt: row.updated_at,
  };
}

/**
 * 資料庫裡的 JSON 字串陣列（points、photos 共用）。
 *
 * 解不出來就走 fallback，不丟錯 —— 一筆資料格式壞掉不該讓整頁掛掉。
 */
function parseStringArray(raw: string | null, fallback: () => string[] = () => []): string[] {
  if (!raw) return fallback();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback();
    const values = parsed.filter((v): v is string => typeof v === "string" && v.trim() !== "");
    return values.length > 0 ? values : fallback();
  } catch {
    return fallback();
  }
}

/** 後台用：全部物件，含已下架的。 */
export async function listAllListings(): Promise<ListingRecord[]> {
  await ensureListingTable();
  const rows = await db.$queryRawUnsafe<Row[]>(
    `SELECT id, slug, title, points, area, photos, photo, link_label, link_href, video_href, status, sort_order, updated_at
       FROM listing ORDER BY sort_order ASC, created_at ASC`,
  );
  return rows.map(toRecord);
}

/**
 * 對外用：只回上架中的物件。
 *
 * 🔴 資料庫連不上時**回退到 config 的種子資料**，不是丟錯誤。
 *    官網首頁不能因為資料庫抽風就開天窗 —— 顯示舊物件遠比整頁掛掉好。
 */
export async function getPublicListings(): Promise<Listing[]> {
  try {
    const rows = await listAllListings();
    return rows
      .filter((row) => row.status === "active")
      .map((row) => ({
        slug: row.slug,
        title: row.title,
        points: row.points,
        area: row.area,
        photos: row.photos,
        link: row.link,
        status: "active" as const,
      }));
  } catch {
    return LISTINGS.filter((item) => item.status === "active");
  }
}

// ---------------------------------------------------------------- 寫

export function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

/** 存之前一律正規化＋檢查。回 error 就是不給存。 */
export function validateListing(input: ListingInput): { ok: true; value: ListingInput } | { ok: false; error: string } {
  const slug = normalizeSlug(input.slug);
  if (!slug) return { ok: false, error: "識別字（slug）不能空白，只能用小寫英數與連字號" };

  const title = input.title.trim().slice(0, 255);
  if (!title) return { ok: false, error: "標題不能空白" };

  const area = input.area.trim().slice(0, 120);
  if (!area) return { ok: false, error: "行政區＋社區名不能空白" };

  const points = input.points.map((p) => p.trim()).filter(Boolean).slice(0, 8);

  const linkHref = input.linkHref.trim().slice(0, 500);
  if (linkHref && !/^https?:\/\//i.test(linkHref)) {
    return { ok: false, error: "外部連結要以 http:// 或 https:// 開頭" };
  }

  const videoHref = input.videoHref.trim().slice(0, 500);
  if (videoHref && !/^https?:\/\//i.test(videoHref)) {
    return { ok: false, error: "影片賞析連結要以 http:// 或 https:// 開頭" };
  }

  return {
    ok: true,
    value: {
      slug,
      title,
      area,
      points,
      // 同一張挑兩次沒有意義（相簿會出現兩張一樣的），順手去重。
      photos: [...new Set(input.photos.map((p) => p.trim()).filter(Boolean))].slice(0, MAX_PHOTOS),
      linkLabel: input.linkLabel.trim().slice(0, 80),
      linkHref,
      videoHref,
      status: input.status === "sold" ? "sold" : "active",
    },
  };
}

/** 新增一筆，回新的 id。排序放最後面。 */
export async function createListing(input: ListingInput): Promise<string> {
  await ensureListingTable();
  const id = randomUUID();
  const rows = await db.$queryRawUnsafe<Array<{ next: number | null }>>(
    `SELECT MAX(sort_order) AS next FROM listing`,
  );
  const sortOrder = Number(rows[0]?.next ?? -1) + 1;
  await db.$executeRaw`
    INSERT INTO listing (id, slug, title, points, area, photos, photo, link_label, link_href, video_href, status, sort_order)
    VALUES (
      ${id}, ${input.slug}, ${input.title}, ${JSON.stringify(input.points)}, ${input.area},
      ${JSON.stringify(input.photos)}, ${input.photos[0] ?? null},
      ${input.linkLabel || null}, ${input.linkHref || null}, ${input.videoHref || null},
      ${input.status}, ${sortOrder}
    )
  `;
  return id;
}

export async function updateListing(id: string, input: ListingInput): Promise<void> {
  await ensureListingTable();
  const before = await getListingPhotos(id);
  // 舊的單張 photo 欄位一起維護（寫入封面那張）：萬一要回滾到上一版程式碼
  // （那版只讀 photo），封面圖還是對的，不會整片變成「照片準備中」。
  await db.$executeRaw`
    UPDATE listing SET
      slug = ${input.slug},
      title = ${input.title},
      points = ${JSON.stringify(input.points)},
      area = ${input.area},
      photos = ${JSON.stringify(input.photos)},
      photo = ${input.photos[0] ?? null},
      link_label = ${input.linkLabel || null},
      link_href = ${input.linkHref || null},
      video_href = ${input.videoHref || null},
      status = ${input.status}
    WHERE id = ${id}
  `;
  // 存檔成功之後才清掉被移除的照片 —— 順序相反的話，萬一 UPDATE 失敗，
  // 照片已經刪了但資料庫還指著它，畫面就會出現一堆破圖。
  await purgeUnusedPhotos(before, input.photos);
}

export async function setListingStatus(id: string, status: ListingStatus): Promise<void> {
  await ensureListingTable();
  await db.$executeRaw`UPDATE listing SET status = ${status} WHERE id = ${id}`;
}

export async function deleteListing(id: string): Promise<void> {
  await ensureListingTable();
  const before = await getListingPhotos(id);
  await db.$executeRaw`DELETE FROM listing WHERE id = ${id}`;
  await purgeUnusedPhotos(before, []);
}

/** 某一筆現在掛著哪些照片。查不到就回空陣列。 */
async function getListingPhotos(id: string): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ photos: string | null; photo: string | null }>>`
    SELECT photos, photo FROM listing WHERE id = ${id}
  `;
  const row = rows[0];
  if (!row) return [];
  return parseStringArray(row.photos, () => (row.photo ? [row.photo] : []));
}

/**
 * 把「這次被移除、而且沒有別筆物件還在用」的照片從 Blob 上刪掉。
 *
 * 🔴 為什麼要再查一次有沒有別筆在用：每次上傳都會產生新的亂數檔名，
 *    正常情況下一張照片只會屬於一筆物件。但人是會手動複製網址的，
 *    真的發生時「刪掉 A 的照片順便弄破 B」是很難查的災難，
 *    多一次查詢換掉這個風險很划算。
 *
 * repo 裡的舊檔（`/listings/xxx.jpg`）由 deleteListingPhoto 自己跳過，這裡不用管。
 */
async function purgeUnusedPhotos(before: string[], after: string[]): Promise<void> {
  const kept = new Set(after);
  const removed = before.filter((url) => !kept.has(url));
  if (removed.length === 0) return;

  const stillUsed = await db.$queryRawUnsafe<Array<{ photos: string | null }>>(
    `SELECT photos FROM listing`,
  );
  const inUse = new Set(stillUsed.flatMap((row) => parseStringArray(row.photos)));

  // 動態載入而不是頂層 import：這支檔案被首頁與 /listings 這些公開頁面讀取，
  // 不該為了「刪照片」這個罕見路徑就把 @vercel/blob 拖進每一次頁面渲染。
  const { deleteListingPhoto } = await import("@/lib/listing-photos");
  for (const url of removed) {
    if (inUse.has(url)) continue;
    await deleteListingPhoto(url);
  }
}

/**
 * 上移／下移一格：跟相鄰那一筆交換 sort_order。
 *
 * 用交換而不是重排全表，是因為兩筆 UPDATE 就結束，
 * 不會在中途失敗時留下一堆順序錯亂的資料。
 */
export async function moveListing(id: string, direction: "up" | "down"): Promise<void> {
  const rows = await listAllListings();
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) return;
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= rows.length) return;

  const a = rows[index];
  const b = rows[swapIndex];
  // 兩筆的 sort_order 有可能相同（種子灌歪或手動改過），那樣交換是沒有效果的，
  // 所以直接用「位置」重新指派，保證換得動。
  await db.$executeRaw`UPDATE listing SET sort_order = ${swapIndex} WHERE id = ${a.id}`;
  await db.$executeRaw`UPDATE listing SET sort_order = ${index} WHERE id = ${b.id}`;
}

