/**
 * /match 客人頁「好案配對找房」工具的純函式 —— 不碰 React、不 import 任何 "@/…"，
 * scripts/check-match.mjs 用 node 直接載它測。
 *
 * 2026-10-06 他說「客人看到的配對找房改用梧棲店官網的好案配對」（選了「把店官網那套找房工具搬過來」）：
 * 介面照店頭官網 pacifi-realtor-wuchi.vercel.app 的那一區（工具列篩選＋三欄物件卡＋一次 9 張、載入更多），
 * 資料用自己的庫、配對規則用 lib/match/matcher.ts 同一份。這裡只放工具列周邊那幾個小換算。
 */

/** 一次鋪幾張卡（店頭官網也是 9，三欄剛好三排） */
export const PAGE_SIZE = 9;

/** 物件卡要用到的欄位（/api/match/listings 回的 BrowseListing 跟 /api/match/search 回的 match 都有） */
export type CardListing = {
  id: string;
  title: string;
  district: string;
  address: string;
  price: number;
  originalPrice: number | null;
  rooms: number;
  halls: number;
  baths: number;
  size: number;
  landSize: number;
  type: string;
  age: number;
  images: string[];
  sourceUrl: string;
  /** 門市短名（沙鹿特三店…），店頭官網卡片左上那顆標籤；沒有就不畫 */
  store?: string;
};

/**
 * 關鍵字：對名稱、地址、行政區；多個字用空白隔開就是「都要有」。空字串＝不篩。
 * 關鍵字不是購屋條件的一部分（不寫回資料庫），只是在這一頁找東西用。
 */
export function keywordHit(l: Pick<CardListing, "title" | "address" | "district">, keyword: string): boolean {
  const words = String(keyword ?? "")
    .split(/[\s　]+/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (!words.length) return true;
  const hay = `${l.title} ${l.address} ${l.district}`;
  return words.every((w) => hay.includes(w));
}

/**
 * 網址 ?items=S1,S2 → 物件編號清單（店頭官網「前往預約看屋」帶過來的；也接 ?book= 的單一個）。
 * 去重、去空、只留像編號的字串，最多 10 間（一筆預約的上限，跟 /api/match/viewing 一樣）。
 */
export function parseIdList(raw: string | null | undefined, max = 10): string[] {
  const ids = String(raw ?? "")
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9_-]{1,64}$/.test(s));
  return [...new Set(ids)].slice(0, max);
}

/**
 * 店頭官網那種一行：「華廈 ・ 2房2廳1衛 ・ 32.78坪 ・ 屋齡6年」。
 * 土地沒有房廳衛就不寫、改寫地坪；屋齡 0 = 店網沒給（土地）不寫，未滿一年寫新成屋。
 */
export function cardMeta(l: Pick<CardListing, "type" | "rooms" | "halls" | "baths" | "size" | "landSize" | "age">): string {
  const parts: string[] = [];
  if (l.type) parts.push(l.type);
  if (l.rooms > 0) parts.push(`${l.rooms}房${l.halls}廳${l.baths}衛`);
  if (l.landSize > 0 && /土地|農|建地/.test(l.type)) parts.push(`地坪${l.landSize}坪`);
  else if (l.size > 0) parts.push(`${l.size}坪`);
  if (l.age > 0) parts.push(l.age < 1 ? "新成屋" : `屋齡${l.age}年`);
  return parts.join(" ・ ");
}

/** 「1,688 萬」 */
export const priceText = (n: number): string => `${Number(n || 0).toLocaleString("zh-TW")} 萬`;

/**
 * 卡片上的地址：「台中市沙鹿區福至路」。資料庫的 address 多半只有路名（店網給的就是這樣），
 * 店頭官網的卡片是連市區一起寫，所以前面補上市區；address 本來就含市區（官網有些是全址）就不重複。
 */
export function fullAddress(l: { city: string; district: string; address: string }): string {
  const addr = String(l.address ?? "").trim();
  const area = `${l.city ?? ""}${l.district ?? ""}`;
  if (!addr) return area;
  if (l.district && addr.includes(l.district)) return addr;
  return `${area}${addr}`;
}

/**
 * 「台中沙鹿特三加盟店」→「沙鹿特三店」：店頭官網卡片上用的短名。
 * 拿掉前面的「台中」、尾巴的「加盟店」改成「店」；「幸福領航」官網叫「領航」。
 * 「旗艦」兩個字：前面只有行政區（沙鹿旗艦店）要留著，不然跟沙鹿其他四家分不開；
 * 前面已經是完整的店名（梧棲新市鎮、清水中山）就拿掉，跟店頭官網寫的一樣。
 */
export function storeShortName(full: string): string {
  return String(full ?? "")
    .replace(/^台中/, "")
    .replace(/幸福領航/, "領航")
    .replace(/加盟店$/, "店")
    .replace(/^(.{3,})旗艦店$/, "$1店");
}
