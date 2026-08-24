/**
 * GET /api/admin/meta/auth —— 點「綁定 Facebook／Instagram」→ 導去 Meta 授權頁
 *
 * 🚨 只有 admin 進得來（未登入回 403，不會把陌生人導去 Meta 的同意頁）。
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { getMetaAuthUrl, isMetaConfigured } from "@/lib/meta";

export const dynamic = "force-dynamic";

export const META_OAUTH_STATE_COOKIE = "admin_meta_oauth_state";

export async function GET() {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isMetaConfigured()) {
    return NextResponse.json(
      { error: "Meta App 未設定（需環境變數 META_APP_ID 與 META_APP_SECRET）" },
      { status: 500 },
    );
  }

  const state = randomUUID().replace(/-/g, "");
  const response = NextResponse.redirect(getMetaAuthUrl(state));
  response.cookies.set(META_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/admin/meta/callback",
    maxAge: 10 * 60,
  });
  return response;
}
