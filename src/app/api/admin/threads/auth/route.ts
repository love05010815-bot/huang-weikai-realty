/**
 * GET /api/admin/threads/auth —— 點「綁定 Threads」→ 導去脆的授權頁
 *
 * 🚨 只有 admin 進得來（未登入回 403，不會把陌生人導去 Meta 的同意頁）。
 *
 * ⚠️ Threads 的授權頁在 threads.net，不是 facebook.com —— 授權時要用**那個脆帳號**登入，
 *    不是用管理粉專的那個 FB 帳號。登錯的話會綁到別的脆，畫面上只會看到帳號名不對。
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { getThreadsAuthUrl, isThreadsConfigured } from "@/lib/threads";

export const dynamic = "force-dynamic";

export const THREADS_OAUTH_STATE_COOKIE = "admin_threads_oauth_state";

export async function GET() {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isThreadsConfigured()) {
    return NextResponse.json(
      { error: "Threads App 未設定（需環境變數 THREADS_APP_ID 與 THREADS_APP_SECRET）" },
      { status: 500 },
    );
  }

  const state = randomUUID().replace(/-/g, "");
  const response = NextResponse.redirect(getThreadsAuthUrl(state));
  response.cookies.set(THREADS_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/admin/threads/callback",
    maxAge: 10 * 60,
  });
  return response;
}
