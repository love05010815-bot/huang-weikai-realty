/**
 * 迴歸測試：太平洋官網單筆物件 → FB 廣告草稿／591 Listing／地圖賣點（lib/pacific-map.ts ＋ prim-share.ts 的輸入判斷）。
 *
 *   npm run check:pacific
 *
 * ⚠️ 不連網。fixture 照 2026-10-14 實測 GetObjectDetail 的欄位名與格式**自己編值**（假社區、假數字、假人名），
 *    不貼真實物件 —— 這個 repo 是公開的。
 * 🔴 這裡守兩條底線：① 經紀人姓名／手機／認證人這些個資**進不了** PacificDetail；
 *    ② 官網沒給的欄位不准被猜出來（車位型式、完工日、門牌）。
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const { ageYearsFromText, detailFromShare, detailToCatalog, detailToPost591, parkingTypeFromTitle, sanitizeDetail, splitFeatureText } = await import("@/lib/pacific-map.ts");
const { buildAdDraft, buildPoints } = await import("@/lib/houseol-catalog.ts");
const { derive } = await import("@/lib/post591-map.ts");
const { parseListing } = await import("@/lib/post591-parser.ts");
const { isPacificInput, pacificDetailUrl, pacificSaleIdFrom, parsePrimShare } = await import("@/lib/prim-share.ts");

let pass = 0;
const fails = [];
function eq(name, got, want) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) {
    pass += 1;
    return;
  }
  fails.push(`${name}\n      得到 ${a}\n      應為 ${b}`);
}

/* ── 官網 GetObjectDetail 的形狀（值是編的）── */
const RAW = {
  company: "Smart",
  saleID: "S1234567",
  objectName: "「測試花園」近測試國小三房平車",
  cityName: "臺中市",
  areaName: "測試區",
  address: "臺中市測試區測試路",
  sellTotalPrice: 888,
  firstSellTotalPrice: 918,
  layoutRoom: 3,
  layoutHall: 2,
  layoutToilet: 2,
  totalArea: 45.67,
  mainBuildArea: 25.1,
  pubFacilityArea: 12.3,
  outbuildingArea: 3.27,
  ownerStallArea: 5,
  pubStallArea: 0,
  landArea: 10.5,
  hasStall: 1,
  stallTypeName: null,
  objectAge: "3年2個月",
  ageYear: 3.17,
  onWhichFloor: "8",
  buildingAboveFloor: 15,
  maxFloor: 8,
  attributName: "電梯大廈 ",
  objPurposeName: "住家用",
  useStatusName: "空屋",
  useZoning: "住",
  adminFee: 1500,
  payAdminFeeTypeName: "月繳",
  directionName: "南",
  school1: "測試國小,測試國中",
  park: "測試公園",
  market: "測試市場",
  structure: "鋼筋混凝土RC",
  externalWall: "二丁掛",
  objFeature1: "①稀有三房，格局方正➁近測試國小，接送方便➂社區管理好，出入單純",
  pubFacilityRange: 26.9,
  x_POINT: 120.5,
  y_POINT: 24.25,
  // 🔴 這三個是個資，sanitize 之後不准還在
  saleEmployeeName: "王小明",
  saleEmployeePhone: "0912345678",
  storeAuthentication: "李小華",
};
const SHARE = parsePrimShare({
  status: "success",
  data: {
    share_code: "ABCDEFGH",
    total: 1,
    items: [{ obj_no: "S1234567", obj_name: RAW.objectName, price: "8880000", address_short: "臺中市測試區測試路", ping: "45.67", room: "3", living: "2", bathroom: "2", complete_date: "2023-06-15", cover_photo: "https://pacblob.blob.core.windows.net/prim-public/w/x.jpg", sell_rent: 1 }],
  },
}).items[0];
const PHOTOS = ["https://hq.houseol.com.tw/images/pictures/H229AA7654321a.jpg", "https://hq.houseol.com.tw/images/pictures/H229AA7654321b.jpg"];
const extra = { share: SHARE, photos: PHOTOS, fullAddress: null, linkHref: "https://prim.pacific.com.tw/s/ABCDEFGH", houseolId: "AA7654321" };

/* ── sanitize ── */
const d = sanitizeDetail(RAW);
eq("sanitize：讀得到", !!d, true);
eq("sanitize：S 編號", d.saleId, "S1234567");
eq("sanitize：型態去尾空白", d.kind, "電梯大廈");
eq("sanitize：有車位", d.hasStall, true);
eq("sanitize：管理費", [d.adminFee, d.adminFeeCycle], [1500, "月繳"]);
eq("sanitize：朝向", d.direction, "南");
eq("sanitize：座標（x 是經度）", [d.lat, d.lng], [24.25, 120.5]);
eq("sanitize：不是出租", d.isRent, false);
eq("🔴 sanitize：個資一個都不在", JSON.stringify(d).includes("王小明") || JSON.stringify(d).includes("0912345678") || JSON.stringify(d).includes("李小華"), false);
eq("sanitize：沒有 saleID → null", sanitizeDetail({ objectName: "x" }), null);
eq("sanitize：null → null", sanitizeDetail(null), null);
eq("sanitize：hasStall 2 → false", sanitizeDetail({ ...RAW, hasStall: 2 }).hasStall, false);
eq("sanitize：hasStall null → null（沒講）", sanitizeDetail({ ...RAW, hasStall: null }).hasStall, null);
eq("sanitize：沒售價 → 當出租", sanitizeDetail({ ...RAW, sellTotalPrice: 0 }).isRent, true);
/* 單筆 API 沒有 ageYear 數字欄（2026-10-14 實測），屋齡要從「7年7個月」那串字算 */
eq("屋齡字：7年7個月 → 7.58", ageYearsFromText("7年7個月"), 7.58);
eq("屋齡字：3年 → 3", ageYearsFromText("3年"), 3);
eq("屋齡字：未滿一年 → 0.5", ageYearsFromText("未滿一年"), 0.5);
eq("屋齡字：認不得 → null", ageYearsFromText("新成屋"), null);
eq("sanitize：沒 ageYear 就從字算", sanitizeDetail({ ...RAW, ageYear: undefined }).ageYear, 3.17);
eq("sanitize：ageYear 與字都沒有 → null", sanitizeDetail({ ...RAW, ageYear: undefined, objectAge: "" }).ageYear, null);

/* ── 特色拆行 ── */
eq("特色：圈數字拆三行", splitFeatureText(RAW.objFeature1), ["稀有三房，格局方正", "近測試國小，接送方便", "社區管理好，出入單純"]);
eq("特色：換行也拆", splitFeatureText("A社區很棒\n近公園"), ["A社區很棒", "近公園"]);
eq("特色：空 → 空陣列", splitFeatureText(""), []);
eq("車位型式：平車 → 平面", parkingTypeFromTitle("三房平車"), "平面");
eq("車位型式：機械", parkingTypeFromTitle("兩房附機械車位"), "機械");
eq("車位型式：沒寫 → 空", parkingTypeFromTitle("三房"), "");

/* ── → CatalogListing（FB／地圖）── */
const c = detailToCatalog(d, extra);
eq("型錄：案號用愛屋編號", c.caseId, "AA7654321");
eq("型錄：地址去縣市、只到路名", c.address, "測試區測試路");
eq("型錄：社區名用官網的", c.community, "測試花園");
eq("型錄：樓層 8/15", c.floor, "8/15");
eq("型錄：屋齡字用官網的", c.ageText, "3年2個月");
eq("型錄：屋齡數字", c.age, 3.2);
eq("型錄：主＋附屬", c.mainPlusAux, 28.37);
eq("型錄：車位型式從標題來", c.parkingType, "平面");
eq("型錄：車位有問過", c.parkingKnown, true);
eq("型錄：照片是官網那串", c.photos, PHOTOS);
eq("型錄：連結是分享頁", c.catalogUrl, "https://prim.pacific.com.tw/s/ABCDEFGH");
eq("型錄：完整門牌優先", detailToCatalog(d, { ...extra, fullAddress: "測試區測試路 88 號 8 樓" }).address, "測試區測試路 88 號 8 樓");

const ad = buildAdDraft(c);
eq("FB：標題", ad.title, "「測試花園」近測試國小三房平車");
eq("FB：有開價那行", ad.text.includes("💰 開價 888 萬"), true);
eq("FB：有樓別那行", ad.text.includes("🏢 8樓／共 15 樓"), true);
eq("FB：有車位型式", ad.text.includes("🚗 車位：平面"), true);
eq("FB：特色三行", (ad.text.match(/・/g) || []).length, 3);
eq("FB：什麼都沒缺", ad.missing, []);
eq("地圖賣點：一行規格", buildPoints(c)[0], "電梯大廈｜3房2廳2衛｜登記 45.67 坪｜8/15 樓｜屋齡 3.2 年｜含車位｜總價 888 萬");

/* ── → 591 Listing ── */
const L = detailToPost591(d, extra);
eq("591：型別欄位齊全（跟解析器吐的同一組 key）", Object.keys(L).sort(), Object.keys(parseListing("x")).sort());
eq("591：sale", L.deal, "sale");
eq("591：權狀／車位／主／附／公設／地坪", [L.regPing, L.parkPing, L.mainPing, L.attPing, L.pubPing, L.landPing], [45.67, 5, 25.1, 3.27, 12.3, 10.5]);
eq("591：樓層", [L.floorRaw, L.floor, L.total], ["8", 8, 15]);
eq("591：謄本用途", L.usage, "住家用");
eq("591：型態/現況", L.kind, "電梯大廈/空屋");
eq("591：管理費", [L.fee, L.feeCycle], [1500, "月繳"]);
eq("591：完工日從分享 API 來", [L.y, L.m, L.dd], [2023, 6, 15]);
eq("591：朝向", L.facing, "朝南");
eq("591：特色", L.features.length, 3);
eq("591：愛屋編號", L.no, "AA7654321");
eq("591：提醒門牌只到路名", L.warnings.some((w) => w.includes("門牌")), true);
eq("591：有完工日就不提醒完工", L.warnings.some((w) => w.includes("完工")), false);
const dv = derive(L);
eq("591 derive：型態", dv.type, "電梯大樓");
eq("591 derive：法定用途", dv.legal, "住家用");
eq("591 derive：座向", dv.facing, "朝南");
eq("591 derive：民國年", dv.rocY, 112);
eq("591 derive：有車位＋平面", [dv.hasPark, dv.parkSel], [true, "平面式停車位"]);
eq("591 derive：出售樓層", dv.sellFloor, 8);
eq("591 derive：縣市補上", dv.parts.city, "台中市");

/* 沒有分享連結（直接打 S 編號）：沒完工日 → 要提醒；屋齡回推 */
const L2 = detailToPost591(d, { ...extra, share: null, linkHref: pacificDetailUrl("S1234567") });
eq("591：沒完工日 → null", [L2.y, L2.m, L2.dd], [null, null, null]);
eq("591：沒完工日 → 提醒", L2.warnings.some((w) => w.includes("完工")), true);
eq("591 derive：沒完工日用屋齡回推", derive(L2, 2026).rocYEstimated, true);

/* 官網掛掉只有分享 API：空格多但帶得進來 */
const ds = detailFromShare(SHARE);
const L3 = detailToPost591(ds, { ...extra, photos: [SHARE.coverPhoto] });
eq("退路：標題與價格還在", [L3.rawTitle, L3.price], [RAW.objectName, 888]);
eq("退路：樓層不猜", [L3.floor, L3.total], [null, null]);
eq("退路：車位不猜（parkType 空）", L3.parkType, "");
eq("退路：提醒型態要自己點", L3.warnings.some((w) => w.includes("型態")), true);
const c3 = detailToCatalog(ds, { ...extra, photos: [SHARE.coverPhoto] });
eq("退路 FB：車位沒問過 → missing 有車位", buildAdDraft(c3).missing.includes("車位"), true);

/* ── 輸入判斷（prim-share.ts）── */
eq("輸入：分享連結", isPacificInput("https://prim.pacific.com.tw/s/ABCDEFGH"), true);
eq("輸入：官網物件頁", pacificSaleIdFrom("https://www.pacific.com.tw/Object/ObjectDetail/?saleID=S1234567"), "S1234567");
eq("輸入：官網物件頁（小寫 saleid 也認）", pacificSaleIdFrom("https://www.pacific.com.tw/Object/ObjectDetail/?saleid=s1234567"), "S1234567");
eq("輸入：直接打 S 編號", pacificSaleIdFrom(" s1234567 "), "S1234567");
eq("輸入：愛屋案號不是", pacificSaleIdFrom("AA1234567"), null);
eq("🔴 輸入：pacific.com.tw.evil.com 不是", pacificSaleIdFrom("https://www.pacific.com.tw.evil.com/Object/ObjectDetail/?saleID=S1234567"), null);
eq("輸入：愛屋連結不是太平洋", isPacificInput("https://es.houseol.com.tw/Ecatalog.aspx?No=AA1234567"), false);
eq("輸入：空字串", isPacificInput(""), false);
eq("官網物件頁網址", pacificDetailUrl("S1234567"), "https://www.pacific.com.tw/Object/ObjectDetail/?saleID=S1234567");

if (fails.length) {
  console.error(`🔴 ${fails.length} 項不過（通過 ${pass}）：`);
  fails.forEach((f) => console.error("   ✗ " + f));
  process.exit(1);
}
console.log(`✅ 太平洋物件對應規則 ${pass} 項全過`);
