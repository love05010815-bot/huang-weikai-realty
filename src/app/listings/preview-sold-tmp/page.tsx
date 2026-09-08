/**
 * ⚠️ 臨時示範路由，**合併進 main 前要整個資料夾刪掉**。
 *
 * 2026-09-08 系統擁有者要看「物件下架後，客戶點舊連結會看到什麼」；
 * 目前 12 戶全上架、沒有真資料可以開，所以塞一筆假資料用 status="sold" 渲染。
 * 跟 9/7 後台 preview-tmp 同一個做法：看完就刪。
 */
import type { Metadata } from "next";
import type { Listing } from "@/config/listings";
import ListingView from "../[slug]/ListingView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "示範：已下架的物件頁", robots: { index: false, follow: false } };

const DEMO: Listing = {
  slug: "demo-sold",
  title: "後站商圈三房平車",
  points: ["示範用假資料"],
  area: "沙鹿區・德光聚",
  photos: [],
  link: null,
  video: null,
  status: "sold",
  price: null,
};

export default function PreviewSoldPage() {
  return <ListingView item={DEMO} status="sold" />;
}
