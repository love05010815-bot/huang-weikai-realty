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
 * 停用的同事：金鑰立刻失效；他的客人點舊的專屬連結會退回官方帳號那條路（至少找得到人）。
 * LINE 通知（2026-10-05 他問「這份預約可以回彈到同事的 line 裡面嗎」）：LINE 推不到個人帳號，只能走官方帳號 ——
 * 同事用自己的 LINE 加官方帳號、傳「綁定 六碼」（bind_code），webhook 把他的 userId 記進 line_user_id，
 * 之後他客人的預約就 push 到他那裡（計費一則）。客人還是完全不碰官方帳號。
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
  /** 同事自己的 LINE userId（加官方帳號、傳「綁定 六碼」之後才有）；null = 還沒綁，新預約不會推給他 */
  lineUserId: string | null;
  /** 綁定碼：同事在官方帳號傳「綁定 XXXXXX」用的六碼 */
  bindCode: string;
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
  line_user_id: string | null;
  bind_code: string | null;
  active: number;
  created_at: Date | null;
  updated_at: Date | null;
};

const COLS = "id, name, phone, line_url, intake_key, line_user_id, bind_code, active, created_at, updated_at";

function toColleague(r: Row): Colleague {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone ?? "",
    lineUrl: r.line_url ?? "",
    intakeKey: r.intake_key,
    lineUserId: r.line_user_id ?? null,
    bindCode: r.bind_code ?? "",
    active: Number(r.active) !== 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** 24 bytes → 32 個 base64url 字元（跟本人的金鑰同一種做法） */
export const newColleagueKey = (): string => randomBytes(24).toString("base64url");

/** 綁定碼：六碼，避開 0/O、1/I 這種手機上看不清的字 */
const BIND_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newBindCode(): string {
  const bytes = randomBytes(6);
  let s = "";
  for (const b of bytes) s += BIND_ALPHABET[b % BIND_ALPHABET.length];
  return s;
}

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
    `INSERT INTO match_colleague (id, name, phone, line_url, intake_key, bind_code, active) VALUES (?, ?, ?, ?, ?, ?, 1)`,
    id,
    input.name,
    input.phone,
    input.lineUrl,
    newColleagueKey(),
    newBindCode(),
  );
  return (await getColleague(id))!;
}

export async function updateColleague(
  id: string,
  patch: { name?: string; phone?: string; lineUrl?: string; active?: boolean; lineUserId?: string | null },
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
  if (patch.lineUserId !== undefined) {
    sets.push("line_user_id = ?");
    values.push(patch.lineUserId);
  }
  if (sets.length) {
    values.push(id);
    await db.$executeRawUnsafe(`UPDATE match_colleague SET ${sets.join(", ")} WHERE id = ?`, ...values);
  }
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

/** 名下還有客人的不刪 —— 刪了他的客人會變成沒人的（既不是本人的、也找不到同事），名單上就消失了 */
export async function deleteColleague(id: string): Promise<{ ok: boolean; reason?: string }> {
  const n = await countBuyersOfColleague(id);
  if (n > 0) return { ok: false, reason: `名下還有 ${n} 位客人，先把客人刪掉，或改成「停用」就好` };
  await db.$executeRawUnsafe(`DELETE FROM match_colleague WHERE id = ?`, id);
  return { ok: true };
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

// ---------------------------------------------------------------- LINE 通知的綁定

/** 用綁定碼找同事（大小寫不分）；沒有這一碼就 null */
export async function getColleagueByBindCode(code: string): Promise<Colleague | null> {
  const c = String(code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(c)) return null;
  await ensureMatchTables();
  const rows = await db.$queryRawUnsafe<Row[]>(`SELECT ${COLS} FROM match_colleague WHERE UPPER(bind_code) = ? LIMIT 1`, c);
  return rows[0] ? toColleague(rows[0]) : null;
}

/** 這支 LINE 是哪位同事綁的（webhook 用：同事傳的訊息不該走買方流程） */
export async function getColleagueByLine(lineUserId: string): Promise<Colleague | null> {
  if (!lineUserId) return null;
  await ensureMatchTables();
  const rows = await db.$queryRawUnsafe<Row[]>(`SELECT ${COLS} FROM match_colleague WHERE line_user_id = ? LIMIT 1`, lineUserId);
  return rows[0] ? toColleague(rows[0]) : null;
}

/** 把這支 LINE 綁給這位同事；同一支 LINE 只能綁一位（之前綁在別人身上的清掉） */
export async function bindColleagueLine(id: string, lineUserId: string): Promise<Colleague | null> {
  await ensureMatchTables();
  await db.$executeRawUnsafe(`UPDATE match_colleague SET line_user_id = NULL WHERE line_user_id = ? AND id <> ?`, lineUserId, id);
  await db.$executeRawUnsafe(`UPDATE match_colleague SET line_user_id = ? WHERE id = ?`, lineUserId, id);
  return getColleague(id);
}
