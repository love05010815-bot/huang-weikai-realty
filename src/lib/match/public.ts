/**
 * 物件對外的長相 —— /api/match/search 與 /api/match/listing/[id] 共用。
 * 不帶店電話、店碼這些內部欄位；照片最多給 8 張。
 *
 * （Next.js 的 route.ts 只能匯出 GET／POST 這些固定名字，共用的東西要放在這種 lib 檔。）
 */
import type { MatchListing } from "./store";

export type PublicListing = ReturnType<typeof publicListing>;

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
    age: l.age,
    floor: l.floor,
    features: l.features,
    images: l.images.slice(0, 8),
    video: l.video,
    sourceUrl: l.sourceUrl,
  };
}
