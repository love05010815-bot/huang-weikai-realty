/**
 * sitemap.xml —— 把「希望被搜到的頁」主動送給 Google
 *
 * 只放公開頁。後台、API、帶 token 的改期頁不放（見 robots.ts）。
 * 之後新增文章頁，記得回來這裡補一筆，不然 Google 要靠自己爬、慢很多。
 */
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/owner";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: SITE_URL, lastModified, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/card`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/card/booking`, lastModified, changeFrequency: "monthly", priority: 0.9 },
  ];
}
