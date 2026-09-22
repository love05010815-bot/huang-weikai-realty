"use client";

/**
 * /admin/fb 用的包裝：把黃瑋凱本人的固定尾段與舊資料補丁傳給共用的操作介面。
 *
 * 為什麼多這一層：`FbGroupManager` 同時是同事版外掛的畫面（tools/fb-group-poster/app 用 esbuild 整包編進去），
 * 他的尾段（電話、LINE、經紀人證號）與網址補丁只能在**這裡**進來，不能寫死在 FbGroupManager 裡，
 * 不然同事拿到的檔案裡就有他的個資。page.tsx 是 server component，函式傳不過去，所以要這個 client 包裝。
 */
import { FB_AD_TAIL, fixTruncatedTail } from "@/config/fb-tail";
import FbGroupManager from "./FbGroupManager";

export default function FbAdminManager() {
  return <FbGroupManager mode="admin" defaultTail={FB_AD_TAIL} migrateTail={fixTruncatedTail} />;
}
