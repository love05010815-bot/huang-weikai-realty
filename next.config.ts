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

  /**
   * 🔴 sharp 一定要留在 external，不要讓打包器去 bundle 它。
   *
   * 它是原生模組，真正幹活的是 @img/sharp-libvips-linux-x64 裡的 libvips-cpp.so。
   * 打包器只搬得動 JS，搬不動 .so，結果就是線上噴
   * 「Could not load the sharp module … libvips-cpp.so.8.18.3: cannot open shared object file」。
   * 2026-08-21 第一次上線就是這樣掛的。
   */
  serverExternalPackages: ["sharp"],

  /** 再保險一層：明確叫 Vercel 把 linux 的原生檔帶進上傳那支 route 的 bundle。 */
  outputFileTracingIncludes: {
    "/api/admin/listings/photo": [
      "./node_modules/@img/sharp-linux-x64/**",
      "./node_modules/@img/sharp-libvips-linux-x64/**",
    ],
  },
};

export default nextConfig;
