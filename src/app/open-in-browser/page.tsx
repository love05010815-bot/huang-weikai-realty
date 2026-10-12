/**
 * /open-in-browser —— 「請用手機瀏覽器開啟」說明頁
 *
 * 只會被 src/proxy.ts rewrite 進來（從 LINE／FB／IG 內建瀏覽器開後台），
 * 直接打這個網址也只是看到同一頁說明，沒有任何資料。
 *
 * `?to=` 只接受站內 /admin 開頭的路徑，其他一律回 /admin —— 不做 open redirect。
 */
import type { Metadata } from "next";
import { CIS } from "@/app/admin/_components/cis";
import { headers } from "next/headers";
import OpenInBrowserActions from "./OpenInBrowserActions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "請用瀏覽器開啟",
  robots: { index: false, follow: false },
};

function safeAdminPath(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || !v.startsWith("/admin") || v.startsWith("//") || /[\s<>"]/.test(v)) return "/admin";
  return v;
}

export default async function OpenInBrowserPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const to = safeAdminPath(sp.to);
  // 用這次請求的 host 組完整網址（正式站是 weikaihouse.com，舊網址進來就維持舊網址），不另外讀設定
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "weikaihouse.com";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const base = `${proto}://${host}`;
  const fullUrl = `${base}${to}`;
  // LINE 看到這個參數會改用手機的 Safari／Chrome 開；其他 App 會忽略它，無害
  const externalUrl = `${fullUrl}${to.includes("?") ? "&" : "?"}openExternalBrowser=1`;

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: CIS.bg,
        color: CIS.text,
        fontFamily: CIS.font,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: "100%",
          background: CIS.card,
          border: `1px solid ${CIS.cardBorder}`,
          borderRadius: CIS.radius,
          padding: 24,
        }}
      >
        <div style={{ fontSize: 30, marginBottom: 10 }}>📱</div>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 10px" }}>請改用手機的瀏覽器開啟</h1>
        <p style={{ fontSize: 14.5, lineHeight: 1.8, color: CIS.textSub, margin: "0 0 18px" }}>
          你現在是在 LINE／Facebook 這類 App 裡面的內建瀏覽器。
          後台要用 Google 帳號登入，而 Google 不允許在 App 內建瀏覽器裡登入，所以會卡住。
          用 Safari 或 Chrome 開同一個網址就正常了。
        </p>

        <OpenInBrowserActions externalUrl={externalUrl} fullUrl={fullUrl} />

        <ol style={{ fontSize: 13.5, lineHeight: 1.8, color: CIS.textMute, margin: "18px 0 0", paddingLeft: 20 }}>
          <li>
            <b style={{ color: CIS.textSub }}>LINE：</b>按上面的按鈕就會自動跳到瀏覽器。
          </li>
          <li>
            <b style={{ color: CIS.textSub }}>Facebook／Instagram：</b>按右上角「⋯」→「在瀏覽器中開啟」，或複製網址貼到 Safari／Chrome。
          </li>
          <li>
            <b style={{ color: CIS.textSub }}>以後更方便：</b>在 Safari／Chrome 開好後，用「分享」→「加入主畫面」，桌面就有一個後台圖示。
          </li>
        </ol>
      </div>
    </main>
  );
}
