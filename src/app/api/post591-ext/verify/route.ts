/**
 * 🔑 同事版外掛的授權碼驗證（2026-09-11 起）
 *
 *   POST /api/post591-ext/verify   body: { key, installId, version }
 *   → { ok: true, name, expiresAt, expiresText, bound } 或 { ok: false, reason }
 *
 * 誰打：Chrome 外掛的背景程式（tools/post591-extension/license.js），開外掛頁、按上架、填表前各驗一次，
 * ok 的結果外掛端會快取 6 小時。不用登入 —— 授權碼本身就是憑證（60 bits 隨機，猜不到）。
 *
 * ⚠️ CORS 一定要開：外掛頁面的來源是 chrome-extension://…，沒有 Access-Control-Allow-Origin 瀏覽器會直接擋掉回應，
 *    外掛看起來就像「連不上伺服器」。這支只回授權狀態，開 * 沒有洩漏什麼。
 * ⚠️ 回 4xx/5xx 的情況（格式錯、限流、資料庫掛）外掛都當「暫時驗不到」：三天內驗過 ok 就先放行，
 *    所以資料庫短暫掛掉不會讓所有同事同時不能用；真正的「不行」（no_key／revoked／expired／bound_elsewhere）一律 200。
 */
import { NextRequest, NextResponse } from "next/server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { verifyLicense } from "@/lib/ext-license";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store" } });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  // 一個 IP 一分鐘 30 次：同一間店同一條網路好幾個同事一起用也夠；拿腳本猜授權碼的不夠
  if (!rateLimit(`ext-license:${getClientIp(req)}`, 30, 60_000).allowed) return json({ ok: false, reason: "rate_limited" }, 429);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  const key = String(body.key ?? "").slice(0, 40);
  const installId = String(body.installId ?? "").slice(0, 64);
  const version = String(body.version ?? "").slice(0, 16);
  if (!key || !installId) return json({ ok: false, reason: "bad_request" }, 400);

  try {
    return json(await verifyLicense({ key, installId, version }));
  } catch (error) {
    console.error("[post591-ext/verify] 驗證失敗:", error);
    return json({ ok: false, reason: "server_error" }, 503);
  }
}
