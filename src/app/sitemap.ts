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
    // 稅費試算是很強的搜尋入口（「房地合一稅試算」搜尋量高），優先度給高一點
    { url: `${SITE_URL}/tax`, lastModified, changeFrequency: "monthly", priority: 0.9 },
    // 2026-08-21 恢復。未核對的「土地使用分區」層已從該頁移除，
    // 現在是系統擁有者確認過的 39 個建案，可以收錄。
    { url: `${SITE_URL}/map`, lastModified, changeFrequency: "weekly", priority: 0.8 },
  ];
}
