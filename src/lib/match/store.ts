/**
 * 買方配對的資料層 —— 三張表，第一次用到時自己建
 *
 *   match_listing  愛屋店網同步進來的在售物件（主鍵 = 愛屋物件編號，例如 AA6260018）
 *   match_buyer    留過條件的買方；有綁 LINE（line_user_id）才收得到新物件推播
 *   match_viewing  預約看屋（code = 買方在 LINE 送出的預約編號 BK-XXXXXX）
 *
 * 跟這個專案其他的表一樣：raw SQL、CREATE TABLE IF NOT EXISTS、不進 prisma/schema.prisma，
 * 不需要 migration，也不會動到既有的預約（appointment）與收件匣（line_bot_message）資料。
 *
 * ⚠️ 連線池只有 3 條（見 lib/db.ts）。這裡的查詢一律循序，不要在同一個請求裡 Promise.all 打資料庫。
 */
import { randomInt, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { ListingUpsert } from "./houseol-parse";
import { normalizePreference, type Preference } from "./matcher";

let ensured = false;

export async function ensureMatchTables(): Promise<void> {
  if (ensured) return;

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS match_listing (
      id             VARCHAR(64)   NOT NULL,
      store_id       VARCHAR(16)   NOT NULL DEFAULT '',
      store_code     VARCHAR(16)   NOT NULL DEFAULT '',
      title          VARCHAR(255)  NOT NULL,
      city           VARCHAR(16)   NOT NULL DEFAULT '',
      district       VARCHAR(16)   NOT NULL DEFAULT '',
      address        VARCHAR(255)  NOT NULL DEFAULT '',
      price          DOUBLE        NOT NULL DEFAULT 0,
      original_price DOUBLE        NULL,
      unit_price     DOUBLE        NULL,
      rooms          INT           NOT NULL DEFAULT 0,
      halls          INT           NOT NULL DEFAULT 0,
      baths          INT           NOT NULL DEFAULT 0,
      \`size\`       DOUBLE        NOT NULL DEFAULT 0,
      land_size      DOUBLE        NOT NULL DEFAULT 0,
      \`type\`       VARCHAR(32)   NOT NULL DEFAULT '',
      usage_type     VARCHAR(32)   NOT NULL DEFAULT '',
      age            DOUBLE        NOT NULL DEFAULT 0,
      \`floor\`      VARCHAR(32)   NOT NULL DEFAULT '',
      features       TEXT          NULL,
      images         TEXT          NULL,
      video          VARCHAR(500)  NULL,
      description    TEXT          NULL,
      phone          VARCHAR(40)   NOT NULL DEFAULT '',
      source_url     VARCHAR(500)  NOT NULL DEFAULT '',
      status         VARCHAR(16)   NOT NULL DEFAULT 'available',
      first_seen_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      synced_at      DATETIME      NULL,
      hidden_at      DATETIME      NULL,
      updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_match_listing_status (status, city, district)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // land_size 是 2026-09-15 下午才加的欄位；表在那之前就已經建在正式庫。
  // CREATE TABLE IF NOT EXISTS 不會替既有的表補欄位，所以先查再 ALTER（跟 listing 表同一套做法）。
  const hasLandSize = await db.$queryRawUnsafe<unknown[]>(`SHOW COLUMNS FROM match_listing LIKE 'land_size'`);
  if (hasLandSize.length === 0) {
    await db.$executeRawUnsafe("ALTER TABLE match_listing ADD COLUMN land_size DOUBLE NOT NULL DEFAULT 0 AFTER `size`");
  }

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS match_buyer (
      id            VARCHAR(36)  NOT NULL,
      line_user_id  VARCHAR(64)  NULL,
      display_name  VARCHAR(120) NULL,
      name          VARCHAR(80)  NULL,
      phone         VARCHAR(40)  NULL,
      followed      TINYINT(1)   NOT NULL DEFAULT 1,
      notify        TINYINT(1)   NOT NULL DEFAULT 1,
      preference    TEXT         NULL,
      created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_match_buyer_line (line_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // notify 是 2026-09-16 才加的欄位（買方在 LINE 回「停止通知」用），表在那之前就建好了。
  // 同 land_size：CREATE TABLE IF NOT EXISTS 不補欄位，先查再 ALTER。
  const hasNotify = await db.$queryRawUnsafe<unknown[]>(`SHOW COLUMNS FROM match_buyer LIKE 'notify'`);
  if (hasNotify.length === 0) {
    await db.$executeRawUnsafe("ALTER TABLE match_buyer ADD COLUMN notify TINYINT(1) NOT NULL DEFAULT 1 AFTER followed");
  }

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS match_viewing (
      id            VARCHAR(36)  NOT NULL,
      code          VARCHAR(16)  NOT NULL,
      listing_id    VARCHAR(64)  NOT NULL,
      buyer_id      VARCHAR(36)  NULL,
      line_user_id  VARCHAR(64)  NULL,
      name          VARCHAR(80)  NOT NULL,
      phone         VARCHAR(40)  NOT NULL,
      preferred_at  VARCHAR(80)  NOT NULL DEFAULT '',
      note          TEXT         NULL,
      status        VARCHAR(16)  NOT NULL DEFAULT 'pending',
      agent_note    TEXT         NULL,
      linked_at     DATETIME     NULL,
      created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_match_viewing_code (code),
      KEY idx_match_viewing_line (line_user_id),
      KEY idx_match_viewing_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  ensured = true;
}

/** 資料庫裡的 JSON 字串陣列。解不出來就回空陣列，一筆壞資料不該讓整頁掛掉。 */
function parseArr(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string" && v !== "") : [];
  } catch {
    return [];
  }
}

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

// ---------------------------------------------------------------- 物件

export type MatchListing = ListingUpsert & {
  status: "available" | "hidden";
  firstSeenAt: Date | null;
  syncedAt: Date | null;
};

type ListingRow = {
  id: string;
  store_id: string;
  store_code: string;
  title: string;
  city: string;
  district: string;
  address: string;
  price: number;
  original_price: number | null;
  unit_price: number | null;
  rooms: number;
  halls: number;
  baths: number;
  size: number;
  land_size: number;
  type: string;
  usage_type: string;
  age: number;
  floor: string;
  features: string | null;
  images: string | null;
  video: string | null;
  description: string | null;
  phone: string;
  source_url: string;
  status: string;
  first_seen_at: Date | null;
  synced_at: Date | null;
};

const LISTING_COLS =
  "id, store_id, store_code, title, city, district, address, price, original_price, unit_price, rooms, halls, baths, `size`, land_size, `type`, usage_type, age, `floor`, features, images, video, description, phone, source_url, status, first_seen_at, synced_at";

function toListing(row: ListingRow): MatchListing {
  return {
    id: row.id,
    storeId: row.store_id,
    storeCode: row.store_code,
    title: row.title,
    city: row.city,
    district: row.district,
    address: row.address,
    price: n(row.price),
    originalPrice: row.original_price == null ? null : n(row.original_price),
    unitPrice: row.unit_price == null ? null : n(row.unit_price),
    rooms: n(row.rooms),
    halls: n(row.halls),
    baths: n(row.baths),
    size: n(row.size),
    landSize: n(row.land_size),
    type: row.type,
    usageType: row.usage_type,
    age: n(row.age),
    floor: row.floor,
    features: parseArr(row.features),
    images: parseArr(row.images),
    video: row.video,
    description: row.description ?? "",
    phone: row.phone,
    sourceUrl: row.source_url,
    status: row.status === "hidden" ? "hidden" : "available",
    firstSeenAt: row.first_seen_at,
    syncedAt: row.synced_at,
  };
}

/** 對外用：只回在售的物件（配對、表單選項都用這個） */
export async function listAvailableListings(): Promise<MatchListing[]> {
  await ensureMatchTables();
  const rows = await db.$queryRawUnsafe<ListingRow[]>(
    `SELECT ${LISTING_COLS} FROM match_listing WHERE status = 'available' ORDER BY first_seen_at DESC`,
  );
  return rows.map(toListing);
}

export async function getListing(id: string): Promise<MatchListing | null> {
  await ensureMatchTables();
  const rows = await db.$queryRawUnsafe<ListingRow[]>(`SELECT ${LISTING_COLS} FROM match_listing WHERE id = ? LIMIT 1`, id);
  return rows[0] ? toListing(rows[0]) : null;
}

/** 後台用：全部（含已下架），最新同步的在前 */
export async function listListingsForAdmin(limit = 500): Promise<MatchListing[]> {
  await ensureMatchTables();
  const rows = await db.$queryRawUnsafe<ListingRow[]>(
    `SELECT ${LISTING_COLS} FROM match_listing ORDER BY status ASC, first_seen_at DESC LIMIT ${Math.max(1, Math.min(2000, limit))}`,
  );
  return rows.map(toListing);
}

/** 同步用：這家店目前庫裡有哪些物件（id → status） */
export async function getListingStatusMap(storeId: string): Promise<Map<string, string>> {
  await ensureMatchTables();
  const rows = await db.$queryRawUnsafe<{ id: string; status: string }[]>(
    `SELECT id, status FROM match_listing WHERE store_id = ?`,
    storeId,
  );
  return new Map(rows.map((r) => [r.id, r.status]));
}

/**
 * 批次寫入（新增或更新）。一次 50 筆一句 INSERT … ON DUPLICATE KEY UPDATE，
 * 276 筆只要 6 句 —— 一筆一句的話 276 趟來回，在 Vercel 上就要十幾秒。
 */
export async function upsertListings(items: ListingUpsert[]): Promise<void> {
  await ensureMatchTables();
  const CHUNK = 50;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', NOW(), NULL)").join(",\n");
    const values = chunk.flatMap((l) => [
      l.id,
      l.storeId,
      l.storeCode,
      l.title,
      l.city,
      l.district,
      l.address,
      l.price,
      l.originalPrice,
      l.unitPrice,
      l.rooms,
      l.halls,
      l.baths,
      l.size,
      l.landSize,
      l.type,
      l.usageType,
      l.age,
      l.floor,
      JSON.stringify(l.features),
      JSON.stringify(l.images),
      l.video,
      l.description,
      l.phone,
      l.sourceUrl,
    ]);
    await db.$executeRawUnsafe(
      `INSERT INTO match_listing
         (id, store_id, store_code, title, city, district, address, price, original_price, unit_price,
          rooms, halls, baths, \`size\`, land_size, \`type\`, usage_type, age, \`floor\`, features, images, video, description,
          phone, source_url, status, synced_at, hidden_at)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         store_code = VALUES(store_code), title = VALUES(title), city = VALUES(city), district = VALUES(district),
         address = VALUES(address), price = VALUES(price), original_price = VALUES(original_price),
         unit_price = VALUES(unit_price), rooms = VALUES(rooms), halls = VALUES(halls), baths = VALUES(baths),
         \`size\` = VALUES(\`size\`), land_size = VALUES(land_size), \`type\` = VALUES(\`type\`), usage_type = VALUES(usage_type), age = VALUES(age),
         \`floor\` = VALUES(\`floor\`), features = VALUES(features), images = VALUES(images), video = VALUES(video),
         description = VALUES(description), phone = VALUES(phone), source_url = VALUES(source_url),
         status = 'available', synced_at = NOW(), hidden_at = NULL`,
      ...values,
    );
  }
}

/** 店網上消失的物件標成下架（成交／撤件），不刪 —— 預約紀錄還指著它 */
export async function hideListings(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await ensureMatchTables();
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    await db.$executeRawUnsafe(
      `UPDATE match_listing SET status = 'hidden', hidden_at = NOW() WHERE status = 'available' AND id IN (${chunk.map(() => "?").join(",")})`,
      ...chunk,
    );
  }
}

export async function countListings(): Promise<{ available: number; hidden: number }> {
  await ensureMatchTables();
  const rows = await db.$queryRawUnsafe<{ status: string; c: bigint | number }[]>(
    `SELECT status, COUNT(*) AS c FROM match_listing GROUP BY status`,
  );
  const out = { available: 0, hidden: 0 };
  for (const r of rows) {
    if (r.status === "available") out.available = Number(r.c);
    else if (r.status === "hidden") out.hidden = Number(r.c);
  }
  return out;
}

/** 表單選項：從在售物件整理出縣市／行政區 */
export async function getMatchMeta(): Promise<{ cities: { city: string; districts: string[] }[] }> {
  await ensureMatchTables();
  const rows = await db.$queryRawUnsafe<{ city: string; district: string; c: bigint | number }[]>(
    `SELECT city, district, COUNT(*) AS c FROM match_listing
      WHERE status = 'available' AND city <> '' GROUP BY city, district ORDER BY c DESC`,
  );
  const map = new Map<string, string[]>();
  for (const r of rows) {
    if (!map.has(r.city)) map.set(r.city, []);
    if (r.district) map.get(r.city)!.push(r.district);
  }
  return { cities: [...map].map(([city, districts]) => ({ city, districts })) };
}

// ---------------------------------------------------------------- 買方

export type Buyer = {
  id: string;
  lineUserId: string | null;
  displayName: string | null;
  name: string | null;
  phone: string | null;
  /** 還是官方帳號的好友嗎。封鎖／刪除好友時由 webhook 的 unfollow 事件寫 false */
  followed: boolean;
  /** 要不要收新物件推播。買方自己在 LINE 回「停止通知」會變 false */
  notify: boolean;
  preference: Preference | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type BuyerRow = {
  id: string;
  line_user_id: string | null;
  display_name: string | null;
  name: string | null;
  phone: string | null;
  followed: number;
  notify: number;
  preference: string | null;
  created_at: Date | null;
  updated_at: Date | null;
};

function toBuyer(row: BuyerRow): Buyer {
  let preference: Preference | null = null;
  if (row.preference) {
    try {
      preference = normalizePreference(JSON.parse(row.preference));
    } catch {
      preference = null;
    }
  }
  return {
    id: row.id,
    lineUserId: row.line_user_id,
    displayName: row.display_name,
    name: row.name,
    phone: row.phone,
    followed: Number(row.followed) !== 0,
    notify: Number(row.notify) !== 0,
    preference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const BUYER_COLS = "id, line_user_id, display_name, name, phone, followed, notify, preference, created_at, updated_at";

export async function getBuyer(id: string): Promise<Buyer | null> {
  await ensureMatchTables();
  const rows = await db.$queryRawUnsafe<BuyerRow[]>(`SELECT ${BUYER_COLS} FROM match_buyer WHERE id = ? LIMIT 1`, id);
  return rows[0] ? toBuyer(rows[0]) : null;
}

export async function getBuyerByLine(lineUserId: string): Promise<Buyer | null> {
  await ensureMatchTables();
  const rows = await db.$queryRawUnsafe<BuyerRow[]>(`SELECT ${BUYER_COLS} FROM match_buyer WHERE line_user_id = ? LIMIT 1`, lineUserId);
  return rows[0] ? toBuyer(rows[0]) : null;
}

export type BuyerUpsertInput = {
  id?: string | null;
  lineUserId?: string | null;
  displayName?: string | null;
  name?: string | null;
  phone?: string | null;
  preference?: Preference | null;
  followed?: boolean;
  notify?: boolean;
};

/**
 * 兩筆買方合併時，條件要留哪一筆 —— 留「比較晚更新」的那筆。
 *
 * 會撞在一起是因為他換手機／清掉瀏覽資料後重填條件（新的一筆），之後又送預約編號綁 LINE
 * （舊的那筆）。新填的才是他現在要的，舊的不見得動過。
 */
function newerPreference(a: Buyer, b: Buyer): Preference | null {
  if (!a.preference) return b.preference;
  if (!b.preference) return a.preference;
  const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
  const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
  return tb > ta ? b.preference : a.preference;
}

/**
 * 以 id 或 lineUserId 找到既有買方並更新，找不到就新增。
 *
 * 買方通常先在網頁留條件（只有 id，存在瀏覽器），之後才在 LINE 綁定（有 lineUserId）。
 * 兩筆對到不同人時合併成 LINE 那一筆（LINE 身分比較可靠），預約紀錄一起改指過去，
 * 網頁留的條件不能丟 —— 之後新物件推播就是靠它。
 */
export async function upsertBuyer(input: BuyerUpsertInput): Promise<Buyer> {
  await ensureMatchTables();
  const byId = input.id ? await getBuyer(input.id) : null;
  const byLine = input.lineUserId ? await getBuyerByLine(input.lineUserId) : null;
  let target = byLine ?? byId;

  if (byLine && byId && byLine.id !== byId.id) {
    await db.$executeRawUnsafe(`UPDATE match_viewing SET buyer_id = ? WHERE buyer_id = ?`, byLine.id, byId.id);
    await db.$executeRawUnsafe(`DELETE FROM match_buyer WHERE id = ?`, byId.id);
    target = {
      ...byLine,
      name: byLine.name ?? byId.name,
      phone: byLine.phone ?? byId.phone,
      preference: newerPreference(byLine, byId),
    };
  }

  const merged = {
    lineUserId: input.lineUserId ?? target?.lineUserId ?? null,
    displayName: input.displayName || target?.displayName || null,
    name: input.name || target?.name || null,
    phone: input.phone || target?.phone || null,
    preference: input.preference ?? target?.preference ?? null,
    followed: input.followed ?? target?.followed ?? true,
    notify: input.notify ?? target?.notify ?? true,
  };
  const prefJson = merged.preference ? JSON.stringify(merged.preference) : null;

  if (!target) {
    const id = randomUUID();
    await db.$executeRawUnsafe(
      `INSERT INTO match_buyer (id, line_user_id, display_name, name, phone, followed, notify, preference) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      merged.lineUserId,
      merged.displayName,
      merged.name,
      merged.phone,
      merged.followed ? 1 : 0,
      merged.notify ? 1 : 0,
      prefJson,
    );
    return (await getBuyer(id))!;
  }

  await db.$executeRawUnsafe(
    `UPDATE match_buyer SET line_user_id = ?, display_name = ?, name = ?, phone = ?, followed = ?, notify = ?, preference = ? WHERE id = ?`,
    merged.lineUserId,
    merged.displayName,
    merged.name,
    merged.phone,
    merged.followed ? 1 : 0,
    merged.notify ? 1 : 0,
    prefJson,
    target.id,
  );
  return (await getBuyer(target.id))!;
}

/** 推播用：綁了 LINE、還是好友、而且留過條件的買方 */
export async function listBuyersForNotify(): Promise<Buyer[]> {
  await ensureMatchTables();
  const rows = await db.$queryRawUnsafe<BuyerRow[]>(
    `SELECT ${BUYER_COLS} FROM match_buyer WHERE line_user_id IS NOT NULL AND followed = 1 AND notify = 1 AND preference IS NOT NULL ORDER BY updated_at DESC LIMIT 500`,
  );
  return rows.map(toBuyer).filter((b) => b.preference);
}

/**
 * 改「還是好友嗎」「要不要收通知」這兩個旗標，用 LINE userId 找人。
 *
 * 找不到（這位好友從來沒留過條件）回 null —— 呼叫端據此回不同的話。
 * 這裡刻意不建新買方：unfollow 事件如果幫每個封鎖的人都建一筆，買方名單會被灌爆。
 */
export async function setBuyerFlagsByLine(
  lineUserId: string,
  flags: { followed?: boolean; notify?: boolean },
): Promise<Buyer | null> {
  await ensureMatchTables();
  const sets: string[] = [];
  const values: unknown[] = [];
  if (flags.followed !== undefined) {
    sets.push("followed = ?");
    values.push(flags.followed ? 1 : 0);
  }
  if (flags.notify !== undefined) {
    sets.push("notify = ?");
    values.push(flags.notify ? 1 : 0);
  }
  if (!sets.length) return getBuyerByLine(lineUserId);
  await db.$executeRawUnsafe(`UPDATE match_buyer SET ${sets.join(", ")} WHERE line_user_id = ?`, ...values, lineUserId);
  return getBuyerByLine(lineUserId);
}

export async function listBuyersForAdmin(limit = 300): Promise<Buyer[]> {
  await ensureMatchTables();
  const rows = await db.$queryRawUnsafe<BuyerRow[]>(
    `SELECT ${BUYER_COLS} FROM match_buyer ORDER BY updated_at DESC LIMIT ${Math.max(1, Math.min(2000, limit))}`,
  );
  return rows.map(toBuyer);
}

// ---------------------------------------------------------------- 預約看屋

export type Viewing = {
  id: string;
  code: string;
  listingId: string;
  buyerId: string | null;
  lineUserId: string | null;
  name: string;
  phone: string;
  preferredAt: string;
  note: string;
  status: string;
  agentNote: string;
  linkedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type ViewingRow = {
  id: string;
  code: string;
  listing_id: string;
  buyer_id: string | null;
  line_user_id: string | null;
  name: string;
  phone: string;
  preferred_at: string;
  note: string | null;
  status: string;
  agent_note: string | null;
  linked_at: Date | null;
  created_at: Date | null;
  updated_at: Date | null;
};

const VIEWING_COLS = "id, code, listing_id, buyer_id, line_user_id, name, phone, preferred_at, note, status, agent_note, linked_at, created_at, updated_at";

function toViewing(row: ViewingRow): Viewing {
  return {
    id: row.id,
    code: row.code,
    listingId: row.listing_id,
    buyerId: row.buyer_id,
    lineUserId: row.line_user_id,
    name: row.name,
    phone: row.phone,
    preferredAt: row.preferred_at,
    note: row.note ?? "",
    status: row.status,
    agentNote: row.agent_note ?? "",
    linkedAt: row.linked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 預約編號：去掉容易混淆的字元（0/O、1/I），買方要在 LINE 裡看得清楚 */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeCode(): string {
  let s = "BK-";
  for (let i = 0; i < 6; i++) s += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return s;
}

export async function createViewing(input: {
  listingId: string;
  buyerId: string | null;
  name: string;
  phone: string;
  preferredAt: string;
  note: string;
}): Promise<Viewing> {
  await ensureMatchTables();
  const id = randomUUID();
  // 編號撞到（UNIQUE）就換一組再試，機率極低但不能讓客戶看到錯誤
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode();
    try {
      await db.$executeRawUnsafe(
        `INSERT INTO match_viewing (id, code, listing_id, buyer_id, name, phone, preferred_at, note, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        id,
        code,
        input.listingId,
        input.buyerId,
        input.name,
        input.phone,
        input.preferredAt,
        input.note || null,
      );
      return (await getViewing(id))!;
    } catch (e) {
      if (!/duplicate/i.test(e instanceof Error ? e.message : String(e))) throw e;
    }
  }
  throw new Error("預約編號產生失敗，請再試一次");
}

export async function getViewing(id: string): Promise<Viewing | null> {
  await ensureMatchTables();
  const rows = await db.$queryRawUnsafe<ViewingRow[]>(`SELECT ${VIEWING_COLS} FROM match_viewing WHERE id = ? LIMIT 1`, id);
  return rows[0] ? toViewing(rows[0]) : null;
}

export async function getViewingByCode(code: string): Promise<Viewing | null> {
  await ensureMatchTables();
  const rows = await db.$queryRawUnsafe<ViewingRow[]>(
    `SELECT ${VIEWING_COLS} FROM match_viewing WHERE code = ? LIMIT 1`,
    String(code).toUpperCase(),
  );
  return rows[0] ? toViewing(rows[0]) : null;
}

export async function updateViewing(
  id: string,
  patch: { lineUserId?: string | null; buyerId?: string | null; status?: string; agentNote?: string | null; linked?: boolean },
): Promise<Viewing | null> {
  await ensureMatchTables();
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.lineUserId !== undefined) {
    sets.push("line_user_id = ?");
    values.push(patch.lineUserId);
  }
  if (patch.buyerId !== undefined) {
    sets.push("buyer_id = ?");
    values.push(patch.buyerId);
  }
  if (patch.status !== undefined) {
    sets.push("status = ?");
    values.push(patch.status);
  }
  if (patch.agentNote !== undefined) {
    sets.push("agent_note = ?");
    values.push(patch.agentNote);
  }
  if (patch.linked) sets.push("linked_at = COALESCE(linked_at, NOW())");
  if (sets.length) {
    values.push(id);
    await db.$executeRawUnsafe(`UPDATE match_viewing SET ${sets.join(", ")} WHERE id = ?`, ...values);
  }
  return getViewing(id);
}

export async function listViewingsByLine(lineUserId: string, limit = 5): Promise<Viewing[]> {
  await ensureMatchTables();
  const rows = await db.$queryRawUnsafe<ViewingRow[]>(
    `SELECT ${VIEWING_COLS} FROM match_viewing WHERE line_user_id = ? AND status <> 'cancelled' ORDER BY created_at DESC LIMIT ${Math.max(1, Math.min(20, limit))}`,
    lineUserId,
  );
  return rows.map(toViewing);
}

export type ViewingWithListing = Viewing & {
  listingTitle: string;
  listingCity: string;
  listingDistrict: string;
  listingPrice: number;
  buyerDisplayName: string | null;
};

/** 後台清單：帶上物件名稱與買方的 LINE 顯示名稱，最新的在前 */
export async function listViewingsForAdmin(limit = 300): Promise<ViewingWithListing[]> {
  await ensureMatchTables();
  const rows = await db.$queryRawUnsafe<(ViewingRow & { listing_title: string | null; listing_city: string | null; listing_district: string | null; listing_price: number | null; buyer_display_name: string | null })[]>(
    `SELECT v.id, v.code, v.listing_id, v.buyer_id, v.line_user_id, v.name, v.phone, v.preferred_at, v.note, v.status, v.agent_note, v.linked_at, v.created_at, v.updated_at,
            l.title AS listing_title, l.city AS listing_city, l.district AS listing_district, l.price AS listing_price,
            b.display_name AS buyer_display_name
       FROM match_viewing v
       LEFT JOIN match_listing l ON l.id = v.listing_id
       LEFT JOIN match_buyer b ON b.id = v.buyer_id
      ORDER BY v.created_at DESC LIMIT ${Math.max(1, Math.min(2000, limit))}`,
  );
  return rows.map((row) => ({
    ...toViewing(row),
    listingTitle: row.listing_title ?? row.listing_id,
    listingCity: row.listing_city ?? "",
    listingDistrict: row.listing_district ?? "",
    listingPrice: n(row.listing_price),
    buyerDisplayName: row.buyer_display_name,
  }));
}
