import type { Metadata } from "next";

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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
