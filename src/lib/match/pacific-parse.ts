/**
 * 太平洋官網（www.pacific.com.tw）的物件資料 → match_listing 的一筆 —— 純函式，不碰網路、不碰資料庫
 *
 * 官網前端打的是 POST /api/ObjectAPI/SearchObject2（抓的部分在 pacific-fetch.ts），回的是 JSON，
 * 這裡只負責把它的欄位對到我們的表。2026-10-02 他拍板：配對物件改用官網、海線七家店一起收，
 * 愛屋店網只留著補梧棲店「官網沒上架」的那幾筆（見 lib/match/sync.ts）。
 *
 * 官網跟店網的差別，對應時要留意：
 *   - 主鍵用官網的 S 編號（saleID）。店網的網址 /sell_item/H229-S2966256/ 裡也是同一個 S 編號，
 *     所以兩邊同一間會落在同一筆。愛屋編號（AA…）只有九成能從照片檔名對回來，當副欄位存。
 *   - 地址寫「臺中市」，我們這邊一律「台中市」（買方條件、縣市清單都是「台」），進來就轉。
 *   - 屋齡是數字年（ageYear），0 代表「沒資料」（土地、預售）—— 跟店網一樣，配對時只扣一半、不算不符合。
 *   - 格局是三個數字，土地／店面會是 null 或 -1，一律當 0（沒資料）。
 *
 * ⚠️ 這個檔刻意不 import 任何 "@/..." 的東西：scripts/check-match.mjs 用 node 直接載它跑測試。
 */
import { splitAddress, titleFeatures, type ListingUpsert } from "./houseol-parse";

/** 官網 SearchObject2 回的一筆（只列我們用到的欄位，其餘不管） */
export type PacificItem = {
  /** 官網主鍵，例如 S2966256 */
  saleID: string;
  /** 三碼店碼，例如 CUK（哪一家店見 config/match.ts 的 PACIFIC_STORES） */
  storeID: string;
  objectName: string | null;
  /** 到路名為止，例如「臺中市清水區港新三路」 */
  address: string | null;
  /** 萬 */
  sellTotalPrice: number | null;
  /** 第一次刊登的總價（萬）；比現價高就是降過價 */
  firstSellTotalPrice: number | null;
  layoutRoom: number | null;
  layoutHall: number | null;
  layoutToilet: number | null;
  /** 建坪 */
  totalArea: number | null;
  /** 地坪 */
  landArea: number | null;
  /** 1 有車位、2 無車位 */
  hasStall: number | null;
  ageYear: number | null;
  /** 所在樓層；「-1」是 B1，「0」配 buildingAboveFloor 代表整棟（透天） */
  onWhichFloor: string | number | null;
  /** 總樓層 */
  buildingAboveFloor: number | null;
  /** 跨樓層時的最高層（例如 1-3 樓的「3」） */
  maxFloor?: string | number | null;
  /** 官網的「型態」：電梯大廈／華廈／透天厝／別墅／公寓／套房／土地／農地／建地／店面／廠房… */
  attributName: string | null;
  /** 經度 */
  x_POINT: number | null;
  /** 緯度 */
  y_POINT: number | null;
  /** 第一張照片；檔名多半帶愛屋編號，例如 …/H229AA6362125a.jpg */
  pic: string | null;
  videoLink?: string | null;
  vrLink?: string | null;
  lastUpdateDate?: string | null;
};

/**
 * 官網的「型態」→ 表單的類型（MATCH_TYPES）。先比完整字串，再看包含；對不上的進「其他」。
 * 土地的各種細分（農地／建地／住宅用地…）都收成「土地」，細分放 usageType 給土地類別用。
 */
export const PACIFIC_TYPE_MAP: Record<string, string> = {
  電梯大廈: "電梯大樓",
  樓中樓: "電梯大樓",
  華廈: "華廈",
  公寓: "公寓",
  透天厝: "透天厝",
  別墅: "透天厝",
  套房: "套房",
  農舍: "農舍",
  土地: "土地",
  農地: "土地",
  建地: "土地",
  住宅用地: "土地",
  工業用地: "土地",
  商業用地: "土地",
};

/**
 * 官網的型態 → 我們的「類別」字串。土地要寫成「土地:農地」這種格式，
 * matcher 的 landCategoryOf() 才認得（店網本來就是這樣給的）。
 *
 * 海線七家店的土地在官網的型態一律只寫「土地」（農地／建地那種細分只有別家才會出現），
 * 所以土地的類別要從標題猜：「…方正農地」「…住4建地」。標題也看不出來的就只留「土地」，
 * 買方有指定土地類別時它會被當成「不是要的那種」—— 寧可少推薦，不要猜錯。
 */
export function pacificUsageType(kind: string, title = ""): string {
  const k = String(kind ?? "").trim();
  const t = String(title ?? "");
  const cat = (s: string): string => {
    if (/農建/.test(s)) return "土地:農建地";
    if (/農牧|農地/.test(s)) return "土地:農地";
    if (/商業用地|商業地|商業區/.test(s)) return "土地:商業地";
    if (/工業用地|工業地|工業區/.test(s)) return "土地:工業用地";
    if (/住宅用地/.test(s)) return "土地:住宅用地";
    if (/建地|住[一二三四1-4]|住宅區/.test(s)) return "土地:建地";
    return "";
  };
  if (/土地|農地|建地|用地/.test(k)) return cat(k) || cat(t) || "土地";
  return k;
}

/**
 * 樓層拼成店網那種字串（「14/15」「1-3/3」「B1/14」），配對的 floorOf() 跟畫面都吃這個格式。
 *   on = 所在樓層、above = 總樓層、max = 跨樓層時的最高層
 *   沒有樓層資料（null、空、-99）回空字串 —— 配對時當「資料沒有」，不是 0 樓
 */
export function pacificFloor(on: string | number | null | undefined, above: number | null | undefined, max?: string | number | null): string {
  const w = String(on ?? "").trim();
  const total = Number(above) > 0 ? String(Math.trunc(Number(above))) : "";
  if (!w || w === "-99") return "";
  if (w.startsWith("-")) return `B${w.slice(1)}/${total}`;
  // 「0」＋總樓層 ＝ 整棟都是（透天）；「0」又沒總樓層就是沒資料
  if (w === "0") return total ? `1-${total}/${total}` : "";
  const m = String(max ?? "").trim();
  const span = m && m !== "0" && m !== w ? `${w}-${m}` : w;
  return `${span}/${total}`;
}

/** 照片檔名裡的愛屋編號（…/H229AA6362125a.jpg → AA6362125）；沒有就回空字串 */
export function houseolIdFromPic(pic: string | null | undefined): string {
  return String(pic ?? "").match(/(A[A-Z]\d{7})/)?.[1] ?? "";
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const coord = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
};

/** 官網物件頁 —— 配對結果的「看物件」連到這裡 */
export function pacificListingUrl(saleId: string): string {
  return `https://www.pacific.com.tw/Object/ObjectDetail/?saleID=${encodeURIComponent(String(saleId))}`;
}

/** 官網的一筆 → 資料表的一筆。phone 是店的電話（官網列表沒給，由呼叫端依店碼查 config 傳進來） */
export function pacificToListingUpsert(it: PacificItem, opts: { phone?: string } = {}): ListingUpsert {
  // 官網寫「臺中市」，我們這邊從買方條件到縣市清單都是「台中市」，進來就統一
  const { city, district, address } = splitAddress(String(it.address ?? "").trim().replace(/^臺/, "台"));
  const kind = String(it.attributName ?? "").trim();
  const typeKey = PACIFIC_TYPE_MAP[kind] ? kind : Object.keys(PACIFIC_TYPE_MAP).find((k) => kind.includes(k));
  const title = String(it.objectName ?? "").trim();

  const features = new Set(titleFeatures(title));
  if (it.hasStall === 1) features.add("車位");
  if (/大廈|華廈|樓中樓/.test(kind)) features.add("電梯");

  const price = num(it.sellTotalPrice);
  const first = num(it.firstSellTotalPrice);
  const size = num(it.totalArea);
  const land = num(it.landArea);
  const age = num(it.ageYear);
  const saleId = String(it.saleID ?? "").trim();

  return {
    id: saleId,
    storeId: String(it.storeID ?? "").trim(),
    // 海線七家店在愛屋的店碼都是 H229（他 2026-10-02 說的；照片檔名 H229AA… 也印證）
    storeCode: "H229",
    title: title.slice(0, 255),
    city,
    district,
    address: address.slice(0, 255),
    price,
    originalPrice: first > price && price > 0 ? first : null,
    // 官網沒給單價；用總價除建坪會把車位算進去，寧可留空也不要給一個會誤導的數字
    unitPrice: null,
    rooms: Math.trunc(num(it.layoutRoom)),
    halls: Math.trunc(num(it.layoutHall)),
    baths: Math.trunc(num(it.layoutToilet)),
    size: size || land,
    landSize: land,
    type: typeKey ? PACIFIC_TYPE_MAP[typeKey] : kind || "其他",
    usageType: pacificUsageType(kind, title),
    age: age > 0 ? Math.round(age * 10) / 10 : 0,
    floor: pacificFloor(it.onWhichFloor, it.buildingAboveFloor, it.maxFloor).slice(0, 32),
    features: [...features],
    images: it.pic ? [String(it.pic)] : [],
    video: it.videoLink || it.vrLink || null,
    description: "",
    phone: String(opts.phone ?? "").slice(0, 40),
    sourceUrl: pacificListingUrl(saleId),
    houseolId: houseolIdFromPic(it.pic),
    lat: coord(it.y_POINT),
    lng: coord(it.x_POINT),
    src: "pacific",
  };
}
