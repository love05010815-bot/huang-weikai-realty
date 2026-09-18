/**
 * 解析愛屋店網（www.houseol.com.tw）物件列表的 HTML 片段 —— 純函式
 *
 * 店網列表是前端用 AJAX 跟 /Function/Ajax/SearchObj.aspx 拿的，回應長這樣：
 *   `總筆數$@$條件列HTML$@$物件列表HTML`
 * 物件列表是一堆 <li class='house_block'>，每一筆的欄位都有固定的標籤可以抓
 * （<span>格局</span>3房 2廳 2衛</h4> 這種），所以用正則就夠了，不用引 HTML parser。
 *
 * ⚠️ 依賴愛屋的網頁結構。他們改版時這裡要跟著調；scripts/check-match.mjs 用
 *    scripts/fixtures/houseol-page1.html（2026-09-15 抓下來的真實頁面）當回歸測試。
 *
 * ⚠️ 這個檔刻意不 import 任何 "@/..." 的東西，node 直接載得起來（同上面的測試）。
 */

const SITE = "https://www.houseol.com.tw";

export type RawHouseolItem = {
  /** 愛屋物件編號，例如 AA6260018（favorites 的 name='H229$AA6260018'） */
  objId: string;
  /** 店碼（網址 /sell_item/H229-S.../ 的 H229） */
  storeCode: string;
  url: string;
  title: string;
  community: string;
  /** 萬 */
  price: number;
  /** 降價前的總價（萬），沒有降價就是 0 */
  originalPrice: number;
  /** 總價旁邊的小字，例如「(含車位價)」 */
  priceNote: string;
  features: string[];
  /** 例如「台中市沙鹿區光華路」 */
  address: string;
  unitPrice: number;
  /** 例如「3房 2廳 2衛」 */
  layout: string;
  /** 建坪（土地物件沒有，會是 0） */
  size: number;
  /** 地坪（土地物件才有；住宅多半沒列） */
  landSize: number;
  age: number;
  floor: string;
  /** 店網的「型態」：華廈／大樓／公寓／透天／別墅／套房／土地… */
  kind: string;
  /** 店網的「類別」：住家／店面／辦公… */
  usage: string;
  phone: string;
  youtube: string;
  images: string[];
};

/** 店網的型態 → 表單的類型（MATCH_TYPES） */
export const TYPE_MAP: Record<string, string> = {
  華廈: "華廈",
  大樓: "電梯大樓",
  公寓: "公寓",
  透天: "透天厝",
  別墅: "透天厝",
  套房: "套房",
  土地: "土地",
  農舍: "農舍",
};

/** 店網的特色標籤 → 表單的需求標籤；沒列的原樣保留（配對只認買方勾的那幾個，多的不影響） */
export const FEATURE_MAP: Record<string, string> = {
  近學校: "學區",
  近捷運: "近捷運",
  近捷運站: "近捷運",
  近火車站: "近捷運",
  近車站: "近捷運",
  近公園: "近公園",
};

const clean = (s: string | undefined | null): string =>
  String(s ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

const num = (s: string | undefined | null): number => {
  const n = parseFloat(String(s ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** <h4><span>標籤</span>內容</h4> 的內容 */
function field(block: string, label: string): string {
  const m = block.match(new RegExp("<span>" + label + "</span>(.*?)</h4>", "s"));
  return m ? clean(m[1]) : "";
}

/** 把 SearchObj.aspx 的回應切成 { total, html } */
export function splitResponse(text: string): { total: number; html: string } {
  const parts = String(text).split("$@$");
  return { total: num(parts[0]), html: parts[2] ?? parts[parts.length - 1] ?? "" };
}

/** 從物件列表 HTML 解析出每一筆的原始欄位 */
export function parseBlocks(html: string): RawHouseolItem[] {
  const blocks = String(html).split(/<li class=['"]house_block['"]>/).slice(1);
  const items: RawHouseolItem[] = [];
  for (const block of blocks) {
    // href 長這樣：/sell_item/H229-S2413795/?storeid=4817 —— 取到 ? 之前（含尾端斜線，下面再去掉）
    const link = block.match(/<a href="(\/sell_item\/[^"?]+)\??[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    const objId = block.match(/class=['"]favorites['"] name=['"][^'"$]*\$([A-Za-z0-9]+)['"]/)?.[1] ?? "";
    if (!link || !objId) continue;
    const path = link[1].replace(/\/$/, "");
    const storeCode = path.match(/\/sell_item\/([^-/]+)-/)?.[1] ?? "";
    const photos = [...block.matchAll(/<img oid="[^"]+" src="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/nopic/.test(u));
    const mainImg = block.match(/<img src='([^']+)' class='image featured'/)?.[1];
    const youtube = block.match(/href='(\/\/www\.youtube\.com\/embed\/[^'?]+)/)?.[1];
    const ageText = field(block, "屋齡");
    items.push({
      objId,
      storeCode,
      url: `${SITE}${path}/`,
      title: clean(link[2]),
      community: clean(block.match(/class="commu">([\s\S]*?)<\/a>/)?.[1]),
      price: num(block.match(/<span class='discount'>([^<]*)<\/span>/)?.[1]),
      originalPrice: num(block.match(/<span class='discount-del'>([^<]*)<\/span>/)?.[1]),
      priceNote: clean(block.match(/<span class='discount'>[^<]*<\/span><span>萬<\/span>\s*(?:<span[^>]*>)?([^<]*)/)?.[1]),
      features: [...block.matchAll(/<ul class='item_features'>([\s\S]*?)<\/ul>/g)].flatMap((m) =>
        [...m[1].matchAll(/<li>([^<]*)<\/li>/g)].map((x) => clean(x[1])),
      ),
      address: clean(block.match(/<dd class='ShowBuy'>[\s\S]*?<h3>([\s\S]*?)<\/h3>/)?.[1]),
      unitPrice: num(field(block, "單價")),
      layout: field(block, "格局"),
      size: num(field(block, "建坪")),
      landSize: num(field(block, "地坪")),
      // 「未滿一年」解析出來會是 0，改成 0.5 讓它仍然算「新」但不會顯示成 0 年
      age: /未滿/.test(ageText) ? 0.5 : num(ageText),
      floor: field(block, "樓層").replace(/\s+/g, ""),
      kind: field(block, "型態"),
      usage: field(block, "類別"),
      phone: block.match(/href='tel:([^']+)'/)?.[1] ?? "",
      youtube: youtube ? `https:${youtube}` : "",
      images: [...new Set([mainImg, ...photos].filter((u): u is string => Boolean(u)).map((u) => (u.startsWith("//") ? `https:${u}` : u)))],
    });
  }
  return items.filter((r) => r.title);
}

/** 把「台中市沙鹿區光華路462號」拆成 縣市 / 行政區 / 其餘 */
export function splitAddress(addr: string): { city: string; district: string; address: string } {
  const m = String(addr ?? "").match(/^(.{2,3}?[市縣])(.{1,3}?[區鄉鎮市])(.*)$/);
  return m ? { city: m[1], district: m[2], address: m[3].trim() } : { city: "", district: "", address: String(addr ?? "") };
}

/** 存進 match_listing 的一筆（欄位名跟資料表一致，見 lib/match/store.ts） */
export type ListingUpsert = {
  id: string;
  storeId: string;
  storeCode: string;
  title: string;
  city: string;
  district: string;
  address: string;
  price: number;
  originalPrice: number | null;
  unitPrice: number | null;
  rooms: number;
  halls: number;
  baths: number;
  /** 拿來配對坪數的數字：住宅用建坪，土地沒有建坪就用地坪 */
  size: number;
  /** 地坪，只有土地類會有；畫面上「地坪 X 坪」用它 */
  landSize: number;
  type: string;
  usageType: string;
  age: number;
  floor: string;
  features: string[];
  images: string[];
  video: string | null;
  description: string;
  phone: string;
  sourceUrl: string;
};

/** 原始欄位 → 資料表的一筆 */
export function toListingUpsert(raw: RawHouseolItem, storeId: string): ListingUpsert {
  const { city, district, address } = splitAddress(raw.address);
  const layout = raw.layout.match(/(\d+)\s*房\s*(\d+)\s*廳\s*(\d+)\s*衛/);
  const typeKey = Object.keys(TYPE_MAP).find((k) => raw.kind.includes(k));
  const features = new Set(raw.features.map((f) => FEATURE_MAP[f] ?? f));
  if (/車位/.test(raw.priceNote) || /車位|平車|坡平|機械/.test(raw.title)) features.add("車位");
  // 平面／機械店網沒有獨立欄位，只能看標題。海線的寫法是「平車」（＝平面車位），
  // 278 筆裡沒有一筆寫機械。判斷不出來的就只留「車位」，別亂貼標籤 ——
  // 配對時買方要「平面車位」會把只標「車位」的也算進來（見 matcher 的 featureSatisfied）。
  // 「機車位」是機車停車位，跟「機械」不會互相誤判。
  if (/平車|平面車|坡平|坡道平面/.test(raw.title)) features.add("平面車位");
  if (/機械/.test(raw.title)) features.add("機械車位");
  if (/大樓|華廈/.test(raw.kind) || /電梯/.test(raw.title)) features.add("電梯");
  if (/裝潢|精裝|全新整理/.test(raw.title)) features.add("含裝潢");
  return {
    id: raw.objId,
    storeId: String(storeId),
    storeCode: raw.storeCode,
    title: raw.title.slice(0, 255),
    city,
    district,
    address: address.slice(0, 255),
    price: raw.price,
    originalPrice: raw.originalPrice || null,
    unitPrice: raw.unitPrice || null,
    rooms: layout ? Number(layout[1]) : 0,
    halls: layout ? Number(layout[2]) : 0,
    baths: layout ? Number(layout[3]) : 0,
    size: raw.size || raw.landSize,
    landSize: raw.landSize,
    type: typeKey ? TYPE_MAP[typeKey] : raw.kind || "其他",
    usageType: raw.usage,
    age: raw.age,
    floor: raw.floor.slice(0, 32),
    features: [...features],
    images: raw.images.slice(0, 20),
    video: raw.youtube || null,
    description: [raw.community, raw.features.join("、")].filter(Boolean).join("｜"),
    phone: raw.phone.slice(0, 40),
    sourceUrl: raw.url,
  };
}
