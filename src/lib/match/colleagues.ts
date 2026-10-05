/**
 * 同事（2026-10-05 他要的：「未來要提供給同事使用」）—— 名單各管各的、物件池共用、客人只碰同事自己的 LINE。
 *
 *   match_colleague            同事本人：名字、電話、LINE 連結、他的快速建檔金鑰、啟用中否
 *   match_buyer.colleague_id   這位客人是誰的：NULL = 本人（黃瑋凱）的，其餘 = 同事的 id
 *
 * 規矩（他 2026-10-05 拍板）：
 *   - 誰都看不到誰的客人：同事的連結只列自己的；本人的連結與後台只列本人的（colleague_id IS NULL）。
 *   - 同事的客人**不碰官方帳號**：配對頁、預約完成頁顯示同事的名字／電話／LINE，新預約不通知本人。
 *   - 同事沒有後台；本人在自己的 /intake 多一頁「同事」管理（新增、停用、重新產生連結、刪除）。
 * 停用（離職，2026-10-05 他說「如果該名同事離職，則不可以再使用這條連結」）：offboardColleague —— active = 0 **而且金鑰換掉**
 * （之後就算誤按「重新啟用」，舊連結也打不開）、手機通知訂閱清掉。他的客人點舊的專屬連結會退回官方帳號那條路（至少找得到人）。
 * 🔴 **離職同事的客人不轉給本人**（他 2026-10-05 說「不要有接手他的客人的按鈕，離職同事可帶走她的客戶名單」）：
 * 客人留在她名下、誰都看不到；她離職前在自己的「客戶名單」按「匯出名單」帶走。之後本人要清掉就「刪除」她 —— 連她的客人、預約一起刪（deleteColleague）。
 * 新預約通知（2026-10-05 他拍板）：**走手機通知（Web Push，lib/match/push.ts），不綁本人的官方 LINE** ——
 * 走官方帳號的話每一則本人在後台都看得到，他說「會有偷取同事客人的嫌疑」。
 * 純函式（LINE 連結整理、建檔網址）在 colleague-link.ts，測試吃那邊。
 */
import { randomBytes, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { ColleagueContact } from "./colleague-link";
import { ensureMatchTables } from "./store";

export type { ColleagueContact } from "./colleague-link";

export type Colleague = {
  id: string;
  name: string;
  phone: string;
  lineUrl: string;
  /** 他的快速建檔金鑰（連結本身就是鑰匙，跟本人的同一種） */
  intakeKey: string;
  active: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type Row = {
  id: string;
  name: string;
  phone: string | null;
  line_url: string | null;
  intake_key: string;
  active: number;
  created_at: Date | null;
  updated_at: Date | null;
};

const COLS = "id, name, phone, line_url, intake_key, active, created_at, updated_at";

function toColleague(r: Row): Colleague {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone ?? "",
    lineUrl: r.line_url ?? "",
    intakeKey: r.intake_key,
    active: Number(r.active) !== 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** 24 bytes → 32 個 base64url 字元（跟本人的金鑰同一種做法） */
export const newColleagueKey = (): string => randomBytes(24).toString("base64url");

/** 給客人看的那一面：只有名字、電話、LINE 連結，金鑰絕對不能跟著出去 */
export function colleagueContact(c: Colleague): ColleagueContact {
  return { name: c.name, phone: c.phone, lineUrl: c.lineUrl };
}

export async function listColleagues(): Promise<Colleague[]> {
  await ensureMatchTables();
  const rows = await db.$queryRawUnsafe<Row[]>(`SELECT ${COLS} FROM match_colleague ORDER BY created_at ASC`);
  return rows.map(toColleague);
}

export async function getColleague(id: string): Promise<Colleague | null> {
  await ensureMatchTables();
  const rows = await db.$queryRawUnsafe<Row[]>(`SELECT ${COLS} FROM match_colleague WHERE id = ? LIMIT 1`, id);
  return rows[0] ? toColleague(rows[0]) : null;
}

/** 用金鑰找人（停用的也回，啟不啟用由呼叫端看 active） */
export async function getColleagueByKey(key: string): Promise<Colleague | null> {
  if (!key || key.length < 20 || key.length > 80) return null;
  await ensureMatchTables();
  const rows = await db.$queryRawUnsafe<Row[]>(`SELECT ${COLS} FROM match_colleague WHERE intake_key = ? LIMIT 1`, key);
  return rows[0] ? toColleague(rows[0]) : null;
}

export async function createColleague(input: { name: string; phone: string; lineUrl: string }): Promise<Colleague> {
  await ensureMatchTables();
  const id = randomUUID();
  await db.$executeRawUnsafe(
    `INSERT INTO match_colleague (id, name, phone, line_url, intake_key, active) VALUES (?, ?, ?, ?, ?, 1)`,
    id,
    input.name,
    input.phone,
    input.lineUrl,
    newColleagueKey(),
  );
  return (await getColleague(id))!;
}

export async function updateColleague(
  id: string,
  patch: { name?: string; phone?: string; lineUrl?: string; active?: boolean },
): Promise<Colleague | null> {
  await ensureMatchTables();
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    values.push(patch.name);
  }
  if (patch.phone !== undefined) {
    sets.push("phone = ?");
    values.push(patch.phone);
  }
  if (patch.lineUrl !== undefined) {
    sets.push("line_url = ?");
    values.push(patch.lineUrl);
  }
  if (patch.active !== undefined) {
    sets.push("active = ?");
    values.push(patch.active ? 1 : 0);
  }
  if (sets.length) {
    values.push(id);
    await db.$executeRawUnsafe(`UPDATE match_colleague SET ${sets.join(", ")} WHERE id = ?`, ...values);
  }
  return getColleague(id);
}

/**
 * 停用（離職）：連結作廢、金鑰換掉、手機通知訂閱清掉。之後「重新啟用」會拿到一條新連結。
 * 他的客人還掛在他名下（名單各管各的，不自動轉）；本人要接手就按「接手他的客人」（transferBuyersToOwner）。
 */
export async function offboardColleague(id: string): Promise<Colleague | null> {
  await ensureMatchTables();
  await db.$executeRawUnsafe(`UPDATE match_colleague SET active = 0, intake_key = ? WHERE id = ?`, newColleagueKey(), id);
  await db.$executeRawUnsafe(`DELETE FROM match_push_subscription WHERE colleague_id = ?`, id);
  return getColleague(id);
}

/** 重新產生他的連結 —— 舊連結立刻失效（他手機桌面那個要重新加） */
export async function rotateColleagueKey(id: string): Promise<Colleague | null> {
  await ensureMatchTables();
  await db.$executeRawUnsafe(`UPDATE match_colleague SET intake_key = ? WHERE id = ?`, newColleagueKey(), id);
  return getColleague(id);
}

export async function countBuyersOfColleague(id: string): Promise<number> {
  await ensureMatchTables();
  const rows = await db.$queryRawUnsafe<{ n: bigint | number }[]>(`SELECT COUNT(*) AS n FROM match_buyer WHERE colleague_id = ?`, id);
  return Number(rows[0]?.n ?? 0);
}

/**
 * 刪同事。在職而且名下有客人的不給刪（先「停用（離職）」）。
 * 停用的（離職了、名單她已經帶走）就整個清：她的客人、那些客人的預約、她手機的通知訂閱，最後是她本人。
 * 不轉給本人、也不留下沒主人的客人 —— 沒主人的客人誰都看不到，預約卻會在本人的清單冒出來。
 */
export async function deleteColleague(id: string): Promise<{ ok: boolean; reason?: string; buyers?: number; viewings?: number }> {
  const c = await getColleague(id);
  if (!c) return { ok: false, reason: "找不到這位同事" };
  const buyers = await countBuyersOfColleague(id);
  if (c.active && buyers > 0) return { ok: false, reason: `名下還有 ${buyers} 位客人，先按「停用（離職）」再刪` };
  const vrows = await db.$queryRawUnsafe<{ n: bigint | number }[]>(
    `SELECT COUNT(*) AS n FROM match_viewing WHERE buyer_id IN (SELECT id FROM match_buyer WHERE colleague_id = ?)`,
    id,
  );
  const viewings = Number(vrows[0]?.n ?? 0);
  await db.$executeRawUnsafe(`DELETE FROM match_viewing WHERE buyer_id IN (SELECT id FROM match_buyer WHERE colleague_id = ?)`, id);
  await db.$executeRawUnsafe(`DELETE FROM match_buyer WHERE colleague_id = ?`, id);
  // 手機通知訂閱也清（直接下 SQL，不從 push.ts import —— 那邊 import 這裡，別繞成圈）
  await db.$executeRawUnsafe(`DELETE FROM match_push_subscription WHERE colleague_id = ?`, id);
  await db.$executeRawUnsafe(`DELETE FROM match_colleague WHERE id = ?`, id);
  return { ok: true, buyers, viewings };
}

/**
 * 這位客人歸誰 → 給客人看的聯絡方式。
 * 本人的（null）回 null = 走原本的官方帳號那條路；同事停用了也回 null（客人至少找得到人）。
 */
export async function contactForOwner(colleagueId: string | null): Promise<ColleagueContact | null> {
  if (!colleagueId) return null;
  const c = await getColleague(colleagueId);
  return c && c.active ? colleagueContact(c) : null;
}
