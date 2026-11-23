/**
 * 🏆 成交紀錄 —— 資料層
 *
 * 一張表 `deal_record`，一筆＝一件成交。跟這個專案其他表一樣：raw SQL、
 * CREATE TABLE IF NOT EXISTS、不進 prisma/schema.prisma、不用 migration。
 *
 * 欄位照他原本的 Excel（2026-11-23 他貼的那張表）：成交日期／成交方式／合作業務／
 * 物件編號／物件地址／社區／成交金額／服務費總額／服務費％數／分得點數／達成業績，
 * 加上買方、賣方各一組（姓名／電話／生日／身分證字號／住址）與備註。
 *
 * ## 金額是數字欄、單位「萬」
 *
 * 屋主建檔的價格是自由文字（不做運算）。這裡相反——整個工具的重點就是每月每年加總，
 * 所以存 DOUBLE、單位萬，讀出來一律經 roundTo 收掉浮點尾巴。
 *
 * ## 🔴 個資只在資料庫
 *
 * repo 是公開的（learning_public_repo_no_pii）。買賣雙方姓名、電話、身分證字號、門牌
 * 一個字都不准進檔案、不准進 commit；測試資料全用編的，測完只刪自己建的 id。
 *
 * ## 日期存 CHAR(10)
 *
 * 跟 owner_property 同一個理由：DATE 讀回來變 JS Date 再過一次時區會默默差一天。
 *
 * ⚠️ 連線池只有 3 條（見 lib/db.ts）。查詢一律循序，不要 Promise.all。
 */
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { DEAL_METHODS, type DealMethod } from "@/config/deals";
import { calcFeePct, calcPerf, parseNum, roundTo } from "@/lib/deals-text";
import { cut } from "@/lib/owners-text";

// ---------------------------------------------------------------- 型別

export type DealParty = {
  name: string | null;
  phone: string | null;
  /** YYYY-MM-DD */
  birthday: string | null;
  idNo: string | null;
  address: string | null;
};

export type DealRecord = {
  id: string;
  /** YYYY-MM-DD */
  dealDate: string;
  method: DealMethod;
  /** 合作業務 */
  partner: string | null;
  objectNo: string | null;
  address: string | null;
  community: string | null;
  /** 以下金額單位：萬 */
  priceWan: number | null;
  feeWan: number | null;
  feePct: number | null;
  points: number | null;
  perfWan: number | null;
  buyer: DealParty;
  seller: DealParty;
  note: string | null;
  createdAt: Date | null;
};

export type DealPartyInput = { name: string; phone: string; birthday: string; idNo: string; address: string };

/** 畫面送進來的東西：全部是他打的字串，數字在這裡才解析 */
export type DealInput = {
  dealDate: string;
  method: string;
  partner: string;
  objectNo: string;
  address: string;
  community: string;
  priceWan: string;
  feeWan: string;
  /** 空白＝自動算（服務費 ÷ 成交金額） */
  feePct: string;
  points: string;
  /** 空白＝自動算（服務費 × 點數 ÷ 10） */
  perfWan: string;
  buyer: DealPartyInput;
  seller: DealPartyInput;
  note: string;
};

type CleanDeal = Omit<DealRecord, "id" | "createdAt">;

// ---------------------------------------------------------------- 建表

let ensured = false;

export async function ensureDealTable(): Promise<void> {
  if (ensured) return;
  // created_at 用毫秒：同一天補登好幾筆時 ORDER BY deal_date DESC, created_at DESC 才排得穩
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS deal_record (
      id              VARCHAR(36)  NOT NULL,
      deal_date       CHAR(10)     NOT NULL,
      method          VARCHAR(16)  NOT NULL DEFAULT 'dev',
      partner         VARCHAR(80)  NULL,
      object_no       VARCHAR(40)  NULL,
      address         VARCHAR(255) NULL,
      community       VARCHAR(80)  NULL,
      price_wan       DOUBLE       NULL,
      fee_wan         DOUBLE       NULL,
      fee_pct         DOUBLE       NULL,
      points          DOUBLE       NULL,
      perf_wan        DOUBLE       NULL,
      buyer_name      VARCHAR(80)  NULL,
      buyer_phone     VARCHAR(40)  NULL,
      buyer_birthday  CHAR(10)     NULL,
      buyer_id_no     VARCHAR(20)  NULL,
      buyer_address   VARCHAR(255) NULL,
      seller_name     VARCHAR(80)  NULL,
      seller_phone    VARCHAR(40)  NULL,
      seller_birthday CHAR(10)     NULL,
      seller_id_no    VARCHAR(20)  NULL,
      seller_address  VARCHAR(255) NULL,
      note            TEXT         NULL,
      created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      KEY idx_deal_record_date (deal_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  ensured = true;
}

// ---------------------------------------------------------------- 驗證

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function nn(s: string | null | undefined, max: number): string | null {
  const v = cut((s ?? "").trim(), max);
  return v ? v : null;
}

function cleanParty(p: DealPartyInput | undefined, who: string): { ok: true; value: DealParty } | { ok: false; error: string } {
  const birthday = (p?.birthday ?? "").trim();
  if (birthday && !DATE_RE.test(birthday)) return { ok: false, error: `${who}生日格式不對` };
  return {
    ok: true,
    value: {
      name: nn(p?.name, 80),
      phone: nn(p?.phone, 40),
      birthday: birthday || null,
      idNo: nn(p?.idNo?.toUpperCase(), 20),
      address: nn(p?.address, 255),
    },
  };
}

export function validateDealInput(input: DealInput): { ok: true; value: CleanDeal } | { ok: false; error: string } {
  const dealDate = (input.dealDate ?? "").trim();
  if (!DATE_RE.test(dealDate)) return { ok: false, error: "請填成交日期（例：115/11/2）" };
  if (!(DEAL_METHODS as readonly string[]).includes(input.method)) return { ok: false, error: "請選成交方式" };

  const nums: Record<string, number | null> = {};
  for (const [key, label, max] of [
    // 上限 100 億：把 1288 萬打成元（12880000）一定會超過，當場擋下來
    ["priceWan", "成交金額", 1_000_000],
    ["feeWan", "服務費總額", 1_000_000],
    ["feePct", "服務費％數", 100],
    ["points", "分得點數", 100],
    ["perfWan", "達成業績", 1_000_000],
  ] as const) {
    const n = parseNum(input[key]);
    if (n !== null && Number.isNaN(n)) return { ok: false, error: `${label}只能填數字` };
    if (n !== null && n > max) return { ok: false, error: `${label}數字太大，確認一下單位是不是「萬」` };
    nums[key] = n;
  }
  if (nums.priceWan == null || !(nums.priceWan > 0)) return { ok: false, error: "請填成交金額（單位：萬）" };

  const address = nn(input.address, 255);
  const community = nn(input.community, 80);
  if (!address && !community) return { ok: false, error: "物件地址或社區至少填一個" };

  const buyer = cleanParty(input.buyer, "買方");
  if (!buyer.ok) return buyer;
  const seller = cleanParty(input.seller, "賣方");
  if (!seller.ok) return seller;

  return {
    ok: true,
    value: {
      dealDate,
      method: input.method as DealMethod,
      partner: nn(input.partner, 80),
      objectNo: nn(input.objectNo, 40),
      address,
      community,
      priceWan: nums.priceWan,
      feeWan: nums.feeWan,
      // 沒填就自動算；填了就照他填的（他的表上 ％ 數有時是談好的整數、不是除出來的）
      feePct: nums.feePct ?? calcFeePct(nums.priceWan, nums.feeWan),
      points: nums.points,
      perfWan: nums.perfWan ?? calcPerf(nums.feeWan, nums.points),
      buyer: buyer.value,
      seller: seller.value,
      note: nn(input.note, 2000),
    },
  };
}

// ---------------------------------------------------------------- 讀

type DealRow = {
  id: string;
  deal_date: string;
  method: string;
  partner: string | null;
  object_no: string | null;
  address: string | null;
  community: string | null;
  price_wan: number | null;
  fee_wan: number | null;
  fee_pct: number | null;
  points: number | null;
  perf_wan: number | null;
  buyer_name: string | null;
  buyer_phone: string | null;
  buyer_birthday: string | null;
  buyer_id_no: string | null;
  buyer_address: string | null;
  seller_name: string | null;
  seller_phone: string | null;
  seller_birthday: string | null;
  seller_id_no: string | null;
  seller_address: string | null;
  note: string | null;
  created_at: Date | null;
};

const num = (v: unknown): number | null => (v == null ? null : roundTo(Number(v), 4));
const txt = (v: string | null): string | null => (v && v.trim() ? v.trim() : null);
const day = (v: string | null): string | null => (v && DATE_RE.test(v) ? v : null);

function toRecord(r: DealRow): DealRecord {
  return {
    id: r.id,
    dealDate: r.deal_date,
    // 資料庫裡存了不認得的字串就退回「開發」，不要讓整頁掛掉
    method: (DEAL_METHODS as readonly string[]).includes(r.method) ? (r.method as DealMethod) : "dev",
    partner: txt(r.partner),
    objectNo: txt(r.object_no),
    address: txt(r.address),
    community: txt(r.community),
    priceWan: num(r.price_wan),
    feeWan: num(r.fee_wan),
    feePct: num(r.fee_pct),
    points: num(r.points),
    perfWan: num(r.perf_wan),
    buyer: { name: txt(r.buyer_name), phone: txt(r.buyer_phone), birthday: day(r.buyer_birthday), idNo: txt(r.buyer_id_no), address: txt(r.buyer_address) },
    seller: { name: txt(r.seller_name), phone: txt(r.seller_phone), birthday: day(r.seller_birthday), idNo: txt(r.seller_id_no), address: txt(r.seller_address) },
    note: txt(r.note),
    createdAt: r.created_at,
  };
}

/** 全部成交，新到舊。一個人的成交量（一年幾十件）不需要分頁，搜尋與統計都在前端算。 */
export async function listDeals(): Promise<DealRecord[]> {
  await ensureDealTable();
  const rows = await db.$queryRawUnsafe<DealRow[]>(
    `SELECT id, deal_date, method, partner, object_no, address, community,
            price_wan, fee_wan, fee_pct, points, perf_wan,
            buyer_name, buyer_phone, buyer_birthday, buyer_id_no, buyer_address,
            seller_name, seller_phone, seller_birthday, seller_id_no, seller_address,
            note, created_at
       FROM deal_record ORDER BY deal_date DESC, created_at DESC`,
  );
  return rows.map(toRecord);
}

// ---------------------------------------------------------------- 寫

export async function createDeal(v: CleanDeal): Promise<string> {
  await ensureDealTable();
  const id = randomUUID();
  await db.$executeRaw`
    INSERT INTO deal_record (
      id, deal_date, method, partner, object_no, address, community,
      price_wan, fee_wan, fee_pct, points, perf_wan,
      buyer_name, buyer_phone, buyer_birthday, buyer_id_no, buyer_address,
      seller_name, seller_phone, seller_birthday, seller_id_no, seller_address, note
    ) VALUES (
      ${id}, ${v.dealDate}, ${v.method}, ${v.partner}, ${v.objectNo}, ${v.address}, ${v.community},
      ${v.priceWan}, ${v.feeWan}, ${v.feePct}, ${v.points}, ${v.perfWan},
      ${v.buyer.name}, ${v.buyer.phone}, ${v.buyer.birthday}, ${v.buyer.idNo}, ${v.buyer.address},
      ${v.seller.name}, ${v.seller.phone}, ${v.seller.birthday}, ${v.seller.idNo}, ${v.seller.address}, ${v.note}
    )`;
  return id;
}

/** 回傳有沒有改到（false＝這筆已經不在了） */
export async function updateDeal(id: string, v: CleanDeal): Promise<boolean> {
  await ensureDealTable();
  const found = await db.$queryRaw<{ id: string }[]>`SELECT id FROM deal_record WHERE id = ${id}`;
  if (found.length === 0) return false;
  await db.$executeRaw`
    UPDATE deal_record SET
      deal_date = ${v.dealDate}, method = ${v.method}, partner = ${v.partner}, object_no = ${v.objectNo},
      address = ${v.address}, community = ${v.community},
      price_wan = ${v.priceWan}, fee_wan = ${v.feeWan}, fee_pct = ${v.feePct}, points = ${v.points}, perf_wan = ${v.perfWan},
      buyer_name = ${v.buyer.name}, buyer_phone = ${v.buyer.phone}, buyer_birthday = ${v.buyer.birthday},
      buyer_id_no = ${v.buyer.idNo}, buyer_address = ${v.buyer.address},
      seller_name = ${v.seller.name}, seller_phone = ${v.seller.phone}, seller_birthday = ${v.seller.birthday},
      seller_id_no = ${v.seller.idNo}, seller_address = ${v.seller.address},
      note = ${v.note}
    WHERE id = ${id}`;
  return true;
}

/** 只刪這一筆 id（learning_destructive_db_cleanup：不准整表刪） */
export async function deleteDeal(id: string): Promise<void> {
  await ensureDealTable();
  await db.$executeRaw`DELETE FROM deal_record WHERE id = ${id}`;
}
