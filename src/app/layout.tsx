import type { Metadata } from "next";
import VisitCounter from "./_visits/VisitCounter";
import ListingClickTracker from "./_visits/ListingClickTracker";

export const metadata: Metadata = {
  title: "黃瑋凱｜台中海線房仲・線上預約",
  description: "台中海線房仲黃瑋凱。買賣租賃、資金配置規劃、稅費諮詢、市場分析、裝潢資源媒合，線上預約諮詢。",
  /**
   * Google Search Console 的「HTML 標記」驗證碼。
   *
   * 值放在 Vercel 環境變數 `GOOGLE_SITE_VERIFICATION`（只填 content="" 裡那一串，
   * 不要整段 <meta> 貼進去）。沒設就不會輸出這個標籤，不影響任何功能。
   *
   * ⚠️ 首頁是 build 時靜態產生的，設完環境變數要「重新部署」才會出現。
   */
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  },
  /**
   * 瀏覽器分頁的小圖示（favicon）＋ iPhone「加入主畫面」的圖示 —— 2026-10-19 第一包補的，
   * 之前 /favicon.ico 是 404、分頁上是瀏覽器預設的空白圖。
   *
   *   favicon.ico     凱心成家建築標記（public/kaixing-mark.png）縮成 16／32／48 三張裝在同一個 ICO 裡
   *   favicon-96.png  同一張 96×96，Google 搜尋結果旁邊那顆要 48 的倍數才收
   *   apple           跟後台同一張 kaixing-touch-icon.png（白底＋標記＋字，他 10/13 指定的）；
   *                   不用去背的 mark：iOS 會把透明處填成黑色
   *
   * 兩張 favicon 都是 scratchpad 的小腳本用 sharp 從 kaixing-mark.png 縮的，換 logo 時重做一次就好。
   * ⚠️ 這是 root layout 的設定，`/admin/*` 與 `/intake` 各自有自己的 icons（整組覆蓋、不是合併），不受這裡影響。
   */
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/favicon-96.png", type: "image/png", sizes: "96x96" },
    ],
    apple: "/kaixing-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <body>
        {children}
        {/* 只負責記一次人氣，畫面上不顯示；顯示的那個在首頁頁尾 */}
        <VisitCounter silent />
        {/* 精選好案卡片的點擊統計。用事件委派，卡片那邊只要加 data 屬性 */}
        <ListingClickTracker />
      </body>
    </html>
  );
}
