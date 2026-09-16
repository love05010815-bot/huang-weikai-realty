/**
 * 買方識別碼 —— 讓「從 LINE 點進配對頁的人」對得回同一筆 match_buyer
 *
 * 為什麼需要：買方的編號原本只記在手機瀏覽器的 localStorage，換手機、換瀏覽器、
 * 或清掉瀏覽資料就變成另一個人 —— 條件改了卻改在一筆沒綁 LINE 的新資料上，
 * 推播還是照舊條件跑。所以從 LINE 發出去的每個連結都帶一個識別碼。
 *
 * 做法跟 lib/appointment-token.ts 同一套：HMAC 簽章，不進資料庫、不用另開表。
 * 內容只有買方編號與到期時間 —— **絕對不要把 LINE userId 放進網址**。
 *
 * 這個檔刻意不 import 任何 `@/` 的東西，scripts/check-match.mjs 才能直接測。
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** 連結有效天數。買方可能過幾週才想起來要改條件，給寬一點；過期就當沒帶，走原本的流程。 */
const DEFAULT_TTL_DAYS = 60;

const BUYER_ID_RE = /^[0-9a-fA-F-]{36}$/;

function secret(): string | null {
  const configured =
    process.env.APPOINTMENT_TOKEN_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    "";
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? null : "dev-only-insecure-secret";
}

function sign(payload: string, signingSecret: string): string {
  return createHmac("sha256", signingSecret).update(payload).digest("base64url");
}

/**
 * 簽一個買方識別碼。沒有密鑰時回 null（正式環境沒設 APPOINTMENT_TOKEN_SECRET 才會發生）——
 * 刻意不丟例外：卡片少帶識別碼還能用，整張卡發不出去才是大事。
 */
export function createBuyerToken(buyerId: string, ttlDays = DEFAULT_TTL_DAYS): string | null {
  if (!BUYER_ID_RE.test(buyerId)) return null;
  const signingSecret = secret();
  if (!signingSecret) return null;
  const exp = Math.floor(Date.now() / 1000) + ttlDays * 86400;
  const payload = `${buyerId}.${exp}`;
  return `${payload}.${sign(payload, signingSecret)}`;
}

/** 驗識別碼，通過回買方編號，其餘一律 null（過期、被改過、格式不對、沒密鑰）。 */
export function verifyBuyerToken(token: string | null | undefined): string | null {
  if (!token || typeof token !== "string" || token.length > 300) return null;
  const signingSecret = secret();
  if (!signingSecret) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [buyerId, expPart, sig] = parts;
  if (!BUYER_ID_RE.test(buyerId)) return null;

  const exp = Number(expPart);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;

  const expected = sign(`${buyerId}.${expPart}`, signingSecret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return buyerId;
}
