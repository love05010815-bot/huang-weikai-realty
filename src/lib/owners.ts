/**
 * 📇 屋主建檔 —— 資料層
 *
 * 三張表，跟這個專案其他表一樣：raw SQL、CREATE TABLE IF NOT EXISTS、
 * 不進 prisma/schema.prisma、不用 migration。
 *
 *   owner_client       一筆＝一位屋主（姓名、電話、LINE、備註）
 *   owner_property     一筆＝一間房子，掛在某位屋主底下
 *   owner_contact_log  一筆＝跟屋主聊過一次，掛在某位屋主底下
 *
 * ## 為什麼是「人」掛「房子」，不是一間房一筆
 *
 * 同一位屋主可能給你賣過好幾間、賣完又買新的再委託。要查的永遠是「這個人」：
 * 電話一打就要看到他所有房子的履歷。一間房一筆的話同一個人會散在好幾筆，
 * 電話改了要改好幾處 —— 又是「兩份資料兜不起來」的坑。
 *
 * ## 🔴 個資只在資料庫
 *
 * 這個 repo 是公開的（見 learning_public_repo_no_pii）。屋主姓名、電話、門牌一個字都
 * 不准進檔案、不准進 commit。種子資料、測試資料也一樣，測完要刪。
 *
 * ## 日期存 CHAR(10) 不是 DATE
 *
 * 跟 dev_lead_contact.contacted_at 同一個理由：DATE 讀回來變 JS Date 再過一次時區，
 * 會默默差一天。存 "2026-10-12" 字串，進去什麼樣出來就什麼樣。
 *
 * ⚠️ 連線池只有 3 條（見 lib/db.ts）。查詢一律循序，不要 Promise.all。
 */
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { CONTRACT_TYPES, DELIST_REASONS, PROPERTY_STATUSES, type ContractType, type DelistReason, type PropertyStatus } from "@/config/owners";

// ---------------------------------------------------------------- 型別

export type OwnerRecord = {
  id: string;
  name: string;
  phone: string | null;
  phone2: string | null;
  lineId: string | null;
  /** 聯絡／戶籍地址（不是房子的地址，房子在 owner_property） */
  address: string | null;
  /** 怎麼認識的 */
  source: string;
  /** YYYY-MM-DD，可只填月日的話存 "--MM-DD" 太麻煩，直接整個留空 */
  birthday: string | null;
  /** 逗號分隔的標籤，例：投資客,海線,急售 */
  tags: string[];
  note: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type PropertyRecord = {
  id: string;
  ownerId: string;
  address: string;
  /** 社區／建案名 */
  community: string | null;
  kind: string;
  /** 格局，自由文字（3房2廳2衛） */
  layout: string | null;
  /** 坪數，自由文字（含車位怎麼算他自己寫） */
  area: string | null;
  /** 樓層，自由文字（5F/12F） */
  floor: string | null;
  status: PropertyStatus;
  /** 委託或成交日期 YYYY-MM-DD */
  dealDate: string | null;
  /** 成交價（原本叫「價格」），自由文字（1,180 萬）—— 不做運算、不統計，所以不用數字欄 */
  price: string | null;
  /** 開價／底價，自由文字；2026-10-12 他要的，放在表單地址上方 */
  askingPrice: string | null;
  floorPrice: string | null;
  note: string | null;
  /** 委託合約編號，自由文字 */
  contractNo: string | null;
  /** 委託合約起日／迄日 YYYY-MM-DD */
  contractStart: string | null;
  contractEnd: string | null;
  /** 已經為哪一個迄日推過「到期前 7 天」提醒；迄日改了就重推 */
  contractRemindedFor: string | null;
  /** 一般約／專約，沒選就是 null */
  contractType: ContractType | null;
  /** 下架：原因、成交金額（自行／同業成交才有）、備註、日期；status 同時會是 "delisted" */
  delistReason: DelistReason | null;
  delistAmount: string | null;
  delistNote: string | null;
  delistedAt: string | null;
  createdAt: Date | null;
};

export type ContactLogRecord = {
  id: string;
  ownerId: string;
  /** YYYY-MM-DD */
  contactedAt: string;
  method: string;
  content: string;
  createdAt: Date | null;
};

/** 後台清單用：屋主 + 他的房子 + 聯絡紀錄（兩者都新到舊） */
export type OwnerWithDetails = OwnerRecord & {
  properties: PropertyRecord[];
  contacts: ContactLogRecord[];
  lastContactAt: string | null;
};

export type OwnerInput = {
  name: string;
  phone: string;
  phone2: string;
  lineId: string;
  address: string;
  source: string;
  birthday: string;
  /** 逗號／頓號／空白分隔都可以 */
  tags: string;
  note: string;
};

export type PropertyInput = {
  ownerId: string;
  address: string;
  community: string;
  kind: string;
  layout: string;
  area: string;
  floor: string;
  status: string;
  dealDate: string;
  price: string;
  askingPrice: string;
  floorPrice: string;
  note: string;
  contractNo: string;
  contractStart: string;
  contractEnd: string;
  /** "general" | "exclusive" | "" */
  contractType: string;
};

export type DelistInput = {
  propertyId: string;
  reason: string;
  amount: string;
  note: string;
  /** YYYY-MM-DD */
  delistedAt: string;
};

export type ContactLogInput = {
  ownerId: string;
  contactedAt: string;
  method: string;
  content: string;
};

// ---------------------------------------------------------------- 建表

let ensured = false;

export async function ensureOwnerTables(): Promise<void> {
  if (ensured) return;

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS owner_client (
      id         VARCHAR(36)  NOT NULL,
      name       VARCHAR(80)  NOT NULL,
      phone      VARCHAR(40)  NULL,
      phone2     VARCHAR(40)  NULL,
      line_id    VARCHAR(80)  NULL,
      address    VARCHAR(255) NULL,
      source     VARCHAR(16)  NOT NULL DEFAULT '',
      birthday   CHAR(10)     NULL,
      tags       VARCHAR(255) NULL,
      note       TEXT         NULL,
      created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      KEY idx_owner_client_phone (phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS owner_property (
      id         VARCHAR(36)  NOT NULL,
      owner_id   VARCHAR(36)  NOT NULL,
      address    VARCHAR(255) NOT NULL,
      community  VARCHAR(80)  NULL,
      kind       VARCHAR(16)  NOT NULL DEFAULT '',
      layout     VARCHAR(40)  NULL,
      area       VARCHAR(40)  NULL,
      floor      VARCHAR(40)  NULL,
      status     VARCHAR(16)  NOT NULL DEFAULT 'other',
      deal_date  CHAR(10)     NULL,
      price      VARCHAR(40)  NULL,
      note       TEXT         NULL,
      created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      KEY idx_owner_property_owner (owner_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // created_at 用毫秒：同一位屋主連續補登好幾筆紀錄會落在同一秒，
  // ORDER BY contacted_at DESC, created_at DESC 的先後才排得穩（dev_lead_contact 中過）。
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS owner_contact_log (
      id           VARCHAR(36)  NOT NULL,
      owner_id     VARCHAR(36)  NOT NULL,
      contacted_at CHAR(10)     NOT NULL,
      method       VARCHAR(16)  NOT NULL DEFAULT '',
      content      TEXT         NULL,
      created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      KEY idx_owner_contact_log_owner (owner_id, contacted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 2026-10-12 他要的「合約編號＋起訖日＋到期前 7 天通知」。CREATE TABLE IF NOT EXISTS 不會替既有的表
  // 補欄位，先查再 ALTER（跟 dev_lead_contact.contacted_time 同一招）。
  const cols = await db.$queryRawUnsafe<{ Field: string }[]>(`SHOW COLUMNS FROM owner_property`);
  const have = new Set(cols.map((c) => c.Field));
  if (!have.has("contract_no")) {
    await db.$executeRawUnsafe(`ALTER TABLE owner_property ADD COLUMN contract_no VARCHAR(40) NULL AFTER note`);
  }
  if (!have.has("contract_start")) {
    await db.$executeRawUnsafe(`ALTER TABLE owner_property ADD COLUMN contract_start CHAR(10) NULL AFTER contract_no`);
  }
  if (!have.has("contract_end")) {
    await db.$executeRawUnsafe(`ALTER TABLE owner_property ADD COLUMN contract_end CHAR(10) NULL AFTER contract_start`);
  }
  if (!have.has("asking_price")) {
    await db.$executeRawUnsafe(`ALTER TABLE owner_property ADD COLUMN asking_price VARCHAR(40) NULL AFTER price`);
  }
  if (!have.has("floor_price")) {
    await db.$executeRawUnsafe(`ALTER TABLE owner_property ADD COLUMN floor_price VARCHAR(40) NULL AFTER asking_price`);
  }
  if (!have.has("contract_reminded_for")) {
    await db.$executeRawUnsafe(`ALTER TABLE owner_property ADD COLUMN contract_reminded_for CHAR(10) NULL AFTER contract_end`);
  }
  if (!have.has("contract_type")) {
    await db.$executeRawUnsafe(`ALTER TABLE owner_property ADD COLUMN contract_type VARCHAR(16) NULL AFTER contract_no`);
  }
  if (!have.has("delist_reason")) {
    await db.$executeRawUnsafe(`ALTER TABLE owner_property ADD COLUMN delist_reason VARCHAR(16) NULL`);
  }
  if (!have.has("delist_amount")) {
    await db.$executeRawUnsafe(`ALTER TABLE owner_property ADD COLUMN delist_amount VARCHAR(40) NULL`);
  }
  if (!have.has("delist_note")) {
    await db.$executeRawUnsafe(`ALTER TABLE owner_property ADD COLUMN delist_note VARCHAR(255) NULL`);
  }
  if (!have.has("delisted_at")) {
    await db.$executeRawUnsafe(`ALTER TABLE owner_property ADD COLUMN delisted_at CHAR(10) NULL`);
  }

  ensured = true;
}

// ---------------------------------------------------------------- 工具

// 純文字工具放在沒有 import 的 owners-text.ts，客戶端元件才能用（這支有 Prisma，不能進瀏覽器）
import { cut, parseTags, phoneDigits } from "@/lib/owners-text";
export { cut, parseTags, phoneDigits };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isBlankOrDate(s: string): boolean {
  return s === "" || DATE_RE.test(s);
}

function nn(s: string | null | undefined): string | null {
  const v = (s ?? "").trim();
  return v ? v : null;
}

// ---------------------------------------------------------------- 讀

type OwnerRow = {
  id: string;
  name: string;
  phone: string | null;
  phone2: string | null;
  line_id: string | null;
  address: string | null;
  source: string | null;
  birthday: string | null;
  tags: string | null;
  note: string | null;
  created_at: Date | null;
  updated_at: Date | null;
};

type PropertyRow = {
  id: string;
  owner_id: string;
  address: string;
  community: string | null;
  kind: string | null;
  layout: string | null;
  area: string | null;
  floor: string | null;
  status: string;
  deal_date: string | null;
  price: string | null;
  asking_price: string | null;
  floor_price: string | null;
  note: string | null;
  contract_no: string | null;
  contract_start: string | null;
  contract_end: string | null;
  contract_reminded_for: string | null;
  contract_type: string | null;
  delist_reason: string | null;
  delist_amount: string | null;
  delist_note: string | null;
  delisted_at: string | null;
  created_at: Date | null;
};

type ContactRow = {
  id: string;
  owner_id: string;
  contacted_at: string;
  method: string | null;
  content: string | null;
  created_at: Date | null;
};

function toOwnerRecord(r: OwnerRow): OwnerRecord {
  return {
    id: r.id,
    name: r.name,
    phone: nn(r.phone),
    phone2: nn(r.phone2),
    lineId: nn(r.line_id),
    address: nn(r.address),
    source: r.source ?? "",
    birthday: r.birthday && DATE_RE.test(r.birthday) ? r.birthday : null,
    tags: parseTags(r.tags ?? ""),
    note: nn(r.note),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** 資料庫裡存了不認得的字串（例如手動改過表）就退回 "other"，不要讓整頁掛掉 */
function toPropertyStatus(raw: string): PropertyStatus {
  return (PROPERTY_STATUSES as readonly string[]).includes(raw) ? (raw as PropertyStatus) : "other";
}

function toPropertyRecord(r: PropertyRow): PropertyRecord {
  return {
    id: r.id,
    ownerId: r.owner_id,
    address: r.address,
    community: nn(r.community),
    kind: r.kind ?? "",
    layout: nn(r.layout),
    area: nn(r.area),
    floor: nn(r.floor),
    status: toPropertyStatus(r.status),
    dealDate: r.deal_date && DATE_RE.test(r.deal_date) ? r.deal_date : null,
    price: nn(r.price),
    askingPrice: nn(r.asking_price),
    floorPrice: nn(r.floor_price),
    note: nn(r.note),
    contractNo: nn(r.contract_no),
    contractStart: r.contract_start && DATE_RE.test(r.contract_start) ? r.contract_start : null,
    contractEnd: r.contract_end && DATE_RE.test(r.contract_end) ? r.contract_end : null,
    contractRemindedFor: r.contract_reminded_for || null,
    contractType: (CONTRACT_TYPES as readonly string[]).includes(r.contract_type ?? "") ? (r.contract_type as ContractType) : null,
    delistReason: DELIST_REASONS.some((d) => d.key === r.delist_reason) ? (r.delist_reason as DelistReason) : null,
    delistAmount: nn(r.delist_amount),
    delistNote: nn(r.delist_note),
    delistedAt: r.delisted_at && DATE_RE.test(r.delisted_at) ? r.delisted_at : null,
    createdAt: r.created_at,
  };
}

function toContactRecord(r: ContactRow): ContactLogRecord {
  return {
    id: r.id,
    ownerId: r.owner_id,
    contactedAt: r.contacted_at,
    method: r.method ?? "",
    content: (r.content ?? "").trim(),
    createdAt: r.created_at,
  };
}

/**
 * 後台用：全部屋主 + 全部房子 + 全部聯絡紀錄，在記憶體裡組起來。
 *
 * 一個房仲手上的屋主檔，資料量到不了需要分頁的規模 —— 三個 SELECT 全撈，
 * JS 裡 group 一次，是這個規模下最不容易出錯的做法。手機上的搜尋也因此是純前端、
 * 打字立刻有結果，不用每個字都打一次資料庫。
 */
export async function listOwnersWithDetails(): Promise<OwnerWithDetails[]> {
  await ensureOwnerTables();

  const ownerRows = await db.$queryRawUnsafe<OwnerRow[]>(
    `SELECT id, name, phone, phone2, line_id, address, source, birthday, tags, note, created_at, updated_at
       FROM owner_client ORDER BY updated_at DESC`,
  );
  const propertyRows = await db.$queryRawUnsafe<PropertyRow[]>(
    `SELECT id, owner_id, address, community, kind, layout, area, floor, status, deal_date, price, asking_price, floor_price, note,
            contract_no, contract_start, contract_end, contract_reminded_for, contract_type,
            delist_reason, delist_amount, delist_note, delisted_at, created_at
       FROM owner_property ORDER BY deal_date DESC, created_at DESC`,
  );
  const contactRows = await db.$queryRawUnsafe<ContactRow[]>(
    `SELECT id, owner_id, contacted_at, method, content, created_at
       FROM owner_contact_log ORDER BY contacted_at DESC, created_at DESC`,
  );

  const propsBy = new Map<string, PropertyRecord[]>();
  for (const row of propertyRows) {
    const rec = toPropertyRecord(row);
    const b = propsBy.get(rec.ownerId);
    if (b) b.push(rec);
    else propsBy.set(rec.ownerId, [rec]);
  }
  const contactsBy = new Map<string, ContactLogRecord[]>();
  for (const row of contactRows) {
    const rec = toContactRecord(row);
    const b = contactsBy.get(rec.ownerId);
    if (b) b.push(rec);
    else contactsBy.set(rec.ownerId, [rec]);
  }

  return ownerRows.map((row) => {
    const owner = toOwnerRecord(row);
    const contacts = contactsBy.get(owner.id) ?? [];
    return {
      ...owner,
      properties: propsBy.get(owner.id) ?? [],
      contacts,
      lastContactAt: contacts[0]?.contactedAt ?? null,
    };
  });
}

// ---------------------------------------------------------------- 驗證

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** 存進去的值已經 cut 到欄位長度 —— 超長 MySQL 會默默截斷不報錯，寧可自己切。 */
export function validateOwnerInput(input: OwnerInput): Checked<OwnerInput> {
  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, error: "屋主姓名不能空白" };
  if (name.length > 80) return { ok: false, error: "姓名太長（最多 80 字）" };

  const phone = (input.phone ?? "").trim();
  if (phone.length > 40) return { ok: false, error: "電話太長（最多 40 字）" };
  const phone2 = (input.phone2 ?? "").trim();
  if (phone2.length > 40) return { ok: false, error: "第二電話太長（最多 40 字）" };

  const lineId = (input.lineId ?? "").trim();
  if (lineId.length > 80) return { ok: false, error: "LINE ID 太長（最多 80 字）" };

  const address = (input.address ?? "").trim();
  if (address.length > 255) return { ok: false, error: "聯絡地址太長（最多 255 字）" };

  const source = (input.source ?? "").trim();
  if (source.length > 16) return { ok: false, error: "認識管道太長" };

  const birthday = (input.birthday ?? "").trim();
  if (!isBlankOrDate(birthday)) return { ok: false, error: "生日格式不對（YYYY-MM-DD）" };

  const tags = parseTags(input.tags ?? "").join(",");
  if (tags.length > 255) return { ok: false, error: "標籤太多（總長最多 255 字）" };

  const note = cut((input.note ?? "").trim(), 5000);

  return { ok: true, value: { name: cut(name, 80), phone, phone2, lineId, address, source, birthday, tags, note } };
}

export function validatePropertyInput(input: PropertyInput): Checked<PropertyInput & { status: PropertyStatus }> {
  const ownerId = (input.ownerId ?? "").trim();
  if (!ownerId) return { ok: false, error: "缺少屋主 id" };

  const address = (input.address ?? "").trim();
  if (!address) return { ok: false, error: "房子地址不能空白" };
  if (address.length > 255) return { ok: false, error: "地址太長（最多 255 字）" };

  const community = (input.community ?? "").trim();
  if (community.length > 80) return { ok: false, error: "社區名太長（最多 80 字）" };

  const kind = (input.kind ?? "").trim();
  if (kind.length > 16) return { ok: false, error: "型態太長" };

  const layout = (input.layout ?? "").trim();
  if (layout.length > 40) return { ok: false, error: "格局太長（最多 40 字）" };
  const area = (input.area ?? "").trim();
  if (area.length > 40) return { ok: false, error: "坪數太長（最多 40 字）" };
  const floor = (input.floor ?? "").trim();
  if (floor.length > 40) return { ok: false, error: "樓層太長（最多 40 字）" };

  const status = (input.status ?? "").trim();
  if (!(PROPERTY_STATUSES as readonly string[]).includes(status)) return { ok: false, error: "請選房子的狀態" };

  const dealDate = (input.dealDate ?? "").trim();
  if (!isBlankOrDate(dealDate)) return { ok: false, error: "日期格式不對（YYYY-MM-DD）" };

  const price = (input.price ?? "").trim();
  if (price.length > 40) return { ok: false, error: "成交價太長（最多 40 字）" };
  const askingPrice = (input.askingPrice ?? "").trim();
  if (askingPrice.length > 40) return { ok: false, error: "開價太長（最多 40 字）" };
  const floorPrice = (input.floorPrice ?? "").trim();
  if (floorPrice.length > 40) return { ok: false, error: "底價太長（最多 40 字）" };

  const note = cut((input.note ?? "").trim(), 5000);

  const contractNo = (input.contractNo ?? "").trim();
  if (contractNo.length > 40) return { ok: false, error: "合約編號太長（最多 40 字）" };
  const contractStart = (input.contractStart ?? "").trim();
  if (!isBlankOrDate(contractStart)) return { ok: false, error: "合約起日格式不對（YYYY-MM-DD）" };
  const contractEnd = (input.contractEnd ?? "").trim();
  if (!isBlankOrDate(contractEnd)) return { ok: false, error: "合約迄日格式不對（YYYY-MM-DD）" };
  if (contractStart && contractEnd && contractEnd < contractStart) return { ok: false, error: "合約迄日不能早於起日" };

  const contractType = (input.contractType ?? "").trim();
  if (contractType && !(CONTRACT_TYPES as readonly string[]).includes(contractType)) return { ok: false, error: "合約類型只能選一般約或專約" };

  return {
    ok: true,
    value: {
      ownerId,
      address,
      community,
      kind,
      layout,
      area,
      floor,
      status: status as PropertyStatus,
      dealDate,
      price,
      askingPrice,
      floorPrice,
      note,
      contractNo,
      contractStart,
      contractEnd,
      contractType,
    },
  };
}

export function validateDelistInput(input: DelistInput): Checked<DelistInput & { reason: DelistReason }> {
  const propertyId = (input.propertyId ?? "").trim();
  if (!propertyId) return { ok: false, error: "缺少房子 id" };
  const reason = (input.reason ?? "").trim();
  const def = DELIST_REASONS.find((d) => d.key === reason);
  if (!def) return { ok: false, error: "請選下架原因" };
  const amount = (input.amount ?? "").trim();
  if (def.needsAmount && !amount) return { ok: false, error: `${def.label}請填金額` };
  if (amount.length > 40) return { ok: false, error: "金額太長（最多 40 字）" };
  const note = cut((input.note ?? "").trim(), 255);
  const delistedAt = (input.delistedAt ?? "").trim();
  if (!DATE_RE.test(delistedAt)) return { ok: false, error: "下架日期格式不對" };
  return { ok: true, value: { propertyId, reason: def.key, amount: def.needsAmount ? amount : "", note, delistedAt } };
}

export function validateContactLogInput(input: ContactLogInput): Checked<ContactLogInput> {
  const ownerId = (input.ownerId ?? "").trim();
  if (!ownerId) return { ok: false, error: "缺少屋主 id" };

  const contactedAt = (input.contactedAt ?? "").trim();
  if (!DATE_RE.test(contactedAt)) return { ok: false, error: "請選聯絡日期" };

  const method = (input.method ?? "").trim();
  if (method.length > 16) return { ok: false, error: "聯絡方式太長" };

  const content = cut((input.content ?? "").trim(), 5000);
  if (!content) return { ok: false, error: "聯絡內容不能空白" };

  return { ok: true, value: { ownerId, contactedAt, method, content } };
}

// ---------------------------------------------------------------- 寫

export async function createOwner(input: OwnerInput): Promise<string> {
  await ensureOwnerTables();
  const id = randomUUID();
  await db.$executeRawUnsafe(
    `INSERT INTO owner_client (id, name, phone, phone2, line_id, address, source, birthday, tags, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.name,
    input.phone || null,
    input.phone2 || null,
    input.lineId || null,
    input.address || null,
    input.source || "",
    input.birthday || null,
    input.tags || null,
    input.note || null,
  );
  return id;
}

export async function updateOwner(id: string, input: OwnerInput): Promise<void> {
  await ensureOwnerTables();
  await db.$executeRawUnsafe(
    `UPDATE owner_client
        SET name = ?, phone = ?, phone2 = ?, line_id = ?, address = ?, source = ?, birthday = ?, tags = ?, note = ?
      WHERE id = ?`,
    input.name,
    input.phone || null,
    input.phone2 || null,
    input.lineId || null,
    input.address || null,
    input.source || "",
    input.birthday || null,
    input.tags || null,
    input.note || null,
    id,
  );
}

/**
 * 沒有外鍵約束（這個專案的表一律不用 FK），手動三步刪。
 * 先刪子表再刪屋主，順序反過來的話屋主刪掉後房子與紀錄變成孤兒撈不到、也刪不掉。
 */
export async function deleteOwner(id: string): Promise<void> {
  await ensureOwnerTables();
  await db.$executeRawUnsafe(`DELETE FROM owner_contact_log WHERE owner_id = ?`, id);
  await db.$executeRawUnsafe(`DELETE FROM owner_property WHERE owner_id = ?`, id);
  await db.$executeRawUnsafe(`DELETE FROM owner_client WHERE id = ?`, id);
}

export async function createProperty(input: PropertyInput & { status: PropertyStatus }): Promise<string> {
  await ensureOwnerTables();
  const id = randomUUID();
  await db.$executeRawUnsafe(
    `INSERT INTO owner_property (id, owner_id, address, community, kind, layout, area, floor, status, deal_date, price,
                                asking_price, floor_price, note, contract_no, contract_start, contract_end, contract_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.ownerId,
    input.address,
    input.community || null,
    input.kind || "",
    input.layout || null,
    input.area || null,
    input.floor || null,
    input.status,
    input.dealDate || null,
    input.price || null,
    input.askingPrice || null,
    input.floorPrice || null,
    input.note || null,
    input.contractNo || null,
    input.contractStart || null,
    input.contractEnd || null,
    input.contractType || null,
  );
  // 房子有動，屋主也算有更新（清單是照屋主 updated_at 排的）
  await db.$executeRawUnsafe(`UPDATE owner_client SET updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`, input.ownerId);
  return id;
}

export async function updateProperty(id: string, input: PropertyInput & { status: PropertyStatus }): Promise<void> {
  await ensureOwnerTables();
  await db.$executeRawUnsafe(
    // contract_reminded_for 的那行要排在 contract_end = ? 之前：MySQL 的 SET 由左到右、後面的看得到前面改過的值。
    // 迄日沒變就保留「已提醒」記號，迄日改了就清掉 → 新的到期日會再推一次提醒。
    `UPDATE owner_property
        SET address = ?, community = ?, kind = ?, layout = ?, area = ?, floor = ?, status = ?, deal_date = ?, price = ?,
            asking_price = ?, floor_price = ?, note = ?,
            contract_no = ?, contract_type = ?, contract_start = ?,
            contract_reminded_for = CASE WHEN contract_end <=> ? THEN contract_reminded_for ELSE NULL END,
            contract_end = ?
      WHERE id = ? AND owner_id = ?`,
    input.address,
    input.community || null,
    input.kind || "",
    input.layout || null,
    input.area || null,
    input.floor || null,
    input.status,
    input.dealDate || null,
    input.price || null,
    input.askingPrice || null,
    input.floorPrice || null,
    input.note || null,
    input.contractNo || null,
    input.contractType || null,
    input.contractStart || null,
    input.contractEnd || null,
    input.contractEnd || null,
    id,
    input.ownerId,
  );
}

export async function deleteProperty(id: string): Promise<void> {
  await ensureOwnerTables();
  await db.$executeRawUnsafe(`DELETE FROM owner_property WHERE id = ?`, id);
}

/**
 * 下架：狀態改 "delisted"、記原因／金額／備註／日期。不動開價、底價、合約欄位——
 * 下架後他還會想回頭看當初開多少、簽的是哪張合約。回傳 false 代表找不到那間房。
 */
export async function delistProperty(input: DelistInput & { reason: DelistReason }): Promise<boolean> {
  await ensureOwnerTables();
  const n = await db.$executeRawUnsafe(
    `UPDATE owner_property
        SET status = 'delisted', delist_reason = ?, delist_amount = ?, delist_note = ?, delisted_at = ?
      WHERE id = ?`,
    input.reason,
    input.amount || null,
    input.note || null,
    input.delistedAt,
    input.propertyId,
  );
  if (n > 0) {
    await db.$executeRawUnsafe(
      `UPDATE owner_client SET updated_at = CURRENT_TIMESTAMP(3) WHERE id = (SELECT owner_id FROM owner_property WHERE id = ?)`,
      input.propertyId,
    );
  }
  return n > 0;
}

export async function addContactLog(input: ContactLogInput): Promise<string> {
  await ensureOwnerTables();
  const id = randomUUID();
  await db.$executeRawUnsafe(
    `INSERT INTO owner_contact_log (id, owner_id, contacted_at, method, content) VALUES (?, ?, ?, ?, ?)`,
    id,
    input.ownerId,
    input.contactedAt,
    input.method || "",
    input.content,
  );
  await db.$executeRawUnsafe(`UPDATE owner_client SET updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`, input.ownerId);
  return id;
}

export async function deleteContactLog(id: string): Promise<void> {
  await ensureOwnerTables();
  await db.$executeRawUnsafe(`DELETE FROM owner_contact_log WHERE id = ?`, id);
}

// ---------------------------------------------------------------- 整批匯入

export type ImportRow = {
  owner: OwnerInput;
  /** 這一行有帶房子地址就一起建一筆 owner_property */
  property: { address: string; community: string; status: PropertyStatus } | null;
};

/**
 * 整批建檔。一行一位屋主，順序寫入；中途失敗就停在那一行，回報已經成功幾筆。
 * 不包 transaction：TiDB serverless 上長 transaction 容易撞 timeout，而且這裡每一筆
 * 都是獨立的屋主，前面成功的留著對他沒壞處（重貼會重複，所以回報要講清楚停在哪）。
 */
export async function importOwners(rows: ImportRow[]): Promise<{ done: number; failedAt: number | null; error: string | null }> {
  await ensureOwnerTables();
  let done = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const ownerId = await createOwner(row.owner);
      if (row.property) {
        await createProperty({
          ownerId,
          address: row.property.address,
          community: row.property.community,
          kind: "",
          layout: "",
          area: "",
          floor: "",
          status: row.property.status,
          dealDate: "",
          price: "",
          askingPrice: "",
          floorPrice: "",
          note: "",
          contractNo: "",
          contractStart: "",
          contractEnd: "",
          contractType: "",
        });
      }
      done++;
    } catch (e) {
      return { done, failedAt: i, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return { done, failedAt: null, error: null };
}

// ---------------------------------------------------------------- 合約到期提醒

export type ContractDueRow = {
  propertyId: string;
  ownerId: string;
  ownerName: string;
  ownerPhone: string | null;
  address: string;
  community: string | null;
  contractNo: string | null;
  contractStart: string | null;
  contractEnd: string;
  contractRemindedFor: string | null;
};

/**
 * 迄日落在 [today, today+days] 的房子，連屋主一起撈。
 * 不在 SQL 裡過濾「提醒過沒」—— 呼叫端自己比 contractRemindedFor，dry-run 才看得到全貌。
 */
export async function listContractsDue(today: string, until: string): Promise<ContractDueRow[]> {
  await ensureOwnerTables();
  const rows = await db.$queryRawUnsafe<
    {
      id: string;
      owner_id: string;
      owner_name: string;
      owner_phone: string | null;
      address: string;
      community: string | null;
      contract_no: string | null;
      contract_start: string | null;
      contract_end: string;
      contract_reminded_for: string | null;
    }[]
  >(
    `SELECT p.id, p.owner_id, o.name AS owner_name, o.phone AS owner_phone, p.address, p.community,
            p.contract_no, p.contract_start, p.contract_end, p.contract_reminded_for
       FROM owner_property p
       JOIN owner_client o ON o.id = p.owner_id
      WHERE p.contract_end IS NOT NULL AND p.contract_end >= ? AND p.contract_end <= ?
      ORDER BY p.contract_end ASC, o.name ASC`,
    today,
    until,
  );
  return rows.map((r) => ({
    propertyId: r.id,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    ownerPhone: nn(r.owner_phone),
    address: r.address,
    community: nn(r.community),
    contractNo: nn(r.contract_no),
    contractStart: r.contract_start && DATE_RE.test(r.contract_start) ? r.contract_start : null,
    contractEnd: r.contract_end,
    contractRemindedFor: r.contract_reminded_for || null,
  }));
}

/** 推完才標記，而且標的是「為哪個迄日推的」——迄日之後被改掉，updateProperty 會把它清掉再推 */
export async function markContractReminded(propertyIds: string[]): Promise<void> {
  if (propertyIds.length === 0) return;
  await ensureOwnerTables();
  await db.$executeRawUnsafe(
    `UPDATE owner_property SET contract_reminded_for = contract_end WHERE id IN (${propertyIds.map(() => "?").join(",")})`,
    ...propertyIds,
  );
}
