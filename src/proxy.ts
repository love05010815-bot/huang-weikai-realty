/**
 * 📱 從 LINE／FB／IG 的內建瀏覽器開後台 → 先導去「請用瀏覽器開啟」說明頁
 *
 * 為什麼：後台登入走 Google OAuth，Google **拒絕在 App 內建瀏覽器（WebView）裡登入**，
 * 回 403 `disallowed_useragent`。他從 LINE 點後台連結就會卡在那一頁，看起來像「連結壞了」。
 *
 * 做法：只看 /admin/* 與 NextAuth 的登入頁，UA 是內建瀏覽器**且**還沒有登入 cookie 時，
 * rewrite（不是 redirect，網址不變）到 /open-in-browser 說明頁；那頁有一顆按鈕帶
 * `?openExternalBrowser=1`（LINE 看到這個參數會改用手機的 Safari／Chrome 開）。
 * 已經有 session cookie 的照常放行 —— 不要擋到「曾經登入成功」的人。
 *
 * Next 16 的檔名慣例是 proxy.ts（舊名 middleware.ts）。只匹配下面 matcher 列的路徑，
 * 前台完全不經過這裡。
 */
import { NextResponse, type NextRequest } from "next/server";

/** LINE／Facebook／Messenger／Instagram／微信 的內建瀏覽器 UA 特徵 */
const IN_APP_BROWSER_RE = /\bLine\/|FBAN|FBAV|FB_IAB|Instagram|MicroMessenger/i;

/** Auth.js v5 的 session cookie 名稱（https 上帶 __Secure- 前綴） */
const SESSION_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"];

export function proxy(req: NextRequest) {
  const ua = req.headers.get("user-agent") || "";
  if (!IN_APP_BROWSER_RE.test(ua)) return NextResponse.next();
  if (SESSION_COOKIES.some((name) => req.cookies.has(name))) return NextResponse.next();

  // 登入頁被導進來時，真正要去的地方在 callbackUrl；沒有就回後台首頁
  const { pathname, searchParams } = req.nextUrl;
  let to = pathname;
  if (pathname.startsWith("/api/auth/")) {
    const cb = searchParams.get("callbackUrl") || "/admin";
    to = cb.startsWith("/") ? cb : "/admin";
  }

  const url = req.nextUrl.clone();
  url.pathname = "/open-in-browser";
  url.search = `?to=${encodeURIComponent(to)}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/admin/:path*", "/api/auth/signin"],
};
