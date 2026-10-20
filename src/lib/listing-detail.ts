/**
 * 🏠 單戶物件頁（/listings/<slug>）要顯示的「太平洋官網完整資料」—— 伺服器專用（碰網路與資料庫）
 *
 * 2026-10-20 系統擁有者：精選好案不再把客戶導去外部網站，點照片就在站內看這戶的所有資訊，
 * 資料一樣從太平洋官網抓。後台「物件資訊」那欄的連結現在是**資料來源**，不再是給客戶點的按鈕。
 *
 * 連結 → S 編號 → 官網單筆 API，三種連結都認：
 *   ・分享連結 prim.pacific.com.tw/s/<代碼> → 分享 API（一小時快取，跟售價那支同一筆）→ objNo
 *   ・官網物件頁 ?saleID=S… → 直接就是 S 編號
 *   ・舊的愛屋型錄 es.houseol.com.tw/…No=AA… → 官網同步表 match_listing 用 houseol_id 對回 S 編號
 * 官網 API 掛掉但有分享連結 → 用分享 API 的欄位湊（detailFromShare），空格多但頁面不會整個沒資料；
 * 兩邊都沒有 → null，頁面就只顯示後台填的標題、賣點、照片（跟 10/20 以前一樣），**不報錯、不 throw**。
 *
 * 快取：page.tsx 的 generateMetadata 與頁面本體都會呼叫，用 React cache() 讓同一次渲染只抓一次；
 * 跨請求靠頁面本身的 ISR（revalidate 300），等於一戶最多五分鐘打一次官網。
 *
 * 🔴 官網回應裡的經紀人個資在 lib/pacific-map.ts 的 sanitizeDetail() 就丟掉了，這裡拿到的已經沒有。
 */
import { cache } from "react";
import { houseolCaseId } from "@/lib/houseol-price";
import { getListingByHouseolId } from "@/lib/match/store";
import { detailFromShare, type PacificDetail } from "@/lib/pacific-map";
import { fetchPacificObject } from "@/lib/pacific-object";
import { fetchPrimShare, PACIFIC_SALE_ID, pacificSaleIdFrom, primShareCode, type PrimShareItem } from "@/lib/prim-share";

export type ListingDetail = {
  /** 太平洋官網 S 編號 */
  saleId: string;
  detail: PacificDetail;
  /** 官網的照片（愛屋圖床）；後台自己上傳的照片優先，這份給沒上傳照片的那戶用 */
  photos: string[];
  share: PrimShareItem | null;
  /** false ＝ 官網讀不到、用分享 API 湊的 */
  fromOfficial: boolean;
};

async function resolveSaleId(href: string): Promise<{ saleId: string; share: PrimShareItem | null } | null> {
  const code = primShareCode(href);
  if (code) {
    // 跟 lib/houseol-price.ts 的售價用同一組 fetch 選項 → Next data cache 同一筆，不多打一次分享 API
    const got = await fetchPrimShare(code, { revalidate: 3600, timeoutMs: 6000 });
    if (!got.ok || got.share.items.length !== 1) return null;
    return { saleId: got.share.items[0].objNo, share: got.share.items[0] };
  }
  const saleId = pacificSaleIdFrom(href);
  if (saleId) return { saleId, share: null };

  const houseolId = houseolCaseId(href);
  if (houseolId) {
    const row = await getListingByHouseolId(houseolId);
    // 2026-10-02 以前的舊同步資料主鍵可能不是 S 編號，長得不像就不要拿去打官網
    if (row && PACIFIC_SALE_ID.test(row.id)) return { saleId: row.id.toUpperCase(), share: null };
  }
  return null;
}

export const loadListingDetail = cache(async (href: string | null | undefined): Promise<ListingDetail | null> => {
  if (!href) return null;
  try {
    const found = await resolveSaleId(href);
    if (!found) return null;
    const obj = await fetchPacificObject(found.saleId, 7000);
    if (obj.ok) return { saleId: found.saleId, detail: obj.detail, photos: obj.photos, share: found.share, fromOfficial: true };
    if (found.share) {
      return {
        saleId: found.saleId,
        detail: detailFromShare(found.share),
        photos: found.share.coverPhoto ? [found.share.coverPhoto] : [],
        share: found.share,
        fromOfficial: false,
      };
    }
    return null;
  } catch {
    return null;
  }
});
