import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 名片頁的大頭照如果放外部網址（例如 CDN），把網域加進來
  images: { remotePatterns: [] },

  /**
   * 後台 /admin/listings 的照片下拉，是用 fs.readdir 去列 public/listings/ 的檔案。
   *
   * 🔴 Vercel 上 public/ 的檔案預設**不會**被打包進 serverless function
   *    （它們是丟給 CDN 直接送的），所以不加這行的話，本機看得到、線上就變成空清單，
   *    照片欄只能手動打檔名。這行是叫 Vercel 把那些圖一起帶進那個 route 的 bundle。
   */
  outputFileTracingIncludes: {
    "/admin/listings": ["./public/listings/**"],
  },
};

export default nextConfig;
