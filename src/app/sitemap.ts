/**
 * sitemap.xml —— 把「希望被搜到的頁」主動送給 Google
 *
 * ⚠️ 鐵律：只能放「可被索引」的頁。
 *    /card 與 /card/booking 目前都設了 robots noindex，
 *    放進來 Google Search Console 會直接報「已提交的網址標示為 noindex」錯誤，
 *    所以刻意不收。哪天把那兩頁改成可索引，再回來這裡補。
 *
 * 之後新增文章頁，記得回來補一筆，不然 Google 要靠自己爬、慢很多。
 */
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/owner";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
  ];
}
