import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 名片頁的大頭照如果放外部網址（例如 CDN），把網域加進來
  images: { remotePatterns: [] },

  /*
   * 這裡本來有 outputFileTracingIncludes，把 public/listings/** 帶進 /admin/listings
   * 的 bundle，供舊的「從 repo 現有檔案挑照片」下拉用 fs.readdir 去列。
   *
   * 2026-08-21 照片改成後台直接上傳到 Vercel Blob，那個下拉整個拿掉了，
   * 沒有人再 readdir，這段就變成純粹把 3MB 圖檔塞進 function bundle 的浪費。
   */
};

export default nextConfig;
