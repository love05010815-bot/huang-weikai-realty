/**
 * GET /api/admin/youtube/callback —— Google 授權回呼，用 code 換 refresh token 存 DB
 *
 * 🚨 只有 admin（同一個瀏覽器 session）＋ state 必須對得上，兩道都過才換 token。
 *    換完導回 /admin/inbox?yt=bound|fail|state_invalid，並把失敗原因帶在網址上，
 *    否則綁失敗你只會看到一個沒反應的畫面，不知道是哪一步出問題。
 *
 * ⚠️ Google Cloud Console 的該 OAuth client 要先把這支網址加進
 *    「已授權的重新導向 URI」，否則 Google 會在同意頁之前就擋下來（redirect_uri_mismatch）。
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { exchangeYoutubeCode } from "@/lib/youtube";
import { YOUTUBE_OAUTH_STATE_COOKIE } from "../auth/route";

export const dynamic = "force-dynamic";

function stateMatches(received: string | null, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function redirectAndClear(back: URL): NextResponse {
  const response = NextResponse.redirect(back);
  response.cookies.set(YOUTUBE_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/admin/youtube/callback",
    maxAge: 0,
  });
  return response;
}

export async function GET(req: NextRequest) {
  const back = new URL("/admin/inbox", req.url);

  if (!(await isCurrentUserAdmin())) {
    return redirectAndClear(new URL("/admin", req.url));
  }

  const err = req.nextUrl.searchParams.get("error");
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  if (!stateMatches(state, req.cookies.get(YOUTUBE_OAUTH_STATE_COOKIE)?.value)) {
    back.searchParams.set("yt", "state_invalid");
    return redirectAndClear(back);
  }

  if (err || !code) {
    back.searchParams.set("yt", "fail");
    // Google 自己給的原因（access_denied 之類）帶回去，不要吞掉
    if (err) back.searchParams.set("why", err.slice(0, 80));
    return redirectAndClear(back);
  }

  const result = await exchangeYoutubeCode(code);
  back.searchParams.set("yt", result.ok ? "bound" : "fail");
  if (!result.ok && result.error) back.searchParams.set("why", result.error.slice(0, 160));
  return redirectAndClear(back);
}
