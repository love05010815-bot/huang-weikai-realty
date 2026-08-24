/**
 * GET /api/admin/youtube/auth —— 點「綁定 YouTube」→ 導去 Google 授權同意頁
 *
 * 🚨 只有 admin 進得來。
 *
 * ⚠️ 這是跟日曆**分開**的一套授權（不同 redirect URI、不同 refresh token）。
 *    在這裡授權失敗，日曆完全不受影響。
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { getYoutubeAuthUrl, isYoutubeConfigured } from "@/lib/youtube";

export const dynamic = "force-dynamic";

/** 刻意跟日曆的 cookie 名稱不同，兩套授權同時進行也不會互相蓋掉 */
export const YOUTUBE_OAUTH_STATE_COOKIE = "admin_youtube_oauth_state";

export async function GET() {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isYoutubeConfigured()) {
    return NextResponse.json(
      { error: "Google OAuth client 未設定（需 GOOGLE_CALENDAR_CLIENT_ID/SECRET 或 AUTH_GOOGLE_*）" },
      { status: 500 },
    );
  }

  const state = randomUUID().replace(/-/g, "");
  const response = NextResponse.redirect(getYoutubeAuthUrl(state));
  response.cookies.set(YOUTUBE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/admin/youtube/callback",
    maxAge: 10 * 60,
  });
  return response;
}
