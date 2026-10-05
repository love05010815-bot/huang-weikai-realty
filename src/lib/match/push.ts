/**
 * 同事的手機通知（Web Push）—— 2026-10-05 他說「同事的客戶預約通知改手機通知，不綁我的官方 line 了」。
 *
 * 為什麼不走官方帳號：推出去的每一則他在官方帳號後台都看得到，他說「會有偷取同事客人的嫌疑」。
 * Web Push 是伺服器直接推到那支手機：內容加密、不經官方帳號、不經本人、不用額度。
 *
 *   VAPID 金鑰              第一次用到時自己產生，存 appointment_config（match_push_vapid）——
 *                           跟快速建檔金鑰同一套做法，不用設環境變數；私鑰跟金鑰一樣是密碼等級。
 *   match_push_subscription 一支手機一筆（endpoint 的 sha256 當唯一鍵）；同一位同事可以好幾支。
 *                           推的時候回 404／410 就是那支手機退訂了，直接刪。
 *
 * iPhone 的規矩：iOS 16.4 起才有，而且要「加到主畫面」、從主畫面的圖示開才拿得到權限（PushSetup.tsx 會講）。
 * 通知的文字在 push-payload.ts（純函式，有測試）。
 */
import { createHash, randomUUID } from "node:crypto";
import webpush from "web-push";
import { OWNER, SITE_URL } from "@/config/owner";
import { db } from "@/lib/db";
import { getConfig, setConfig } from "@/lib/google-calendar";
import type { Colleague } from "./colleagues";
import { colleagueViewingPush, testPush, type ColleaguePush } from "./push-payload";
import { ensureMatchTables } from "./store";

const VAPID_KEY = "match_push_vapid";

type Vapid = { publicKey: string; privateKey: string };
let vapidCache: Vapid | null = null;

/** VAPID 金鑰對：沒有就產生一組存起來（之後所有訂閱都綁這把公鑰，不能再換，換了舊訂閱全失效） */
export async function getVapid(): Promise<Vapid> {
  if (vapidCache) return vapidCache;
  const raw = await getConfig(VAPID_KEY);
  if (raw) {
    try {
      const j = JSON.parse(raw) as Partial<Vapid>;
      if (typeof j.publicKey === "string" && typeof j.privateKey === "string" && j.publicKey && j.privateKey) {
        vapidCache = { publicKey: j.publicKey, privateKey: j.privateKey };
        return vapidCache;
      }
    } catch {
      // 壞掉的設定值當沒有，下面重做一組
    }
  }
  const fresh = webpush.generateVAPIDKeys();
  await setConfig(VAPID_KEY, JSON.stringify(fresh));
  vapidCache = fresh;
  return fresh;
}

/** 給瀏覽器訂閱用的公鑰（base64url） */
export async function getPushPublicKey(): Promise<string> {
  return (await getVapid()).publicKey;
}

export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };

/** 瀏覽器 PushSubscription.toJSON() 送上來的東西，驗過形狀才收 */
export function parseSubscription(input: unknown): PushSubscriptionInput | null {
  if (!input || typeof input !== "object") return null;
  const o = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof o.endpoint === "string" ? o.endpoint.trim() : "";
  const p256dh = typeof o.keys?.p256dh === "string" ? o.keys.p256dh.trim() : "";
  const auth = typeof o.keys?.auth === "string" ? o.keys.auth.trim() : "";
  if (!/^https:\/\/\S{10,1900}$/.test(endpoint)) return null;
  if (!/^[A-Za-z0-9_=-]{20,300}$/.test(p256dh) || !/^[A-Za-z0-9_=-]{8,100}$/.test(auth)) return null;
  return { endpoint, keys: { p256dh, auth } };
}

const hashOf = (endpoint: string): string => createHash("sha256").update(endpoint).digest("hex");

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string };

/** 存這支手機的訂閱；同一支手機（同 endpoint）再送一次就是更新 */
export async function savePushSubscription(colleagueId: string, sub: PushSubscriptionInput, userAgent: string): Promise<void> {
  await ensureMatchTables();
  await db.$executeRawUnsafe(
    `INSERT INTO match_push_subscription (id, colleague_id, endpoint, endpoint_hash, p256dh, auth, ua) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE colleague_id = VALUES(colleague_id), p256dh = VALUES(p256dh), auth = VALUES(auth), ua = VALUES(ua)`,
    randomUUID(),
    colleagueId,
    sub.endpoint,
    hashOf(sub.endpoint),
    sub.keys.p256dh,
    sub.keys.auth,
    String(userAgent ?? "").slice(0, 255),
  );
}

/** 同事在手機上按「關閉通知」；只刪他自己名下的那一筆 */
export async function deletePushSubscription(colleagueId: string, endpoint: string): Promise<void> {
  await ensureMatchTables();
  await db.$executeRawUnsafe(`DELETE FROM match_push_subscription WHERE colleague_id = ? AND endpoint_hash = ?`, colleagueId, hashOf(endpoint));
}

export async function countPushSubscriptions(colleagueId: string): Promise<number> {
  await ensureMatchTables();
  const rows = await db.$queryRawUnsafe<{ n: bigint | number }[]>(`SELECT COUNT(*) AS n FROM match_push_subscription WHERE colleague_id = ?`, colleagueId);
  return Number(rows[0]?.n ?? 0);
}

async function listPushSubscriptions(colleagueId: string): Promise<SubRow[]> {
  await ensureMatchTables();
  return db.$queryRawUnsafe<SubRow[]>(`SELECT id, endpoint, p256dh, auth FROM match_push_subscription WHERE colleague_id = ? ORDER BY created_at ASC LIMIT 20`, colleagueId);
}

export type PushResult = { sent: number; failed: number; removed: number };

/** 推給這位同事的每一支手機。404／410 = 那支退訂了，刪掉；其他錯誤記 log、不丟出去 */
export async function sendPushToColleague(colleagueId: string, payload: ColleaguePush): Promise<PushResult> {
  const subs = await listPushSubscriptions(colleagueId);
  const result: PushResult = { sent: 0, failed: 0, removed: 0 };
  if (!subs.length) return result;
  const vapid = await getVapid();
  const vapidDetails = { subject: `mailto:${OWNER.email}`, publicKey: vapid.publicKey, privateKey: vapid.privateKey };
  const body = JSON.stringify(payload);
  // 循序：連線池只有 3 條，而且一位同事頂多幾支手機
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { vapidDetails, TTL: 24 * 3600, urgency: "high" });
      result.sent++;
      await db.$executeRawUnsafe(`UPDATE match_push_subscription SET last_ok_at = NOW() WHERE id = ?`, s.id);
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        await db.$executeRawUnsafe(`DELETE FROM match_push_subscription WHERE id = ?`, s.id);
        result.removed++;
      } else {
        result.failed++;
        console.error(`[match/push] 推給同事 ${colleagueId} 失敗（${status ?? "?"}）:`, e instanceof Error ? e.message : e);
      }
    }
  }
  return result;
}

/** 點通知要開的頁面：同事自己的建檔頁、直接落在「預約」 */
export const colleagueViewingsUrl = (c: Pick<Colleague, "intakeKey">): string => `${SITE_URL}/intake?key=${encodeURIComponent(c.intakeKey)}&v=viewings`;

/** 預約成立 → 推到同事手機（/api/match/viewing 叫的） */
export async function notifyColleagueNewViewing(
  colleague: Pick<Colleague, "id" | "intakeKey">,
  viewing: { code: string; name: string; preferredAt: string },
  listings: { title: string }[],
): Promise<PushResult> {
  return sendPushToColleague(colleague.id, colleagueViewingPush(viewing, listings, colleagueViewingsUrl(colleague)));
}

/** 同事按「傳一則測試通知」 */
export async function sendTestPush(colleague: Pick<Colleague, "id" | "intakeKey">): Promise<PushResult> {
  return sendPushToColleague(colleague.id, testPush(colleagueViewingsUrl(colleague)));
}
