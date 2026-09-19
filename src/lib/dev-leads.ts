/**
 * 🎯 開發物件追蹤 —— 資料層
 *
 * 兩張表，跟這個專案其他表一樣：raw SQL、CREATE TABLE IF NOT EXISTS、
 * 不進 prisma/schema.prisma，不需要 migration。
 *
 *   dev_lead          一筆＝一個地址／591／樂屋案件，屋主還沒簽給你
 *   dev_lead_contact  一筆＝去談過一次，掛在某個 dev_lead 底下
 *
 * ## 物件的「目前狀態」不是存出來的，是算出來的
 *
 * 故意**不**在 dev_lead 存一個 status 欄位。物件現在的狀態＝它底下最新一筆
 * 追蹤紀錄的 result_status，還沒有任何紀錄就是「待開發」。
 *
 * 如果兩個地方各存一份狀態（lead.status 跟 contact.result_status），
 * 只要有一條更新路徑忘記同步兩邊，畫面就會靜靜地顯示錯的狀態 ——
 * 這個專案已經吃過好幾次「兩份資料兜不起來」的虧（見 [[learning_silent_failure_pattern]]）。
 * 单一事實來源比多存一份「查詢快一點」更重要，這裡的資料量（一個房仲手動輸入的
 * 開發物件）也還輪不到需要為了效能去反正規化。
 *
 * ## 日期存 CHAR(10) 不是 DATE
 *
 * 跟 site_visit_daily.day、site_video.published_at 同一個理由：DATE 欄位讀回來會變成
 * JS `Date`，中間再過一次時區換算，會有默默差一天的風險。存成 "2026-08-25" 字串，
 * 進去什麼樣出來就什麼樣。
 *
 * ⚠️ 連線池只有 3 條（見 lib/db.ts）。這裡的查詢一律循序，不要 Promise.all。
 */
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { CONTACT_RESULT_OPTIONS, type LeadStatus } from "@/config/dev-leads";

// ---------------------------------------------------------------- 型別

export type ContactRecord = {
  id: string;
  leadId: string;
  /** YYYY-MM-DD */
  contactedAt: string;
  /** HH:MM，沒填就是 null —— 純顯示用，不用來排序或算日期 */
  contactedTime: string | null;
  method: string;
  feedback: string;
  resultStatus: LeadStatus;
  /** YYYY-MM-DD，沒排下次就是 null */
  nextFollowUpAt: string | null;
  createdAt: Date | null;
};

export type LeadRecord = {
  id: string;
  address: string;
  source: string;
  sourceUrl: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  note: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

/** 後台清單用：物件本身 + 它的追蹤紀錄 + 算出來的目前狀態 */
export type LeadWithContacts = LeadRecord & {
  /** 新到舊 */
  contacts: ContactRecord[];
  status: LeadStatus;
  lastContactAt: string | null;
  nextFollowUpAt: string | null;
};

export type LeadInput = {
  address: string;
  source: string;
  sourceUrl: string;
  ownerName: string;
  ownerPhone: string;
  note: string;
};

export type ContactInput = {
  leadId: string;
  contactedAt: string;
  /** HH:MM，可留空 */
  contactedTime: string;
  method: string;
  feedback: string;
  resultStatus: string;
  nextFollowUpAt: string;
};

// ---------------------------------------------------------------- 建表

let ensured = false;

export async function ensureDevLeadTables(): Promise<void> {
  if (ensured) return;

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS dev_lead (
      id          VARCHAR(36)  NOT NULL,
      address     VARCHAR(255) NOT NULL,
      source      VARCHAR(16)  NOT NULL DEFAULT '',
      source_url  VARCHAR(500) NULL,
      owner_name  VARCHAR(80)  NULL,
      owner_phone VARCHAR(40)  NULL,
      note        TEXT         NULL,
      created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS dev_lead_contact (
      id                VARCHAR(36)  NOT NULL,
      lead_id           VARCHAR(36)  NOT NULL,
      contacted_at      CHAR(10)     NOT NULL,
      method            VARCHAR(16)  NOT NULL DEFAULT '',
      feedback          TEXT         NULL,
      result_status     VARCHAR(16)  NOT NULL DEFAULT 'contacted',
      next_follow_up_at CHAR(10)     NULL,
      created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      KEY idx_dev_lead_contact_lead (lead_id, contacted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 2026-09-19 補的：CREATE TABLE IF NOT EXISTS 不會替既有的表補欄位，先查再 ALTER。
  // CHAR(5) 存 "16:00"，跟 contacted_at 用 CHAR 不用 DATE/TIME 同一個理由 —— 純顯示用的文字，
  // 不需要、也不該被當成可運算的時間值（沒有時區含義，只是「幾點去的」這個標籤）。
  const hasTime = await db.$queryRawUnsafe<unknown[]>(`SHOW COLUMNS FROM dev_lead_contact LIKE 'contacted_time'`);
  if (hasTime.length === 0) {
    await db.$executeRawUnsafe(`ALTER TABLE dev_lead_contact ADD COLUMN contacted_time CHAR(5) NULL AFTER contacted_at`);
  }

  /*
   * 同一天連續加兩筆紀錄（例如補登過去幾筆歷史接洽）時，`ORDER BY contacted_at DESC,
   * created_at DESC` 靠 created_at 分先後 —— 秒級精度撞在一起就會排序不穩，
   * 「目前狀態＝最新一筆」就可能算成上一筆。自己拿真資料庫測快速「已簽約」按鈕時
   * 真的中過一次（兩筆同一秒寫入，排序翻面）。
   * 補到毫秒：MODIFY COLUMN 對已經是 DATETIME(3) 的表是無害的 no-op，不用先查再改。
   */
  await db.$executeRawUnsafe(
    `ALTER TABLE dev_lead_contact MODIFY COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`,
  );

  ensured = true;
}

// ---------------------------------------------------------------- 讀

type LeadRow = {
  id: string;
  address: string;
  source: string | null;
  source_url: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  note: string | null;
  created_at: Date | null;
  updated_at: Date | null;
};

type ContactRow = {
  id: string;
  lead_id: string;
  contacted_at: string;
  contacted_time: string | null;
  method: string | null;
  feedback: string | null;
  result_status: string;
  next_follow_up_at: string | null;
  created_at: Date | null;
};

function toLeadRecord(r: LeadRow): LeadRecord {
  return {
    id: r.id,
    address: r.address,
    source: r.source ?? "",
    sourceUrl: r.source_url?.trim() ? r.source_url.trim() : null,
    ownerName: r.owner_name?.trim() ? r.owner_name.trim() : null,
    ownerPhone: r.owner_phone?.trim() ? r.owner_phone.trim() : null,
    note: r.note?.trim() ? r.note.trim() : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** 資料庫裡存了不認得的字串（例如手動改過表）就退回 "contacted"，不要讓整頁掛掉 */
function toResultStatus(raw: string): LeadStatus {
  return (CONTACT_RESULT_OPTIONS as string[]).includes(raw) ? (raw as LeadStatus) : "contacted";
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function toContactRecord(r: ContactRow): ContactRecord {
  return {
    id: r.id,
    leadId: r.lead_id,
    contactedAt: r.contacted_at,
    contactedTime: r.contacted_time && TIME_RE.test(r.contacted_time) ? r.contacted_time : null,
    method: r.method ?? "",
    feedback: r.feedback?.trim() ? r.feedback.trim() : "",
    resultStatus: toResultStatus(r.result_status),
    nextFollowUpAt: r.next_follow_up_at || null,
    createdAt: r.created_at,
  };
}

/**
 * 後台用：全部物件 + 全部追蹤紀錄，在記憶體裡組起來。
 *
 * 一個房仲手動輸入的開發物件，資料量遠遠到不了需要分頁或用 SQL window
 * function 找「每筆物件最新一筆紀錄」的規模 —— 兩個 SELECT 全撈起來，
 * 在 JS 裡 group 一次，是這個規模下最不容易出錯的做法。
 */
export async function listLeadsWithContacts(): Promise<LeadWithContacts[]> {
  await ensureDevLeadTables();

  const leadRows = await db.$queryRawUnsafe<LeadRow[]>(
    `SELECT id, address, source, source_url, owner_name, owner_phone, note, created_at, updated_at
       FROM dev_lead ORDER BY created_at DESC`,
  );
  const contactRows = await db.$queryRawUnsafe<ContactRow[]>(
    `SELECT id, lead_id, contacted_at, contacted_time, method, feedback, result_status, next_follow_up_at, created_at
       FROM dev_lead_contact ORDER BY contacted_at DESC, created_at DESC`,
  );

  const byLead = new Map<string, ContactRecord[]>();
  for (const row of contactRows) {
    const rec = toContactRecord(row);
    const bucket = byLead.get(rec.leadId);
    if (bucket) bucket.push(rec);
    else byLead.set(rec.leadId, [rec]);
  }

  return leadRows.map((row) => {
    const lead = toLeadRecord(row);
    const contacts = byLead.get(lead.id) ?? [];
    const latest = contacts[0] ?? null;
    return {
      ...lead,
      contacts,
      status: latest?.resultStatus ?? "new",
      lastContactAt: latest?.contactedAt ?? null,
      nextFollowUpAt: latest?.nextFollowUpAt ?? null,
    };
  });
}

// ---------------------------------------------------------------- 驗證

function isBlankOrDate(s: string): boolean {
  return s === "" || /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function validateLeadInput(input: LeadInput): { ok: true; value: LeadInput } | { ok: false; error: string } {
  const address = input.address?.trim() ?? "";
  if (!address) return { ok: false, error: "地址不能空白" };
  if (address.length > 255) return { ok: false, error: "地址太長（最多 255 字）" };

  const source = (input.source ?? "").trim();
  if (source.length > 16) return { ok: false, error: "來源太長" };

  const sourceUrl = (input.sourceUrl ?? "").trim();
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) {
    return { ok: false, error: "來源連結要以 http:// 或 https:// 開頭" };
  }
  if (sourceUrl.length > 500) return { ok: false, error: "來源連結太長（最多 500 字）" };

  const ownerName = (input.ownerName ?? "").trim();
  if (ownerName.length > 80) return { ok: false, error: "屋主姓名太長（最多 80 字）" };

  const ownerPhone = (input.ownerPhone ?? "").trim();
  if (ownerPhone.length > 40) return { ok: false, error: "屋主電話太長（最多 40 字）" };

  const note = (input.note ?? "").trim();
  if (note.length > 2000) return { ok: false, error: "物件描述太長（最多 2000 字）" };

  return { ok: true, value: { address, source, sourceUrl, ownerName, ownerPhone, note } };
}

export function validateContactInput(
  input: ContactInput,
): { ok: true; value: ContactInput & { resultStatus: LeadStatus } } | { ok: false; error: string } {
  const leadId = input.leadId?.trim() ?? "";
  if (!leadId) return { ok: false, error: "缺少物件 id" };

  const contactedAt = (input.contactedAt ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(contactedAt)) return { ok: false, error: "請選這次接洽的日期" };

  const contactedTime = (input.contactedTime ?? "").trim();
  if (contactedTime && !TIME_RE.test(contactedTime)) return { ok: false, error: "接洽時間格式不對" };

  const method = (input.method ?? "").trim();
  if (method.length > 16) return { ok: false, error: "接洽方式太長" };

  const feedback = (input.feedback ?? "").trim();
  if (feedback.length > 2000) return { ok: false, error: "屋主回饋太長（最多 2000 字）" };

  const resultStatus = (input.resultStatus ?? "").trim();
  if (!(CONTACT_RESULT_OPTIONS as string[]).includes(resultStatus)) {
    return { ok: false, error: "請選這次接洽的結果" };
  }

  const nextFollowUpAt = (input.nextFollowUpAt ?? "").trim();
  if (!isBlankOrDate(nextFollowUpAt)) return { ok: false, error: "下次追蹤日期格式不對" };

  return {
    ok: true,
    value: { leadId, contactedAt, contactedTime, method, feedback, resultStatus: resultStatus as LeadStatus, nextFollowUpAt },
  };
}

// ---------------------------------------------------------------- 寫

export async function createLead(input: LeadInput): Promise<string> {
  await ensureDevLeadTables();
  const id = randomUUID();
  await db.$executeRawUnsafe(
    `INSERT INTO dev_lead (id, address, source, source_url, owner_name, owner_phone, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.address,
    input.source || "",
    input.sourceUrl || null,
    input.ownerName || null,
    input.ownerPhone || null,
    input.note || null,
  );
  return id;
}

export async function updateLead(id: string, input: LeadInput): Promise<void> {
  await ensureDevLeadTables();
  await db.$executeRawUnsafe(
    `UPDATE dev_lead SET address = ?, source = ?, source_url = ?, owner_name = ?, owner_phone = ?, note = ?
      WHERE id = ?`,
    input.address,
    input.source || "",
    input.sourceUrl || null,
    input.ownerName || null,
    input.ownerPhone || null,
    input.note || null,
    id,
  );
}

/**
 * 沒有外鍵約束（這個專案的表一律不用 FK），手動兩步刪。
 * 先刪紀錄再刪物件，順序反過來的話，物件刪掉後紀錄會變成孤兒撈不到、也刪不掉。
 */
export async function deleteLead(id: string): Promise<void> {
  await ensureDevLeadTables();
  await db.$executeRawUnsafe(`DELETE FROM dev_lead_contact WHERE lead_id = ?`, id);
  await db.$executeRawUnsafe(`DELETE FROM dev_lead WHERE id = ?`, id);
}

export async function addContact(input: ContactInput & { resultStatus: LeadStatus }): Promise<string> {
  await ensureDevLeadTables();
  const id = randomUUID();
  await db.$executeRawUnsafe(
    `INSERT INTO dev_lead_contact (id, lead_id, contacted_at, contacted_time, method, feedback, result_status, next_follow_up_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.leadId,
    input.contactedAt,
    input.contactedTime || null,
    input.method || "",
    input.feedback || null,
    input.resultStatus,
    input.nextFollowUpAt || null,
  );
  return id;
}

export async function deleteContact(id: string): Promise<void> {
  await ensureDevLeadTables();
  await db.$executeRawUnsafe(`DELETE FROM dev_lead_contact WHERE id = ?`, id);
}
