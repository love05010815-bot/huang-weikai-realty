/**
 * 🧩 「貼一條太平洋的連結 → 一筆完整的物件」—— 三個工具共用的載入器（伺服器專用，會碰資料庫）
 *
 * 吃四種輸入：
 *   ・分享連結  https://prim.pacific.com.tw/s/<代碼>   （愛屋改版後他新增物件貼的那種；客戶看的也是它）
 *   ・官網物件頁 https://www.pacific.com.tw/Object/ObjectDetail/?saleID=S…
 *   ・直接打 S 編號  S2862747
 *   ・委託編號（合約書上那個，例 AA6350828，2026-11-02 他要的）→ 查 match_listing.houseol_id 換成 S 編號，
 *     查不到代表不是我們同步範圍內的店、或還沒同步到，當一般的「找不到」處理，不特別分訊息
 *
 * 拼起來的順序：
 *   ⓪ 委託編號 → 查表拿 S 編號，查不到就直接回報找不到（這步只有委託編號這種輸入才會走）
 *   ① 分享連結 → 分享 API（lib/prim-share.ts）拿 S 編號、完工日、封面；**一條分享包好幾筆就停下來要他指定**
 *   ② S 編號 → 官網 GetObjectDetail ＋ GetObjectPicture（lib/pacific-object.ts）：欄位最全、照片全部
 *   ③ 照片檔名對出愛屋編號 → 資料庫 houseol_address 拿完整門牌（跟愛屋那條一樣）；委託編號輸入本身就是它，不用再猜
 *   官網掛掉但有分享 API 的 → 用分享 API 的欄位湊（detailFromShare），空格多但帶得進來；兩邊都沒有才算失敗。
 *
 * 出口：`toCatalog()`（FB 廣告、地圖物件）與 `toPost591()`（591 刊登助手）—— 純規則在 lib/pacific-map.ts。
 */
import { getHouseolAddressMap } from "@/lib/houseol-address";
import { catalogUrlFor } from "@/lib/houseol-catalog";
import { extractPhotosFromHtml, houseolHtmlToText, isHouseolCatalogHtml, parseListing, sortHouseolPhotos, type Listing } from "@/lib/post591-parser";
import { getListing, getListingByHouseolId } from "@/lib/match/store";
import { houseolIdFromPic } from "@/lib/match/pacific-parse";
import { detailFromShare, detailToCatalog, detailToPost591, type PacificDetail, type PacificExtra } from "@/lib/pacific-map";
import { fetchPacificObject } from "@/lib/pacific-object";
import { houseolContractIdFrom, fetchPrimShare, pacificDetailUrl, pacificSaleIdFrom, primShareCode, primShareUrl, type PrimShareItem } from "@/lib/prim-share";

export type PacificInput = { kind: "prim"; code: string } | { kind: "sale"; saleId: string } | { kind: "houseol"; houseolId: string };

/** 看得懂的輸入 → 分享連結、S 編號、還是委託編號；都不是 → null */
export function parsePacificInput(input: string): PacificInput | null {
  const code = primShareCode(input);
  if (code) return { kind: "prim", code };
  const saleId = pacificSaleIdFrom(input);
  if (saleId) return { kind: "sale", saleId };
  const houseolId = houseolContractIdFrom(input);
  return houseolId ? { kind: "houseol", houseolId } : null;
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
  /** 照片為什麼不齊（官網照片清單沒回應、或官網整個讀不到只剩分享頁封面）；照片正常（含官網真的 0 張）是 null */
  photoNote: string | null;
};

export type PacificLoadResult = { ok: true; data: PacificLoaded } | { ok: false; error: string };

export async function loadPacificListing(input: string): Promise<PacificLoadResult> {
  const parsed = parsePacificInput(input);
  if (!parsed) return { ok: false, error: "這不是太平洋的分享連結、官網物件頁、S 編號或委託編號" };

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
  } else if (parsed.kind === "houseol") {
    // 委託編號 → 查我們自己同步的表拿 S 編號。查不到就是不是我們店的物件、或這間還沒同步到——
    // 他只能等一下或改貼 S 編號／分享連結，不用再往下試
    const row = await getListingByHouseolId(parsed.houseolId);
    if (!row) return { ok: false, error: `委託編號 ${parsed.houseolId} 在同步清單裡找不到（可能還沒同步到，或編號打錯），用 S 編號或分享連結試試看。` };
    saleId = row.id;
    linkHref = pacificDetailUrl(saleId);
  } else {
    saleId = parsed.saleId;
    linkHref = pacificDetailUrl(saleId);
  }

  // ② 官網：欄位最全。掛掉就用分享 API 的欄位湊（沒有分享連結就只能報錯）
  const obj = await fetchPacificObject(saleId);
  let detail: PacificDetail;
  let photos: string[];
  let fromOfficial: boolean;
  let photoNote: string | null;
  if (obj.ok) {
    detail = obj.detail;
    photos = obj.photos;
    fromOfficial = true;
    photoNote = obj.photoError;
  } else if (share) {
    detail = detailFromShare(share);
    photos = share.coverPhoto ? [share.coverPhoto] : [];
    fromOfficial = false;
    photoNote = `太平洋官網暫時讀不到（${obj.error}），照片只有分享頁的封面`;
  } else {
    return { ok: false, error: obj.error };
  }
  // 官網沒照片時封面至少有一張（pacblob）；有照片時不要再塞封面 —— 實測封面就是第一張、會重複
  if (photos.length === 0 && share?.coverPhoto) photos = [share.coverPhoto];

  // ③ 愛屋編號 → 完整門牌。輸入本身就是委託編號的話不用再猜，照片檔名對不到就看官網同步表那一筆
  let houseolId = parsed.kind === "houseol" ? parsed.houseolId : houseolIdFromPic(photos.find((u) => /houseol\.com\.tw/i.test(u)));
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

  return { ok: true, data: { saleId, linkHref, share, detail, fromOfficial, photos, houseolId, fullAddress, photoNote } };
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
  if (!d.fromOfficial) listing.warnings.unshift("太平洋官網讀不到這一戶（多半是官網還沒上架），這份只有分享頁的欄位（特色、樓層、車位、管理費、坪數明細都要自己補）。");
  else if (d.photoNote) listing.warnings.unshift(`${d.photoNote}：照片沒帶到，等一下重貼一次連結或編號。`);
  return listing;
}

/* ───────── 591 刊登助手專用：官網這條路走不通時退回愛屋型錄 ───────── */

export type Post591Loaded = { caseId: string; sourceUrl: string; fromOfficial: boolean; listing: Listing };

/**
 * 委託編號 → 直接抓愛屋型錄頁解析（跟外掛「貼型錄網址」同一個解析器）。
 * 2026-11-20：他貼 AD5401518 回「在同步清單裡找不到」—— 同步表是照官網編號收的，**出租物件幾乎都沒對到委託編號**
 * （當天 60 筆出租只有 5 筆有 houseol_id），剛簽的委託也還沒同步到。型錄頁本身是公開的、有編號就開得到，不必等同步。
 * 讀不出租金也讀不出總價＝編號打錯或已下架（下架的型錄是空殼、照樣回 200），回 null 讓呼叫端維持原本的錯誤訊息。
 */
export async function loadFromHouseolCatalog(houseolId: string): Promise<Post591Loaded | null> {
  const url = catalogUrlFor(houseolId);
  let html = "";
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; weikaihouse.com/1.0; +https://weikaihouse.com)", accept: "text/html" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }
  if (!isHouseolCatalogHtml(html)) return null;
  const listing = parseListing(houseolHtmlToText(html));
  if (listing.rent == null && !listing.price) return null;
  if (!listing.no) listing.no = houseolId;
  const seen = new Set<string>();
  listing.photos = sortHouseolPhotos(
    [...listing.photos, ...extractPhotosFromHtml(html, houseolId)].filter((u) => {
      const k = u.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }),
  );
  // 型錄頁只印到路名；我們自己的門牌表有這個編號就補上
  try {
    const full = (await getHouseolAddressMap()).get(houseolId);
    if (full && /號/.test(full) && !/號/.test(listing.addr)) {
      listing.addr = full;
      listing.warnings = listing.warnings.filter((w) => !/門牌/.test(w));
    }
  } catch {
    /* 沒門牌就照型錄的 */
  }
  listing.warnings.unshift("這一戶官網那邊對不到（還沒同步或還沒上架），資料是從愛屋型錄帶的，請核對一遍。");
  return { caseId: houseolId, sourceUrl: url, fromOfficial: false, listing };
}

/** 591 刊登助手（後台與同事版外掛）共用的入口：先走官網，委託編號走不通再退回愛屋型錄 */
export async function loadPost591Listing(input: string): Promise<{ ok: true; data: Post591Loaded } | { ok: false; error: string }> {
  const got = await loadPacificListing(input);
  if (got.ok) {
    const d = got.data;
    return { ok: true, data: { caseId: d.houseolId || d.saleId, sourceUrl: d.linkHref, fromOfficial: d.fromOfficial, listing: toPost591(d) } };
  }
  const parsed = parsePacificInput(input);
  if (parsed?.kind === "houseol") {
    const viaCatalog = await loadFromHouseolCatalog(parsed.houseolId);
    if (viaCatalog) return { ok: true, data: viaCatalog };
    return {
      ok: false,
      error: `委託編號 ${parsed.houseolId} 帶不進來：官網同步清單裡沒有，愛屋型錄頁用這個編號開出來也是空的（編號打錯、愛屋那邊還沒上架、或已下架）。先核對編號；確定沒錯就改貼型錄頁網址、官網編號（R／P／S 開頭）或分享連結。`,
    };
  }
  return { ok: false, error: got.error };
}
