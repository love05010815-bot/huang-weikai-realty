/**
 * 物件對外的長相 —— /api/match/search、/api/match/listing/[id]、/api/match/listings 共用。
 * 不帶店電話、店碼這些內部欄位；照片最多給 8 張。
 *
 * （Next.js 的 route.ts 只能匯出 GET／POST 這些固定名字，共用的東西要放在這種 lib 檔。）
 */
import { PACIFIC_STORES } from "@/config/match";
import { storeShortName } from "@/app/match/browse-state";
import type { MatchListing } from "./store";

export type PublicListing = ReturnType<typeof publicListing>;

/**
 * 門市短名（「沙鹿特三店」）：2026-10-06 客人頁改成店頭官網那套物件卡，左上角那顆標籤要用。
 * 官網來的照店碼查 PACIFIC_STORES；店網（愛屋）來的都是梧棲店自己的。
 */
function storeOf(l: MatchListing): string {
  const full = l.src === "houseol" ? PACIFIC_STORES.CUK?.name : PACIFIC_STORES[l.storeId]?.name;
  return full ? storeShortName(full) : "";
}

export function publicListing(l: MatchListing) {
  return {
    id: l.id,
    title: l.title,
    city: l.city,
    district: l.district,
    address: l.address,
    price: l.price,
    originalPrice: l.originalPrice,
    unitPrice: l.unitPrice,
    rooms: l.rooms,
    halls: l.halls,
    baths: l.baths,
    size: l.size,
    landSize: l.landSize,
    type: l.type,
    // 店網的「類別」（土地:農地…）。客人頁在瀏覽器裡跑 rankListings 要用它判斷土地類別（2026-10-06）
    usageType: l.usageType,
    age: l.age,
    floor: l.floor,
    features: l.features,
    images: l.images.slice(0, 8),
    video: l.video,
    sourceUrl: l.sourceUrl,
    store: storeOf(l),
  };
}

export type BrowseListing = ReturnType<typeof browseListing>;

/**
 * 給客人頁「好案配對找房」整池下載用的版本：跟 publicListing 一樣，只是照片只留第一張 ——
 * 九百間 × 8 張網址會把整包撐到快 1MB，卡片本來就只秀一張。
 */
export function browseListing(l: MatchListing) {
  const p = publicListing(l);
  return { ...p, images: p.images.slice(0, 1) };
}
