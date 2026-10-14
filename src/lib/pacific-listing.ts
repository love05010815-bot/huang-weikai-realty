/**
 * 🧩 「貼一條太平洋的連結 → 一筆完整的物件」—— 三個工具共用的載入器（伺服器專用，會碰資料庫）
 *
 * 吃三種輸入：
 *   ・分享連結  https://prim.pacific.com.tw/s/<代碼>   （愛屋改版後他新增物件貼的那種；客戶看的也是它）
 *   ・官網物件頁 https://www.pacific.com.tw/Object/ObjectDetail/?saleID=S…
 *   ・直接打 S 編號  S2862747
 *
 * 拼起來的順序：
 *   ① 分享連結 → 分享 API（lib/prim-share.ts）拿 S 編號、完工日、封面；**一條分享包好幾筆就停下來要他指定**
 *   ② S 編號 → 官網 GetObjectDetail ＋ GetObjectPicture（lib/pacific-object.ts）：欄位最全、照片全部
 *   ③ 照片檔名對出愛屋編號 → 資料庫 houseol_address 拿完整門牌（跟愛屋那條一樣）
 *   官網掛掉但有分享 API 的 → 用分享 API 的欄位湊（detailFromShare），空格多但帶得進來；兩邊都沒有才算失敗。
 *
 * 出口：`toCatalog()`（FB 廣告、地圖物件）與 `toPost591()`（591 刊登助手）—— 純規則在 lib/pacific-map.ts。
 */
import { getHouseolAddressMap } from "@/lib/houseol-address";
import { getListing } from "@/lib/match/store";
import { houseolIdFromPic } from "@/lib/match/pacific-parse";
import { detailFromShare, detailToCatalog, detailToPost591, type PacificDetail, type PacificExtra } from "@/lib/pacific-map";
import { fetchPacificObject } from "@/lib/pacific-object";
import { fetchPrimShare, pacificDetailUrl, pacificSaleIdFrom, primShareCode, primShareUrl, type PrimShareItem } from "@/lib/prim-share";

export type PacificInput = { kind: "prim"; code: string } | { kind: "sale"; saleId: string };

/** 看得懂的輸入 → 是分享連結還是 S 編號；都不是 → null */
export function parsePacificInput(input: string): PacificInput | null {
  const code = primShareCode(input);
  if (code) return { kind: "prim", code };
  const saleId = pacificSaleIdFrom(input);
  return saleId ? { kind: "sale", saleId } : null;
}

export type PacificLoaded = {
  saleId: string;
  /** 存進「物件資訊」按鈕的連結 */
  linkHref: string;
  share: PrimShareItem | null;
  detail: PacificDetail;
  /** 官網 API 讀到了嗎（false ＝ 用分享 API 湊的） */
  fromOfficial: boolean;
  photos: string[];
  houseolId: string;
  fullAddress: string | null;
};

export type PacificLoadResult = { ok: true; data: PacificLoaded } | { ok: false; error: string };

export async function loadPacificListing(input: string): Promise<PacificLoadResult> {
  const parsed = parsePacificInput(input);
  if (!parsed) return { ok: false, error: "這不是太平洋的分享連結、官網物件頁或 S 編號" };

  let share: PrimShareItem | null = null;
  let saleId: string;
  let linkHref: string;
  if (parsed.kind === "prim") {
    const got = await fetchPrimShare(parsed.code);
    if (!got.ok) return { ok: false, error: `這條分享連結讀不到：${got.check.note}` };
    const items = got.share.items;
    if (items.length === 0) return { ok: false, error: "這條分享連結裡沒有物件" };
    if (items.length > 1) {
      const list = items.map((it, i) => `${i + 1}. ${it.objNo}｜${it.title}`).join("\n");
      return {
        ok: false,
        error: `這條分享連結包了 ${items.length} 筆物件，不知道要帶哪一筆：\n${list}\n請貼只有一筆的分享連結，或直接打上面那個 S 編號。`,
      };
    }
    share = items[0];
    saleId = share.objNo;
    linkHref = primShareUrl(parsed.code);
  } else {
    saleId = parsed.saleId;
    linkHref = pacificDetailUrl(saleId);
  }

  // ② 官網：欄位最全。掛掉就用分享 API 的欄位湊（沒有分享連結就只能報錯）
  const obj = await fetchPacificObject(saleId);
  let detail: PacificDetail;
  let photos: string[];
  let fromOfficial: boolean;
  if (obj.ok) {
    detail = obj.detail;
    photos = obj.photos;
    fromOfficial = true;
  } else if (share) {
    detail = detailFromShare(share);
    photos = share.coverPhoto ? [share.coverPhoto] : [];
    fromOfficial = false;
  } else {
    return { ok: false, error: obj.error };
  }
  // 官網沒照片時封面至少有一張（pacblob）；有照片時不要再塞封面 —— 實測封面就是第一張、會重複
  if (photos.length === 0 && share?.coverPhoto) photos = [share.coverPhoto];

  // ③ 愛屋編號 → 完整門牌。照片檔名對不到就看官網同步表那一筆
  let houseolId = houseolIdFromPic(photos.find((u) => /houseol\.com\.tw/i.test(u)));
  if (!houseolId) {
    try {
      houseolId = (await getListing(saleId))?.houseolId ?? "";
    } catch {
      houseolId = "";
    }
  }
  let fullAddress: string | null = null;
  if (houseolId) {
    try {
      fullAddress = (await getHouseolAddressMap()).get(houseolId) ?? null;
    } catch {
      fullAddress = null;
    }
  }

  return { ok: true, data: { saleId, linkHref, share, detail, fromOfficial, photos, houseolId, fullAddress } };
}

function extraOf(d: PacificLoaded): PacificExtra {
  return { share: d.share, photos: d.photos, fullAddress: d.fullAddress, linkHref: d.linkHref, houseolId: d.houseolId };
}

/** → 愛屋型錄那種 CatalogListing（FB 廣告草稿、地圖物件賣點） */
export function toCatalog(d: PacificLoaded) {
  return detailToCatalog(d.detail, extraOf(d));
}

/** → 591 刊登助手的 Listing */
export function toPost591(d: PacificLoaded) {
  const listing = detailToPost591(d.detail, extraOf(d));
  if (!d.fromOfficial) listing.warnings.unshift("太平洋官網暫時讀不到，這份只有分享頁的欄位（樓層、車位、管理費、坪數明細都要自己補）。");
  return listing;
}
