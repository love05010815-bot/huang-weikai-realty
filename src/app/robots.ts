/**
 * robots.txt —— 告訴 Google 哪些頁可以收、哪些不要收
 *
 * 不要收的三類：
 *   /admin   後台，本來就要登入
 *   /api     介面，收了只會讓 Google 抓到一堆 JSON
 *   /card/booking/manage  客戶自助改期頁，網址帶 token，被收錄等於外流
 */
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/owner";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/card/booking/manage"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
