/**
 * GET /api/appointment/google/callback — Google 授權回呼,用 code 換 refresh token 存 DB
 * 🚨 只 admin(同瀏覽器 session)。換完導回 /admin/appointments?google=bound|fail|state_invalid
 *
 * 🔴 **2026-08-27:失敗時一律附上 `why=`,不要再只丟一句「請確認 OAuth 設定」。**
 *    這支的每一條失敗路徑本來都長得一模一樣,線上綁不起來時完全分不出是 Google 拒絕、
 *    state 對不上、還是換 token 被打回票,而 Vercel 撈不到 console 輸出(實測)。
 *    `why` 只放代碼(`google_access_denied`／`token_400_invalid_grant` 之類),
 *    **不放 code、token、body 原文**,而且這頁本來就只有 admin 進得來。
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { exchangeCodeForToken } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";
const OAUTH_STATE_COOKIE = "appointment_google_oauth_state";

function stateMatches(received: string | null, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 要放進網址列的診斷代碼,濾成安全字元。Google 的 error 是它自己定義的字串,不能照抄。 */
function safeCode(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 40) || "unknown";
}

function redirectAndClear(back: URL): NextResponse {
  const response = NextResponse.redirect(back);
  response.cookies.set(OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/appointment/google/callback",
    maxAge: 0,
  });
  return response;
}

function fail(back: URL, why: string): NextResponse {
  back.searchParams.set("google", "fail");
  back.searchParams.set("why", why);
  return redirectAndClear(back);
}

export async function GET(req: NextRequest) {
  const back = new URL("/admin/appointments", req.url);
  if (!(await isCurrentUserAdmin())) {
    return redirectAndClear(new URL("/admin", req.url));
  }
  const err = req.nextUrl.searchParams.get("error");
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!stateMatches(state, req.cookies.get(OAUTH_STATE_COOKIE)?.value)) {
    back.searchParams.set("google", "state_invalid");
    return redirectAndClear(back);
  }
  // Google 自己拒絕(access_denied 之類)—— 這種情況根本沒有 code,跟「換 token 失敗」是兩回事
  if (err) return fail(back, `google_${safeCode(err)}`);
  if (!code) return fail(back, "no_code");

  const r = await exchangeCodeForToken(code);
  if (!r.ok) return fail(back, r.reason);
  back.searchParams.set("google", "bound");
  return redirectAndClear(back);
}
