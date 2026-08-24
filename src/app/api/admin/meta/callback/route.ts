/**
 * GET /api/admin/meta/callback —— Meta 授權回呼
 *
 * 🚨 admin ＋ state 兩道都過才換 token。
 *    換完導回 /admin/inbox?meta=bound|fail，失敗原因帶在網址上 ——
 *    不然綁失敗你只會看到一個沒反應的畫面，不知道卡在哪一步。
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { exchangeMetaCode } from "@/lib/meta";
import { META_OAUTH_STATE_COOKIE } from "../auth/route";

export const dynamic = "force-dynamic";

function stateMatches(received: string | null, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function redirectAndClear(back: URL): NextResponse {
  const response = NextResponse.redirect(back);
  response.cookies.set(META_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/admin/meta/callback",
    maxAge: 0,
  });
  return response;
}

export async function GET(req: NextRequest) {
  const back = new URL("/admin/inbox", req.url);

  if (!(await isCurrentUserAdmin())) {
    return redirectAndClear(new URL("/admin", req.url));
  }

  const err = req.nextUrl.searchParams.get("error_description")
    || req.nextUrl.searchParams.get("error");
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  if (!stateMatches(state, req.cookies.get(META_OAUTH_STATE_COOKIE)?.value)) {
    back.searchParams.set("meta", "state_invalid");
    return redirectAndClear(back);
  }

  if (err || !code) {
    back.searchParams.set("meta", "fail");
    if (err) back.searchParams.set("why", err.slice(0, 160));
    return redirectAndClear(back);
  }

  const result = await exchangeMetaCode(code);
  back.searchParams.set("meta", result.ok ? "bound" : "fail");
  if (!result.ok && result.error) back.searchParams.set("why", result.error.slice(0, 200));
  return redirectAndClear(back);
}
