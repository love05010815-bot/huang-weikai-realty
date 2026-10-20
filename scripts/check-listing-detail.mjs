/**
 * 迴歸測試：單戶物件頁的「物件資料」排版（lib/listing-facts.ts）。
 *
 *   npm run check:listing
 *
 * ⚠️ 不連網。fixture 照 GetObjectDetail 的欄位名**自己編值**（假社區、假數字），不貼真實物件 —— repo 是公開的。
 * 🔴 守的底線：官網沒給的欄位不准出現在畫面上（沒有就整列不畫、整組不畫），不准算每坪單價。
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const { sanitizeDetail } = await import("@/lib/pacific-map.ts");
const {
  adminFeeText,
  ageText,
  completeDateText,
  detailFeatures,
  factGroups,
  floorText,
  keyStats,
  layoutText,
  lifeChips,
  mapsUrl,
  parkingText,
  pingText,
  priceDrop,
} = await import("@/lib/listing-facts.ts");

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
  saleID: "S1234567",
  objectName: "「測試花園」近測試國小三房平車",
  community: "測試花園",
  cityName: "臺中市",
  areaName: "測試區",
  address: "臺中市測試區測試路",
  sellTotalPrice: 888,
  firstSellTotalPrice: 918,
  layoutRoom: 3,
  layoutHall: 2,
  layoutToilet: 2,
  totalArea: "45.67",
  mainBuildArea: "25.1",
  outbuildingArea: "3.2",
  pubFacilityArea: "9.37",
  ownerStallArea: "8.0",
  pubStallArea: null,
  landArea: "6.5",
  pubFacilityRange: "28.5",
  hasStall: 1,
  stallTypeName: null,
  onWhichFloor: "5",
  buildingAboveFloor: 15,
  maxFloor: "0",
  attributName: "電梯大廈 ",
  useStatusName: "空屋",
  objPurposeName: "住家用",
  useZoning: "住宅區",
  objectAge: "7年7個月",
  adminFee: 2500,
  payAdminFeeTypeName: "月繳",
  directionName: "東南",
  school1: "測試國小",
  park: "測試公園",
  market: "",
  structure: "鋼筋混凝土",
  externalWall: "二丁掛",
  objFeature1: "①邊間採光好➁近測試國小③平面車位好停",
  x_POINT: "120.5",
  y_POINT: "24.25",
  saleEmployeeName: "假經紀人",
  saleEmployeePhone: "0900000000",
};
const d = sanitizeDetail(RAW);
const share = { objNo: "S1234567", title: RAW.objectName, price: 888, addressShort: RAW.address, ping: 45.67, rooms: 3, halls: 2, baths: 2, completeDate: "2019-01-30", coverPhoto: null, isRent: false };

/* ── 小工具 ── */
eq("坪數格式", pingText(45.67), "45.67 坪");
eq("坪數 null 不寫", pingText(null), "");
eq("格局", layoutText(3, 2, 2), "3房2廳2衛");
eq("沒房數就不寫格局（不寫成 0房）", layoutText(null, 2, 1), "");
eq("樓層 5/15", floorText({ floor: "5", totalFloor: 15, maxFloor: "0" }), "5 樓／共 15 樓");
eq("樓層 透天整棟", floorText({ floor: "0", totalFloor: 3, maxFloor: "" }), "1-3 樓／共 3 樓");
eq("樓層 地下", floorText({ floor: "-1", totalFloor: 14, maxFloor: "" }), "B1／共 14 樓");
eq("樓層 沒資料", floorText({ floor: "", totalFloor: null, maxFloor: "" }), "");
eq("屋齡：官網字優先", ageText({ objectAge: "7年7個月", ageYear: 7.58 }, share), "7年7個月");
eq("屋齡：沒字用完工日算", ageText({ objectAge: "", ageYear: null }, share).startsWith("約 "), true);
eq("屋齡：什麼都沒有", ageText({ objectAge: "", ageYear: null }, null), "");
eq("車位：有＋型式從標題＋坪數", parkingText(d), "有（平面），8 坪");
eq("車位：官網說無", parkingText({ hasStall: false, ownerStallArea: null, stallTypeName: "", title: "x" }), "無");
eq("車位：官網沒講就不寫", parkingText({ hasStall: null, ownerStallArea: null, stallTypeName: "", title: "x" }), "");
eq("管理費", adminFeeText(d), "2,500 元／月繳");
eq("管理費 null", adminFeeText({ adminFee: null, adminFeeCycle: "月繳" }), "");
eq("完工日", completeDateText("2019-01-30"), "2019 年 1 月 30 日");
eq("完工日 null", completeDateText(null), "");
eq("降價", priceDrop(d), { from: 918, to: 888, diff: 30 });
eq("沒降價", priceDrop({ price: 888, firstPrice: 888 }), null);
eq("漲價不算降價", priceDrop({ price: 918, firstPrice: 888 }), null);
eq("地圖連結", mapsUrl(24.25, 120.5), "https://www.google.com/maps?q=24.25,120.5");
eq("沒座標沒連結", mapsUrl(null, 120.5), "");

/* ── 四格 ── */
eq(
  "四格一眼看",
  keyStats(d, share),
  [
    { label: "建坪", value: "45.67 坪" },
    { label: "格局", value: "3房2廳2衛" },
    { label: "樓層", value: "5 樓／共 15 樓" },
    { label: "屋齡", value: "7年7個月" },
  ],
);

/* ── 三組 ── */
const groups = factGroups(d, share);
eq("三組都有", groups.map((g) => g.title), ["基本資料", "坪數明細", "建物與管理"]);
const basic = Object.fromEntries(groups[0].rows.map((r) => [r.label, r.value]));
eq("基本資料：型態去尾巴空白", basic["型態"], "電梯大廈");
eq("基本資料：地址去掉臺中市", basic["地址"], "測試區測試路");
eq("基本資料：朝向加「朝」", basic["朝向"], "朝東南");
eq("基本資料：現況", basic["現況"], "空屋");
const area = Object.fromEntries(groups[1].rows.map((r) => [r.label, r.value]));
eq("坪數明細：公設比", area["公設比"], "28.5%");
eq("坪數明細：土地", area["土地坪數"], "6.5 坪");
const mgmt = Object.fromEntries(groups[2].rows.map((r) => [r.label, r.value]));
eq("建物與管理：完工日來自分享 API", mgmt["完工日"], "2019 年 1 月 30 日");
eq("建物與管理：外牆", mgmt["外牆建材"], "二丁掛");
eq("每坪單價不准出現", JSON.stringify(groups).includes("單價"), false);
eq("個資不准出現", JSON.stringify(groups).includes("假經紀人"), false);

/* 官網掛掉、只有分享 API 的那種：空格多，整組空的要消失 */
const { detailFromShare } = await import("@/lib/pacific-map.ts");
const thin = detailFromShare(share);
const thinGroups = factGroups(thin, share);
eq("分享版只剩有值的群組", thinGroups.map((g) => g.title), ["基本資料", "坪數明細", "建物與管理"]);
eq("分享版基本資料只有社區／地址／格局／屋齡", thinGroups[0].rows.map((r) => r.label), ["社區", "地址", "格局", "屋齡"]);
eq("分享版建物與管理只有完工日", thinGroups[2].rows.map((r) => r.label), ["完工日"]);
const bare = detailFromShare({ ...share, completeDate: null, ping: null, rooms: null, halls: null, baths: null, title: "沒引號的標題", addressShort: "" });
eq("什麼都沒有就一組都不畫", factGroups(bare, null), []);
eq("什麼都沒有四格也空", keyStats(bare, null), []);

/* ── 生活機能、特色 ── */
eq("生活機能：市場空的不出現", lifeChips(d), [
  { label: "學校", value: "測試國小" },
  { label: "公園", value: "測試公園" },
]);
eq("特色拆行", detailFeatures(d), ["邊間採光好", "近測試國小", "平面車位好停"]);
eq("特色：整段用 ✨ 分隔的也拆", detailFeatures({ feature: "臨十米路角間。 ✨四房間間套房。 ✨配有電梯可停雙車" }), ["臨十米路角間", "四房間間套房", "配有電梯可停雙車"]);
eq("特色空的", detailFeatures({ feature: "" }), []);

/* ── 結果 ── */
if (fails.length) {
  console.error(`❌ ${fails.length} 項失敗（${pass} 項通過）\n`);
  for (const f of fails) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log(`✅ check:listing 全部通過（${pass} 項）`);
