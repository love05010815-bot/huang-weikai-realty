import type { Metadata } from "next";
import { OWNER, SITE_URL } from "@/config/owner";
import BookingForm from "./BookingForm";

/**
 * /card/booking —— 線上預約頁，**可被索引**。
 *
 * 原本設 noindex（模板把它當私人名片的附屬頁）。
 * 2026-08-19 拍板拿掉：這頁有實質內容，是客戶搜「黃瑋凱 預約」
 * 「台中海線房仲 預約」時最該落地的頁，所以開放收錄並加回 sitemap。
 *
 * ⚠️ 隔壁的 /card/booking/manage 要維持 noindex —— 那頁網址帶 token。
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `線上預約諮詢｜台中海線房仲${OWNER.name}｜沙鹿梧棲清水龍井`,
  description: `線上預約${OWNER.name}房產諮詢。買賣租賃、資金配置規劃、稅費諮詢、市場分析、裝潢資源媒合，選好時段直接預約，系統會寄確認信給你。服務台中海線沙鹿、梧棲、清水、龍井。`,
  keywords: ["線上預約房仲", "台中海線房仲預約", "沙鹿房仲諮詢", "梧棲房仲諮詢", OWNER.name, "房產諮詢預約"],
  robots: { index: true, follow: true },
  alternates: { canonical: "/card/booking" },
  openGraph: {
    type: "website",
    locale: "zh_TW",
    title: `線上預約諮詢｜台中海線房仲${OWNER.name}`,
    description: `買賣租賃、資金配置規劃、稅費諮詢、市場分析、裝潢資源媒合，線上選時段直接預約${OWNER.name}。`,
    url: "/card/booking",
    siteName: `${OWNER.name}｜台中海線房仲`,
    images: [{ url: "/profile.jpg", alt: `${OWNER.name}形象照` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `線上預約諮詢｜台中海線房仲${OWNER.name}`,
    description: `買賣租賃、資金配置規劃、稅費諮詢、市場分析、裝潢資源媒合，線上選時段直接預約。`,
    images: ["/profile.jpg"],
  },
};

export default function BookingPage() {
  return <BookingForm />;
}
