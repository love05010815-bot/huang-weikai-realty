/**
 * 同事版「FB 社團廣告助手」打後台 API 的門：授權碼代替 Google 登入。
 *
 * 外掛頁的來源是 chrome-extension://…，所以 ① CORS 一定要開（不開瀏覽器直接擋掉回應，外掛看起來像「連不上」）；
 * ② 不用登入，授權碼本身就是憑證（跟 /api/post591-ext/verify 同一套 verifyLicense，同一張 ext_license 表、
 *    同一個後台 /admin/post591/keys 發碼 —— FB 的同事另發一批、名稱標「FB」就分得開）。
 * ③ 每次呼叫都驗（不快取）：驗一次是一筆 DB 查詢，這條線一次帶入是 1＋最多 10 張圖＝11 次，量很小；
 *    後台停用／到期立刻生效比省那幾次查詢重要。
 *
 * 🔴 這裡只負責「能不能叫」，資料本身的檢查（網域只准 houseol）在 lib/fb-ad-import.ts。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyLicense } from "@/lib/ext-license";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const FB_EXT_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

export function fbExtJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { ...FB_EXT_CORS, "Cache-Control": "no-store" } });
}

export function fbExtOptions(): NextResponse {
  return new NextResponse(null, { status: 204, headers: FB_EXT_CORS });
}

/** 同事看得懂的一句話（跟外掛 license.js 的 MESSAGES 對齊） */
const REASON_TEXT: Record<string, string> = {
  no_key: "授權碼不對（多打或少打了字？），跟黃瑋凱核對一下。",
  revoked: "這組授權碼已被停用，請找黃瑋凱。",
  expired: "授權已到期，請找黃瑋凱延長。",
  seat_limit: "這組授權碼能用的電腦數已達上限，跟黃瑋凱說一聲。",
  bound_elsewhere: "這組授權碼已綁在另一台電腦的 Chrome，跟黃瑋凱說一聲。",
  bad_request: "驗證資料不完整，到 chrome://extensions 按 ↻ 重新載入外掛再試。",
  rate_limited: "太頻繁了，等一分鐘再試。",
};

export type FbExtAuthResult = { ok: true; body: Record<string, unknown> } | { ok: false; res: NextResponse };

/**
 * 讀 body、限流、驗授權碼。不 ok 一律回 200 ＋ { ok:false, reason, error }（外掛頁直接顯示 error），
 * 只有格式錯／限流才 4xx。
 */
export async function fbExtAuth(req: NextRequest, bucket: string, perMinute: number): Promise<FbExtAuthResult> {
  if (!rateLimit(`${bucket}:${getClientIp(req)}`, perMinute, 60_000).allowed) {
    return { ok: false, res: fbExtJson({ ok: false, reason: "rate_limited", error: REASON_TEXT.rate_limited }, 429) };
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, res: fbExtJson({ ok: false, reason: "bad_request", error: REASON_TEXT.bad_request }, 400) };
  }
  const key = String(body.key ?? "").slice(0, 40);
  const installId = String(body.installId ?? "").slice(0, 64);
  const version = String(body.version ?? "").slice(0, 16);
  if (!key || !installId) return { ok: false, res: fbExtJson({ ok: false, reason: "bad_request", error: REASON_TEXT.bad_request }, 400) };

  try {
    const v = await verifyLicense({ key, installId, version });
    if (!v.ok) return { ok: false, res: fbExtJson({ ok: false, reason: v.reason, error: REASON_TEXT[v.reason] || `授權驗證失敗（${v.reason}），請找黃瑋凱。` }) };
  } catch (error) {
    console.error("[fb-ext] 授權驗證失敗:", error);
    return { ok: false, res: fbExtJson({ ok: false, reason: "server_error", error: "驗證伺服器暫時有問題，等幾分鐘再試。" }, 503) };
  }
  return { ok: true, body };
}
