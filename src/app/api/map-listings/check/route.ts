/**
 * 每天檢查一次「建案地圖上的物件連結還點得開嗎」。
 *
 * 2026-10-02 系統擁有者：「建案地圖若有客戶點不開的物件請於後台跳警示下架通知」。
 *
 * 跟 `/api/news/daily`、`/api/lvr/daily` 同一套：端點公開、誰來打都一樣，
 * 真正的結果寫進 `map_listing` 的 `link_state`，後台 `/admin/map-listings` 最上面會跳橫幅。
 * 觸發來源：`vercel.json` 的 cron（03:00 UTC ＝ 台北 11:00，排在新聞與實價登錄之後）。
 *
 * 🔵 **只檢查、不自動下架。** 要不要把物件從前台拿掉是他在後台按的 ——
 *    判錯一次就是默默少一間在賣的房子，不值得為了省一個按鈕冒這個險。
 *
 * 🔴 **只打愛屋（houseol.com.tw）**，其他網域一律不發請求。
 *    591 明文禁止程式自動抓取（每筆求償 3,000 元），白名單寫在 `lib/map-listing-check.ts`。
 *
 * ⚠️ 愛屋的「已下架」頁回的是 **HTTP 200** 不是 404 —— 判定看的是頁面內容，
 *    不是狀態碼。細節與實測數字在 `lib/map-listing-check.ts` 檔頭。
 */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { checkMapListingLinks } from "@/lib/map-listings";

export const dynamic = "force-dynamic";
// 90 筆、3 條並行、單筆 12 秒上限 —— 實測約 12 秒，留足餘裕
export const maxDuration = 60;

export async function GET() {
  try {
    const r = await checkMapListingLinks();
    // 檢查本身不改前台內容（status 沒動），但後台那一頁要立刻看得到新結果
    try {
      revalidatePath("/admin/map-listings");
    } catch (e) {
      console.error("[map-link] revalidate 失敗:", e);
    }
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    // 保溫排程把這支當「可失敗」，永遠回 200，不要讓它的紀錄變紅
    return NextResponse.json({ ok: false, reason: e instanceof Error ? e.message : String(e) });
  }
}
