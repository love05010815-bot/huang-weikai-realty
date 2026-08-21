/**
 * sitemap.xml —— 把「希望被搜到的頁」主動送給 Google
 *
 * ⚠️ 鐵律：只能放「可被索引」的頁。放了 noindex 的頁，
 *    Search Console 會直接報「已提交的網址標示為 noindex」錯誤。
 *
 * 目前刻意不收：
 *   /card                 名片頁，隱私考量維持 noindex
 *   /card/booking/manage  網址帶 token，robots.txt 也擋掉了
 *
 * 之後新增文章頁，記得回來補一筆，不然 Google 要靠自己爬、慢很多。
 */
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/owner";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: SITE_URL, lastModified, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/card/booking`, lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/about`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/listings`, lastModified, changeFrequency: "weekly", priority: 0.8 },
    // 2026-08-20 系統擁有者拍板：/map 資料未核對完，先不送給 Google。
    // 核對完把下面這行取消註解，並到 Search Console 送一次 /map。
    // { url: `${SITE_URL}/map`, lastModified, changeFrequency: "monthly", priority: 0.8 },
  ];
}
