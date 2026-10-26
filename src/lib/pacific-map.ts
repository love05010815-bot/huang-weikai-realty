/**
 * 🏢 太平洋官網「單筆物件」資料 → 三個工具要的形狀 —— **純函式**，不碰網路、不碰資料庫
 *
 * 2026-10-14 他說「FB 社團／591 都換掉」（愛屋改版，三個工具原本都只認愛屋型錄）。
 * 愛屋型錄是抓 HTML 讀字；太平洋這邊有結構化的 JSON：
 *
 *   GET https://www.pacific.com.tw/api/ObjectAPI/GetObjectDetail/<S 編號>   （抓的部分在 lib/pacific-object.ts）
 *   GET https://www.pacific.com.tw/api/ObjectAPI/GetObjectPicture/<S 編號>
 *
 * 回的欄位比愛屋公開型錄還多：主建物／附屬／公設／含車位坪／地坪、公設比、管理費＋繳法、謄本用途、現況、
 * 朝向、學校公園市場、結構、外牆、特色文字、座標、照片全部（愛屋圖床 hq.houseol.com.tw 的網址）。
 * **少的只有「完工日」**（分享連結的 API 有 complete_date，有分享連結就補得到）。
 *
 * 🔴 `sanitizeDetail()` 是唯一的入口：官網回應裡有經紀人姓名、手機、認證人姓名，
 *    **在這裡就丟掉，後面任何一層都拿不到** —— repo 公開、FB 文案會貼出去（見 learning_public_repo_no_pii）。
 * 🔴 讀不到的欄位一律留空／null，**不准用猜的填**：FB 那邊列進 missing、591 那邊紅底要他補。
 *
 * 三個出口：
 *   - `detailToCatalog()`  → 愛屋型錄那種 CatalogListing，FB 廣告草稿（buildAdDraft）與地圖物件賣點（buildPoints）直接沿用
 *   - `detailToPost591()`  → 591 刊登助手的 Listing（跟貼型錄文字解析出來的是同一個型別，後面對應規則全部共用）
 *   - `detailFromShare()`  → 官網 API 掛掉時，只用分享 API 的欄位湊一份 PacificDetail（空格多，但不會整個帶不進來）
 */
import type { CatalogListing } from "@/lib/houseol-catalog";
import type { Listing } from "@/lib/post591-parser";
import { titleFeatures } from "@/lib/match/houseol-parse";
import { pacificFloor } from "@/lib/match/pacific-parse";
import { communityFromTitle, PACIFIC_SALE_ID, primAgeYears, stripCity, type PrimShareItem } from "@/lib/prim-share";

/** 官網 GetObjectDetail 回的欄位（只留我們用的；個資欄位進不來） */
export type PacificDetail = {
  saleId: string;
  title: string;
  community: string;
  cityName: string;
  areaName: string;
  /** 官網給的地址，只到路名：「臺中市梧棲區自強一街」 */
  addressRoad: string;
  /** 總價（萬） */
  price: number | null;
  /** 第一次刊登的總價（萬）；比現價高就是降過價 */
  firstPrice: number | null;
  rooms: number | null;
  halls: number | null;
  baths: number | null;
  /** 建坪（＝登記坪數） */
  totalArea: number | null;
  mainBuildArea: number | null;
  outbuildingArea: number | null;
  pubFacilityArea: number | null;
  /** 含車位坪 */
  ownerStallArea: number | null;
  pubStallArea: number | null;
  landArea: number | null;
  /** 公設比（%） */
  pubFacilityRange: number | null;
  /** 有沒有車位；官網沒給就 null */
  hasStall: boolean | null;
  stallTypeName: string;
  /** 所在樓層原文（「5」「-1」「0」） */
  floor: string;
  totalFloor: number | null;
  maxFloor: string;
  /** 型態：華廈／電梯大廈／透天厝… */
  kind: string;
  /** 現況：空屋／自住／出租中… */
  useStatus: string;
  /** 謄本用途：住家用／住商用… */
  purpose: string;
  useZoning: string;
  /** 官網算好的屋齡字：「7年7個月」 */
  objectAge: string;
  ageYear: number | null;
  /** 管理費（元）＋繳法（月繳／雙月繳…） */
  adminFee: number | null;
  adminFeeCycle: string;
  /** 朝向：東／西南… */
  direction: string;
  school: string;
  park: string;
  market: string;
  structure: string;
  externalWall: string;
  /** 特色文字原文（①②③ 串在一起的那段） */
  feature: string;
  lat: number | null;
  lng: number | null;
  /** 出租型態（官網 rentTypeName：整層(棟)住家／獨立套房／店面商辦…）；買賣物件多半是空字串（2026-10-26） */
  rentType: string;
  /** 沒有售價就當出租 */
  isRent: boolean;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const pos = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && n > 0 ? n : null;
};
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * 官網算好的屋齡字 →（年，小數）。「7年7個月」→ 7.58、「3年」→ 3、「未滿一年」→ 0.5；認不得 → null。
 * GetObjectDetail **沒有** ageYear 這個數字欄（列表 API 才有，2026-10-14 實測），所以屋齡要從這串字算。
 */
export function ageYearsFromText(text: string): number | null {
  const t = String(text ?? "").replace(/\s/g, "");
  if (!t) return null;
  if (/未滿[一1]年/.test(t)) return 0.5;
  const m = t.match(/^(\d+)年(?:(\d+)個?月)?$/);
  if (!m) return null;
  return round2(Number(m[1]) + (m[2] ? Number(m[2]) / 12 : 0));
}

/**
 * 官網 GetObjectDetail 的原始 JSON → PacificDetail。長相不對（沒有 saleID）回 null。
 * 🔴 只挑欄位、不整包複製：saleEmployeeName／saleEmployeePhone／storeAuthentication 那些個資就在這裡被擋下來。
 */
export function sanitizeDetail(raw: unknown): PacificDetail | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const saleId = str(r.saleID).toUpperCase();
  if (!PACIFIC_SALE_ID.test(saleId)) return null;
  const price = pos(r.sellTotalPrice);
  const hasStallRaw = num(r.hasStall);
  return {
    saleId,
    title: str(r.objectName),
    community: str(r.community),
    cityName: str(r.cityName),
    areaName: str(r.areaName),
    addressRoad: str(r.address),
    price,
    firstPrice: pos(r.firstSellTotalPrice),
    rooms: pos(r.layoutRoom),
    halls: num(r.layoutHall) !== null && Number(r.layoutHall) >= 0 ? Number(r.layoutHall) : null,
    baths: num(r.layoutToilet) !== null && Number(r.layoutToilet) >= 0 ? Number(r.layoutToilet) : null,
    totalArea: pos(r.totalArea),
    mainBuildArea: pos(r.mainBuildArea),
    outbuildingArea: pos(r.outbuildingArea),
    pubFacilityArea: pos(r.pubFacilityArea),
    ownerStallArea: pos(r.ownerStallArea),
    pubStallArea: pos(r.pubStallArea),
    landArea: pos(r.landArea),
    pubFacilityRange: pos(r.pubFacilityRange),
    // 官網：1 有車位、2 無車位；其他值當「沒講」
    hasStall: hasStallRaw === 1 ? true : hasStallRaw === 2 ? false : null,
    stallTypeName: str(r.stallTypeName),
    floor: str(r.onWhichFloor),
    totalFloor: pos(r.buildingAboveFloor),
    maxFloor: str(r.maxFloor),
    kind: str(r.attributName),
    useStatus: str(r.useStatusName),
    purpose: str(r.objPurposeName),
    useZoning: str(r.useZoning),
    objectAge: str(r.objectAge),
    // 單筆 API 沒有 ageYear 數字欄；有的話照用，沒有就從「7年7個月」算
    ageYear: pos(r.ageYear) ?? ageYearsFromText(str(r.objectAge)),
    adminFee: pos(r.adminFee),
    adminFeeCycle: str(r.payAdminFeeTypeName),
    direction: str(r.directionName),
    school: str(r.school1),
    park: str(r.park),
    market: str(r.market),
    structure: str(r.structure),
    externalWall: str(r.externalWall),
    feature: str(r.objFeature1),
    lat: num(r.y_POINT),
    lng: num(r.x_POINT),
    rentType: str(r.rentTypeName),
    isRent: price === null,
  };
}

/** 官網 API 掛掉時的退路：只用分享 API 的欄位湊一份（樓層、車位、管理費那些都是空的） */
export function detailFromShare(it: PrimShareItem): PacificDetail {
  return {
    saleId: it.objNo,
    title: it.title,
    community: communityFromTitle(it.title),
    cityName: "",
    areaName: "",
    addressRoad: it.addressShort,
    price: it.price,
    firstPrice: null,
    rooms: it.rooms,
    halls: it.halls,
    baths: it.baths,
    totalArea: it.ping,
    mainBuildArea: null,
    outbuildingArea: null,
    pubFacilityArea: null,
    ownerStallArea: null,
    pubStallArea: null,
    landArea: null,
    pubFacilityRange: null,
    hasStall: null,
    stallTypeName: "",
    floor: "",
    totalFloor: null,
    maxFloor: "",
    kind: "",
    useStatus: "",
    purpose: "",
    useZoning: "",
    objectAge: "",
    ageYear: null,
    adminFee: null,
    adminFeeCycle: "",
    direction: "",
    school: "",
    park: "",
    market: "",
    structure: "",
    externalWall: "",
    feature: "",
    lat: null,
    lng: null,
    rentType: "",
    isRent: it.isRent,
  };
}

/**
 * 官網的特色欄是一整串「①…➁…➂…」，拆成一行一條（FB 的 ✨ 行、591 的描述、單戶頁的特色區都吃這個）。
 * 認得圈數字、黑圈數字、換行、全半形分號、以及他自己打在官網特色欄裡的 ✨★☆（2026-10-20 實測有一戶
 * 整段用 ✨ 分隔、一個圈數字都沒有，不拆就是一整坨）；每條去頭尾的標點。短於 2 個字的丟掉（多半是拆壞的碎片）。
 */
export function splitFeatureText(text: string): string[] {
  return String(text ?? "")
    .split(/[\r\n]+|[①-⑳➀-➉❶-❿⓵-⓾⑴-⒇]|[;；]|[✨★☆]/)
    .map((s) => s.replace(/^[\s✨★☆▪•●◆◇\-–—、,，。.]+/, "").replace(/[\s。]+$/, "").trim())
    .filter((s) => s.length >= 2);
}

/** 標題裡的「平車」「機械」→ 車位型式字（官網 stallTypeName 多半是空的） */
export function parkingTypeFromTitle(title: string): string {
  const f = titleFeatures(title);
  const flat = f.includes("平面車位");
  const mech = f.includes("機械車位");
  if (flat && mech) return "平面+機械";
  if (flat) return "平面";
  if (mech) return "機械";
  return "";
}

/** 官網的數字樓層＋總樓層 → 「5/5」（跟型錄「樓別/樓高」同一種字） */
function floorText(d: PacificDetail): string {
  return pacificFloor(d.floor, d.totalFloor, d.maxFloor || null);
}

export type PacificExtra = {
  /** 分享 API 那一筆（有分享連結才有）：拿完工日、以及官網讀不到時的備援值 */
  share?: PrimShareItem | null;
  /** 照片網址（官網 GetObjectPicture 的順序） */
  photos: string[];
  /** 資料庫 houseol_address 的完整門牌；沒有就 null（地址只到路名） */
  fullAddress?: string | null;
  /** 存進「物件資訊」按鈕的連結（分享連結，或官網物件頁） */
  linkHref: string;
  /** 愛屋編號（照片檔名對回來的）；沒有就空字串 */
  houseolId: string;
};

/** 地址：資料庫的完整門牌 > 官網路名 > 分享 API 路名；一律去掉「臺中市」 */
function pickAddress(d: PacificDetail, x: PacificExtra): string {
  return x.fullAddress?.trim() || stripCity(d.addressRoad) || stripCity(x.share?.addressShort ?? "");
}

function pickAge(d: PacificDetail, x: PacificExtra): number | null {
  if (d.ageYear !== null) return round1(d.ageYear);
  return primAgeYears(x.share?.completeDate ?? null);
}

/**
 * → 愛屋型錄那種 CatalogListing。FB 廣告草稿（buildAdDraft）與地圖物件賣點（buildPoints）直接沿用，
 *   兩邊的格式、「讀不到就列 missing」的規矩一個字都不用改。
 */
export function detailToCatalog(d: PacificDetail, x: PacificExtra): CatalogListing {
  const title = d.title || x.share?.title || "";
  const age = pickAge(d, x);
  const mainPlusAux = d.mainBuildArea !== null && d.outbuildingArea !== null ? round2(d.mainBuildArea + d.outbuildingArea) : null;
  const hasParking = d.hasStall === true || (d.ownerStallArea ?? 0) > 0;
  return {
    caseId: x.houseolId || d.saleId,
    title,
    address: pickAddress(d, x),
    community: d.community || communityFromTitle(title),
    price: d.price ?? x.share?.price ?? null,
    ping: d.totalArea ?? x.share?.ping ?? null,
    rooms: d.rooms ?? x.share?.rooms ?? null,
    halls: d.halls ?? x.share?.halls ?? null,
    baths: d.baths ?? x.share?.baths ?? null,
    floor: floorText(d),
    age,
    // 官網自己算的「7年7個月」優先；沒有就用數字
    ageText: d.objectAge || (age !== null ? (age < 1 ? "未滿 1 年" : `${age} 年`) : ""),
    mainPlusAux,
    kind: d.kind,
    state: d.useStatus,
    hasParking,
    parkingType: hasParking ? d.stallTypeName || parkingTypeFromTitle(title) : "",
    // 官網有講「有／無」才算問過；null 就是沒講
    parkingKnown: d.hasStall !== null,
    nearbySchool: d.school,
    nearbyMarket: d.market,
    nearbyPark: d.park,
    features: splitFeatureText(d.feature),
    lat: d.lat,
    lng: d.lng,
    photos: x.photos,
    catalogUrl: x.linkHref,
  };
}

/** 「2019-01-30」→ { y, m, dd }；沒有或認不得 → 全 null */
function ymd(date: string | null | undefined): { y: number | null; m: number | null; dd: number | null } {
  const m = String(date ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? { y: Number(m[1]), m: Number(m[2]), dd: Number(m[3]) } : { y: null, m: null, dd: null };
}

/**
 * → 591 刊登助手的 Listing（跟貼型錄文字解析出來的同一個型別）。
 * `source` 寫 "houseol"：對應規則裡「型錄沒寫管理費＝無」那條沿用（官網有管理費欄，沒值就是沒有）。
 * 讀不到的格會在確認表上紅底，跟型錄少欄位時一樣。
 */
export function detailToPost591(d: PacificDetail, x: PacificExtra): Listing {
  const title = d.title || x.share?.title || "";
  const address = pickAddress(d, x);
  const floorNum = /^\d+$/.test(d.floor) ? Number(d.floor) : null;
  const hasParking = d.hasStall === true || (d.ownerStallArea ?? 0) > 0;
  const parkType = hasParking ? d.stallTypeName || parkingTypeFromTitle(title) : "";
  const date = ymd(x.share?.completeDate);
  const warnings: string[] = [];
  if (!x.fullAddress) warnings.push("地址只到路名（官網與分享頁都不印門牌號）：③ 的門牌自己補。");
  if (hasParking && !parkType) warnings.push("有車位但官網沒寫型式（平面／機械）：車位型式那格自己選。");
  if (date.y === null) warnings.push("沒有完工日（只有貼分享連結才有）：591 的完工年會用屋齡回推，要確認。");
  if (!d.purpose) warnings.push("官網沒寫謄本用途：法定用途先當住家用，請核對謄本。");
  if (!d.kind) warnings.push("官網讀不到型態（華廈／大樓／透天）：第①頁要自己點。");

  return {
    source: "houseol",
    deal: d.isRent ? "rent" : "sale",
    rent: null,
    deposit: "",
    mainAttPing: d.mainBuildArea !== null && d.outbuildingArea !== null ? round2(d.mainBuildArea + d.outbuildingArea) : null,
    rentCond: { noPets: null, cook: null, feeIncluded: false, parkIncluded: false, noSmoking: false },
    rawTitle: title,
    addr: address,
    no: x.houseolId,
    price: d.price ?? x.share?.price ?? null,
    regPing: d.totalArea ?? x.share?.ping ?? null,
    parkPing: d.ownerStallArea,
    mainPing: d.mainBuildArea,
    attPing: d.outbuildingArea,
    pubPing: d.pubFacilityArea,
    landPing: d.landArea,
    floorRaw: d.floor,
    floor: floorNum,
    floorSub: "",
    total: d.totalFloor,
    room: d.rooms ?? x.share?.rooms ?? null,
    hall: d.halls ?? x.share?.halls ?? null,
    bath: d.baths ?? x.share?.baths ?? null,
    parkType,
    parkNo: "",
    // derive() 看斜線後半當謄本用途（「住家/住商用」→ 住商用）；官網直接給「住家用」，單獨一段也吃得到
    usage: d.purpose,
    // derive() 看前半認型態、後半認現況（「大樓/空屋」）
    kind: [d.kind, d.useStatus].filter(Boolean).join("/"),
    community: d.community || communityFromTitle(title),
    communityGuessed: !d.community,
    fee: d.adminFee,
    feeCycle: d.adminFeeCycle || "月繳",
    y: date.y,
    m: date.m,
    dd: date.dd,
    ageYears: pickAge(d, x),
    school: d.school,
    park: d.park,
    market: d.market,
    // derive() 用「朝X」對 591 的座向選項
    facing: d.direction ? `朝${d.direction}` : "",
    zone: d.useZoning,
    lifeArea: "",
    age: d.objectAge,
    struct: d.structure,
    width: "",
    depth: "",
    households: null,
    features: splitFeatureText(d.feature),
    photos: x.photos,
    warnings,
  };
}
