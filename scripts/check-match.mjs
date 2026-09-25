/**
 * 買方配對：配對引擎 ＋ 愛屋店網解析 的回歸測試
 *
 *   npm run check:match
 *
 * 解析用的樣本 scripts/fixtures/houseol-page1.html 是 2026-09-15 從店網（storeid 4817）
 * 抓下來的真實第一頁。愛屋改版時先跑這個，壞了就知道要改 lib/match/houseol-parse.ts。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 名片卡那幾項要載 lib/match/line.ts，它會 import "@/config/..." 與隔壁的 ./agents，
// 所以得掛上別名／替身解析（見 scripts/alias-hooks.mjs）。stub 要後註冊，後註冊的先跑。
register("./alias-hooks.mjs", import.meta.url);
register("./stub-hooks.mjs", import.meta.url);
// SITE_URL 是模組載入當下就決定的，要在 import line.ts 之前設好
process.env.APPOINTMENT_BASE_URL = "https://weikaihouse.com";
import {
  AGE_RANGES,
  describePreference,
  floorOf,
  landCategoryOf,
  normalizePreference,
  rankListings,
  scoreListing,
  WEIGHTS,
} from "../src/lib/match/matcher.ts";
import { detectPriceChanges } from "../src/lib/match/diff.ts";
import { parseBlocks, splitAddress, splitResponse, toListingUpsert } from "../src/lib/match/houseol-parse.ts";
import { createBuyerToken, verifyBuyerToken } from "../src/lib/match/token.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "fixtures", "houseol-page1.html"), "utf8");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✔ ${name}`);
  } catch (e) {
    console.error(`✖ ${name}\n  ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  }
}

const PREF = { city: "台中市", districts: ["沙鹿區", "梧棲區"], budgetMax: 1500, rooms: 3, sizeMin: 25, sizeMax: 45, types: ["電梯大樓", "華廈"], maxAge: 20, features: ["車位"] };

test("matcher：完全符合 100 分、不限條件 100 分、明顯不符很低", () => {
  const perfect = { city: "台中市", district: "沙鹿區", price: 980, rooms: 3, size: 33, type: "華廈", age: 12, features: ["車位", "電梯"] };
  const poor = { city: "桃園市", district: "中壢區", price: 5000, rooms: 5, size: 68, type: "透天厝", age: 22, features: [] };
  assert.equal(scoreListing(PREF, perfect).score, 100);
  assert.equal(scoreListing({}, poor).score, 100);
  assert.ok(scoreListing(PREF, poor).score < 30);
});

test("matcher：其他縣市即使條件全符合也不超過 45 分", () => {
  const otherCity = { city: "桃園市", district: "桃園區", price: 980, rooms: 3, size: 33, type: "華廈", age: 12, features: ["車位"] };
  assert.ok(scoreListing(PREF, otherCity).score <= 45);
});

test("matcher：normalizePreference 對亂資料不會炸", () => {
  const p = normalizePreference({ city: 123, districts: "沙鹿區,梧棲區", budgetMax: "abc", rooms: -1, types: null });
  assert.equal(p.city, "123");
  assert.deepEqual(p.districts, ["沙鹿區", "梧棲區"]);
  assert.equal(p.budgetMax, 0);
  assert.equal(p.rooms, 0);
  assert.deepEqual(p.types, []);
  assert.equal(describePreference(PREF), "台中市沙鹿區/梧棲區 · 預算 1,500 萬內 · 3 房 · 25–45 坪 · 電梯大樓/華廈 · 屋齡 20 年內 · 車位");
});

test("splitResponse：拆出總筆數與物件 HTML", () => {
  const r = splitResponse("275$@$<ul><li>條件</li></ul>$@$<ul><li class='house_block'>x</li></ul>");
  assert.equal(r.total, 275);
  assert.ok(r.html.includes("house_block"));
});

test("parseBlocks：真實頁面 10 筆，欄位完整", () => {
  const items = parseBlocks(html);
  assert.equal(items.length, 10);
  const it = items.find((x) => x.objId === "AA6260018");
  assert.ok(it, "應包含 AA6260018");
  assert.equal(it.title, "【家樂福臨路邊間金店住】");
  assert.equal(it.storeCode, "H229");
  assert.equal(it.url, "https://www.houseol.com.tw/sell_item/H229-S2413795/");
  assert.equal(it.price, 1688);
  assert.equal(it.address, "台中市沙鹿區光華路");
  assert.equal(it.layout, "6房 3廳 3衛");
  assert.equal(it.size, 70.49);
  assert.equal(it.age, 32.5);
  assert.equal(it.floor, "B1-4/4");
  assert.equal(it.kind, "透天");
  assert.equal(it.usage, "店面");
  assert.equal(it.unitPrice, 23.95);
  assert.equal(it.phone, "04-26572100");
  assert.deepEqual(it.features, ["近學校", "近市場", "近公園", "近醫療機構"]);
  assert.ok(it.images.length >= 8);
  assert.ok(it.images.every((u) => u.startsWith("https://") && !/nopic/.test(u)));
  assert.equal(items.filter((x) => x.layout && x.size > 0).length, items.length, "每筆都應有格局與坪數");
});

test("toListingUpsert：轉成資料表格式並對應類型／需求標籤", () => {
  const it = parseBlocks(html).find((x) => x.objId === "AA6260018");
  const l = toListingUpsert(it, "4817");
  assert.equal(l.id, "AA6260018");
  assert.equal(l.storeId, "4817");
  assert.equal(l.storeCode, "H229");
  assert.equal(l.city, "台中市");
  assert.equal(l.district, "沙鹿區");
  assert.equal(l.address, "光華路");
  assert.equal(l.rooms, 6);
  assert.equal(l.halls, 3);
  assert.equal(l.baths, 3);
  assert.equal(l.type, "透天厝");
  assert.equal(l.usageType, "店面");
  assert.ok(l.features.includes("學區"));
  assert.ok(l.features.includes("近公園"));
  assert.equal(l.phone, "04-26572100");
});

test("rankListings：真實頁面只回完全符合的，而且分數遞減", () => {
  const listings = parseBlocks(html).map((it) => toListingUpsert(it, "4817"));
  const ranked = rankListings({ city: "台中市", districts: ["沙鹿區"], rooms: 3 }, listings);
  // 2026-09-25 起不符合條件的不會回來，所以一定比全部少
  assert.ok(ranked.length > 0, "不該一間都不剩");
  assert.ok(ranked.length < listings.length, `應該濾掉一些：${ranked.length}/${listings.length}`);
  for (const m of ranked) {
    assert.equal(m.listing.district, "沙鹿區");
    assert.equal(m.listing.rooms, 3);
    assert.equal(m.disqualified, false);
  }
  for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i - 1].score >= ranked[i].score);
  assert.ok(ranked[0].reasons.length > 0);
});

test("splitAddress：縣市／行政區／路名", () => {
  assert.deepEqual(splitAddress("台中市沙鹿區光華路462號"), { city: "台中市", district: "沙鹿區", address: "光華路462號" });
  assert.deepEqual(splitAddress("新北市板橋區文化路一段"), { city: "新北市", district: "板橋區", address: "文化路一段" });
  assert.deepEqual(splitAddress("彰化縣田尾鄉新興路"), { city: "彰化縣", district: "田尾鄉", address: "新興路" });
  assert.deepEqual(splitAddress("新竹市東區中華路一段"), { city: "新竹市", district: "東區", address: "中華路一段" });
});

// ---------------------------------------------------------------- 買方識別碼
//
// 這是「從 LINE 點進配對頁的人對得回同一筆買方」的關鍵。簽壞了不會有人發現 ——
// 買方只會覺得「我明明改過條件，怎麼還是推舊的給我」，所以這裡測死。

test("買方識別碼：簽得出來、驗得回同一個編號", () => {
  process.env.APPOINTMENT_TOKEN_SECRET = "check-match-secret";
  const id = "11111111-2222-3333-4444-555555555555";
  const token = createBuyerToken(id);
  assert.ok(token, "應該簽得出識別碼");
  assert.equal(verifyBuyerToken(token), id);
});

test("買方識別碼：被改過、過期、換密鑰、亂填一律回 null", () => {
  process.env.APPOINTMENT_TOKEN_SECRET = "check-match-secret";
  const id = "11111111-2222-3333-4444-555555555555";
  const token = createBuyerToken(id);

  // 改內容（換成別人的買方編號）簽章就對不上
  const tampered = `22222222-2222-3333-4444-555555555555.${token.split(".").slice(1).join(".")}`;
  assert.equal(verifyBuyerToken(tampered), null);

  // 只改簽章
  assert.equal(verifyBuyerToken(`${token.slice(0, -3)}aaa`), null);

  // 過期
  assert.equal(verifyBuyerToken(createBuyerToken(id, -1)), null);

  // 換了密鑰，舊連結就失效
  process.env.APPOINTMENT_TOKEN_SECRET = "another-secret";
  assert.equal(verifyBuyerToken(token), null);
  process.env.APPOINTMENT_TOKEN_SECRET = "check-match-secret";

  // 亂填
  assert.equal(verifyBuyerToken(""), null);
  assert.equal(verifyBuyerToken(null), null);
  assert.equal(verifyBuyerToken("abc"), null);
  assert.equal(verifyBuyerToken("not-a-uuid.9999999999.xxxx"), null);
});

test("買方識別碼：買方編號格式不對就不簽", () => {
  process.env.APPOINTMENT_TOKEN_SECRET = "check-match-secret";
  assert.equal(createBuyerToken("abc"), null);
  assert.equal(createBuyerToken(""), null);
});

// ---------------------------------------------------------------- 2026-09-18 新增的條件
//
// 樓層級距、土地類別、平面／機械車位、土地坪數。這幾項都會安靜地算錯 ——
// 買方只會覺得「推薦的怎麼都不對」，不會有任何錯誤訊息，所以這裡測死。

/** 評分用的物件；新欄位有預設值，舊測試不用改 */
const listing = (o = {}) => ({
  city: "台中市",
  district: "沙鹿區",
  price: 900,
  rooms: 3,
  size: 30,
  type: "電梯大樓",
  age: 5,
  features: ["電梯"],
  floor: "8/15",
  landSize: 0,
  usageType: "住家",
  ...o,
});

test("權重加起來剛好 100（少一分多一分都會讓滿分不是滿分）", () => {
  assert.equal(
    Object.values(WEIGHTS).reduce((a, b) => a + b, 0),
    100,
  );
});

test("floorOf：14/15 取 14、透天 1-4/4 取 1、土地的「/」取 0", () => {
  assert.equal(floorOf("14/15"), 14);
  assert.equal(floorOf("1-4/4"), 1);
  assert.equal(floorOf("/"), 0);
  assert.equal(floorOf(""), 0);
  assert.equal(floorOf(null), 0);
});

test("希望樓層：級距邊界兩邊都含，沒有樓層資料給一半不是 0", () => {
  const wantMid = { floor: "mid" }; // 5–10 樓
  assert.ok(scoreListing(wantMid, listing({ floor: "8/15" })).reasons.some((r) => r.includes("樓層符合")));
  assert.ok(scoreListing(wantMid, listing({ floor: "5/15" })).reasons.some((r) => r.includes("樓層符合")));
  assert.ok(scoreListing(wantMid, listing({ floor: "10/15" })).reasons.some((r) => r.includes("樓層符合")));
  assert.ok(scoreListing(wantMid, listing({ floor: "12/15" })).misses.some((m) => m.includes("樓層不符")));

  // 10 樓同時屬於「5–10」與「10–15」
  assert.ok(scoreListing({ floor: "high" }, listing({ floor: "10/15" })).reasons.some((r) => r.includes("樓層符合")));

  // 沒有樓層的（土地）只扣一半，不能把整批土地洗掉
  const noFloor = scoreListing(wantMid, listing({ floor: "/" }));
  const wrongFloor = scoreListing(wantMid, listing({ floor: "12/15" }));
  assert.ok(noFloor.score > wrongFloor.score, `沒樓層 ${noFloor.score} 應該高於樓層不符 ${wrongFloor.score}`);
});

test("landCategoryOf：農建地要先判斷，不能被「農」先接走", () => {
  assert.equal(landCategoryOf("土地:農建地"), "農建地");
  assert.equal(landCategoryOf("土地:農地"), "農地");
  assert.equal(landCategoryOf("土地:農牧用地"), "農地");
  assert.equal(landCategoryOf("土地:建地"), "建地");
  assert.equal(landCategoryOf("土地:住宅用地"), "建地");
  assert.equal(landCategoryOf("土地:商業地"), "商業地");
  assert.equal(landCategoryOf("土地:其他"), "");
  assert.equal(landCategoryOf("住家"), "");
  assert.equal(landCategoryOf("廠房:其他"), "");
});

test("土地類別：要農地時，建地拿不到那一半的類型分", () => {
  const pref = { types: ["土地"], landCategories: ["農地"] };
  const farm = listing({ type: "土地", usageType: "土地:農地", floor: "/", landSize: 300, size: 300 });
  const build = listing({ type: "土地", usageType: "土地:建地", floor: "/", landSize: 300, size: 300 });
  const a = scoreListing(pref, farm);
  const b = scoreListing(pref, build);
  assert.ok(a.reasons.some((r) => r.includes("土地類別符合（農地）")));
  assert.ok(b.misses.some((m) => m.includes("土地類別不符（建地）")));
  assert.ok(a.score > b.score, `農地 ${a.score} 應該高於建地 ${b.score}`);
});

test("平面／機械車位：只標「車位」算平面、不算機械", () => {
  const onlyParking = listing({ features: ["車位", "電梯"] });
  const flat = listing({ features: ["車位", "平面車位"] });
  const mech = listing({ features: ["車位", "機械車位"] });

  assert.ok(scoreListing({ features: ["平面車位"] }, onlyParking).reasons.some((r) => r.includes("平面車位")));
  assert.ok(scoreListing({ features: ["平面車位"] }, flat).reasons.some((r) => r.includes("平面車位")));
  assert.ok(scoreListing({ features: ["機械車位"] }, onlyParking).misses.some((m) => m.includes("機械車位")));
  assert.ok(scoreListing({ features: ["機械車位"] }, mech).reasons.some((r) => r.includes("機械車位")));
  // 明講機械的，就不能再被當成平面
  assert.ok(scoreListing({ features: ["平面車位"] }, mech).misses.some((m) => m.includes("平面車位")));
});

test("土地坪數：範圍內滿分、差一點給一半、沒有地坪資料算不符", () => {
  const pref = { landMin: 100, landMax: 200 };
  assert.ok(scoreListing(pref, listing({ landSize: 150 })).reasons.some((r) => r.includes("土地坪數符合")));
  assert.ok(scoreListing(pref, listing({ landSize: 210 })).misses.some((m) => m.includes("略有出入")));
  assert.ok(scoreListing(pref, listing({ landSize: 500 })).misses.some((m) => m.includes("土地坪數不符")));
  assert.ok(scoreListing(pref, listing({ landSize: 0 })).misses.some((m) => m.includes("沒有土地坪數資料")));
});

test("describePreference：新欄位會出現在摘要裡", () => {
  const s = describePreference({
    city: "台中市",
    types: ["土地"],
    landCategories: ["農地", "建地"],
    landMin: 100,
    floor: "low",
    features: ["平面車位"],
  });
  assert.ok(s.includes("5 樓以下"), s);
  assert.ok(s.includes("地坪 100–不限 坪"), s);
  assert.ok(s.includes("農地/建地"), s);
  assert.ok(s.includes("平面車位"), s);
});

test("解析：標題有「平車」就標平面車位，沒有機械字樣就不標機械", () => {
  const items = parseBlocks(html).map((it) => toListingUpsert(it, "4817"));
  const flat = items.filter((i) => i.features.includes("平面車位"));
  assert.ok(flat.length > 0, "這一頁應該有帶平車的物件");
  for (const i of flat) assert.ok(/平車|平面車|坡平/.test(i.title), `${i.title} 不該被標平面車位`);
  for (const i of items) {
    if (i.features.includes("機械車位")) assert.ok(/機械/.test(i.title), `${i.title} 不該被標機械車位`);
  }
});

test("屋齡改成真區間：選 5–10 年時新成屋不算符合", () => {
  const pref = { ageRange: "a5" }; // 5–10 年
  assert.ok(scoreListing(pref, listing({ age: 7 })).reasons.some((r) => r.includes("屋齡 7 年符合")));
  assert.ok(scoreListing(pref, listing({ age: 0.5 })).misses.some((m) => m.includes("屋齡不符")));
  assert.ok(scoreListing(pref, listing({ age: 25 })).misses.some((m) => m.includes("屋齡不符")));
  // 邊界兩端都含：10 年同時屬於 5–10 與 10–15
  assert.ok(scoreListing(pref, listing({ age: 10 })).reasons.some((r) => r.includes("屋齡")));
  assert.ok(scoreListing({ ageRange: "a10" }, listing({ age: 10 })).reasons.some((r) => r.includes("屋齡")));
  // 30 年以上沒有上界
  assert.ok(scoreListing({ ageRange: "a30" }, listing({ age: 55 })).reasons.some((r) => r.includes("屋齡 55 年符合")));
});

test("屋齡：店網沒給屋齡的（土地）只扣一半，不是當成新成屋", () => {
  const noAge = scoreListing({ ageRange: "a0" }, listing({ age: 0 }));
  const wrongAge = scoreListing({ ageRange: "a0" }, listing({ age: 30 }));
  assert.ok(noAge.misses.some((m) => m.includes("沒有屋齡資料")));
  assert.ok(noAge.score > wrongAge.score, `沒屋齡 ${noAge.score} 應該高於屋齡不符 ${wrongAge.score}`);
  // 真的新成屋（解析時記 0.5）要算在 0–5 年裡
  assert.ok(scoreListing({ ageRange: "a0" }, listing({ age: 0.5 })).reasons.some((r) => r.includes("新成屋")));
});

test("屋齡：舊的『幾年以內』還認得（資料庫裡的舊買方條件不能靜靜失效）", () => {
  const old = { maxAge: 20 };
  assert.ok(scoreListing(old, listing({ age: 3 })).reasons.some((r) => r.includes("屋齡 3 年符合")));
  assert.ok(scoreListing(old, listing({ age: 40 })).misses.some((m) => m.includes("屋齡過高")));
  // 兩個都有時以新的區間為準
  assert.ok(scoreListing({ ageRange: "a5", maxAge: 20 }, listing({ age: 3 })).misses.some((m) => m.includes("屋齡不符")));
});

test("AGE_RANGES：他指定的五段，20–30 年目前刻意沒有", () => {
  assert.deepEqual(Object.values(AGE_RANGES).map((r) => r.label), ["0–5 年", "5–10 年", "10–15 年", "15–20 年", "30 年以上"]);
  assert.ok(describePreference({ ageRange: "a15" }).includes("屋齡 15–20 年"));
});

// ---------------------------------------------------------------- 價格異動
//
// 這段錯了不會有任何錯誤訊息，只會有一批買方收到莫名其妙的「降價通知」，
// 而且推播是計費的、收回不來。所以每一種「不該算異動」的情況都測。

// ---------------------------------------------------------------- 房數可複選（2026-09-25）

test("房數可複選：勾 2、3 房時只有 2 房與 3 房算符合", () => {
  const pref = { city: "台中市", roomsList: [2, 3] };
  assert.equal(rankListings(pref, [listing({ rooms: 2 })]).length, 1);
  assert.equal(rankListings(pref, [listing({ rooms: 3 })]).length, 1);
  assert.equal(rankListings(pref, [listing({ rooms: 1 })]).length, 0);
  assert.equal(rankListings(pref, [listing({ rooms: 4 })]).length, 0);
});

test("房數：選項 4 是「4 房以上」，5 房、6 房也要算符合", () => {
  const pref = { city: "台中市", roomsList: [4] };
  assert.equal(rankListings(pref, [listing({ rooms: 3 })]).length, 0);
  assert.equal(rankListings(pref, [listing({ rooms: 4 })]).length, 1);
  assert.equal(rankListings(pref, [listing({ rooms: 6 })]).length, 1);
});

test("房數：舊買方存的單選 rooms 還認得（不能靜靜失效）", () => {
  const p = normalizePreference({ city: "台中市", rooms: 3 });
  assert.deepEqual(p.roomsList, [3]);
  assert.equal(rankListings({ city: "台中市", rooms: 3 }, [listing({ rooms: 3 })]).length, 1);
  assert.equal(rankListings({ city: "台中市", rooms: 3 }, [listing({ rooms: 2 })]).length, 0);
  // 舊的 4 一樣是「4 房以上」
  assert.equal(rankListings({ city: "台中市", rooms: 4 }, [listing({ rooms: 7 })]).length, 1);
});

test("房數：亂資料不會炸，去重排序，都不勾＝不限", () => {
  assert.deepEqual(normalizePreference({ roomsList: [3, 2, 2, 9, 0, "1", null] }).roomsList, [1, 2, 3]);
  assert.deepEqual(normalizePreference({}).roomsList, []);
  assert.equal(rankListings({}, [listing({ rooms: 1 }), listing({ rooms: 9 })]).length, 2);
});

test("房數：摘要寫成「2 房/3 房」，4 是「4 房以上」", () => {
  assert.ok(describePreference({ city: "台中市", roomsList: [2, 3] }).includes("2 房/3 房"));
  assert.ok(describePreference({ city: "台中市", roomsList: [4] }).includes("4 房以上"));
});

// ---------------------------------------------------------------- 嚴格過濾
//
// 🔴 2026-09-25 他的原話：「我搜尋透天，卻跑出大樓物件或是不符合的物件，這些不符合的都不要顯示」。
//    屋齡只佔 4 分，所以在那之前一間 29.7 年的透天在「屋齡 0–5 年」的條件下還是拿 96%、排第一個。
//    這一組測死「不符合就不回來」，以及同樣重要的反面：「資料沒有」不等於「不符合」。

test("嚴格過濾：搜透天厝不會跑出電梯大樓", () => {
  const all = [listing({ type: "透天厝" }), listing({ type: "電梯大樓" }), listing({ type: "華廈" })];
  const ranked = rankListings({ city: "台中市", types: ["透天厝"] }, all);
  assert.deepEqual(ranked.map((m) => m.listing.type), ["透天厝"]);
});

test("嚴格過濾：屋齡不符就不列出來（他抓到的那間 29.7 年透天）", () => {
  const pref = { city: "台中市", districts: ["沙鹿區"], budgetMax: 1500, types: ["透天厝"], ageRange: "a0" };
  const old = listing({ type: "透天厝", age: 29.7, price: 1280 });
  assert.equal(scoreListing(pref, old).disqualified, true);
  assert.equal(rankListings(pref, [old]).length, 0);
  // 一樣的物件，只是屋齡合了，就要回來
  assert.equal(rankListings(pref, [listing({ type: "透天厝", age: 3, price: 1280 })]).length, 1);
});

test("嚴格過濾：店網沒給屋齡／樓層／地坪的，不算不符合（不然土地會整批消失）", () => {
  const land = listing({ type: "土地", age: 0, floor: "/", landSize: 200, usageType: "農業用地", rooms: 0, size: 0 });
  const r = scoreListing({ city: "台中市", types: ["土地"], ageRange: "a0", floor: "low" }, land);
  assert.equal(r.disqualified, false, r.misses.join("、"));
  assert.ok(r.misses.some((m) => m.includes("沒有屋齡資料")));
  assert.ok(r.misses.some((m) => m.includes("沒有樓層資料")));
});

test("嚴格過濾：略高於預算也算不符合（1,500 萬內就是 1,500 萬內）", () => {
  const pref = { city: "台中市", budgetMax: 1500 };
  assert.equal(rankListings(pref, [listing({ price: 1500 })]).length, 1);
  assert.equal(rankListings(pref, [listing({ price: 1570 })]).length, 0);
});

test("嚴格過濾：同縣市但不在指定行政區，一樣不列出來", () => {
  const pref = { city: "台中市", districts: ["沙鹿區"] };
  const all = [listing({ district: "沙鹿區" }), listing({ district: "梧棲區" }), listing({ city: "彰化縣", district: "伸港鄉" })];
  assert.deepEqual(rankListings(pref, all).map((m) => m.listing.district), ["沙鹿區"]);
});

test("嚴格過濾：什麼條件都沒填就不該濾掉任何東西", () => {
  const all = [listing({ type: "透天厝" }), listing({ type: "土地", age: 0, floor: "/" }), listing({ price: 9999 })];
  assert.equal(rankListings({}, all).length, all.length);
});

test("價格異動：只抓真的變了價、而且兩邊價格都正常的", () => {
  const before = new Map([
    ["a", { status: "available", price: 1000 }],
    ["b", { status: "available", price: 1000 }],
    ["c", { status: "available", price: 1000 }],
    ["d", { status: "hidden", price: 1000 }],
    ["e", { status: "available", price: 0 }],
  ]);
  const now = [
    { id: "a", price: 900 }, // 降價
    { id: "b", price: 1200 }, // 調漲
    { id: "c", price: 1000 }, // 沒變
    { id: "d", price: 800 }, // 上次是下架的，不算
    { id: "e", price: 800 }, // 上次沒有價格（解析失敗），不算
    { id: "f", price: 700 }, // 這次才第一次出現＝新物件，不算
  ];
  const changes = detectPriceChanges(before, now);
  assert.deepEqual(changes.map((c) => c.listing.id), ["a", "b"]);
  assert.equal(changes[0].priceFrom, 1000);
});

test("價格異動：解析壞掉把價格變成 0 時，不能判定成全店降價", () => {
  const before = new Map(
    ["a", "b", "c"].map((id) => [id, { status: "available", price: 1500 }]),
  );
  // 愛屋改版 → 價格全解析成 0
  const broken = ["a", "b", "c"].map((id) => ({ id, price: 0 }));
  assert.deepEqual(detectPriceChanges(before, broken), []);
});

// ---------------------------------------------------------------- 名片卡

const LINE = await import("../src/lib/match/line.ts");

/** 把 Flex 整棵樹走過一遍，回所有節點 */
function walk(node, out = []) {
  if (Array.isArray(node)) {
    for (const n of node) walk(n, out);
  } else if (node && typeof node === "object") {
    out.push(node);
    for (const v of Object.values(node)) walk(v, out);
  }
  return out;
}

const fakeListing = (id) => ({
  id,
  title: `測試物件 ${id}`,
  city: "台中市",
  district: "梧棲區",
  address: "中華路一段",
  price: 888,
  rooms: 3,
  size: 32.5,
  landSize: 0,
  type: "電梯大樓",
  age: 8,
  images: ["https://weikaihouse.com/card/owner-2026-09.jpg"],
});

test("名片卡：單張的時候不包 carousel（包了卡片會變窄）", () => {
  const msg = LINE.agentCardMessage([]);
  assert.equal(msg.type, "flex");
  assert.equal(msg.contents.type, "bubble");
});

test("名片卡：帶物件就變成 carousel，最多 10 格（名片 1 ＋ 物件 9）", () => {
  const msg = LINE.agentCardMessage(Array.from({ length: 20 }, (_, i) => fakeListing(`L${i}`)));
  assert.equal(msg.contents.type, "carousel");
  assert.equal(msg.contents.contents.length, 10);
});

test("名片卡：大頭照要是 https 的絕對網址，LINE 才載得到", () => {
  const hero = LINE.agentCardMessage([]).contents.hero;
  assert.match(hero.url, /^https:\/\/.+\.(jpg|jpeg|png)$/i);
});

// 🔴 這一項是防外洩的，不要拿掉：名片是拿去**轉傳**的，
//    連結上帶了買方識別碼的話，收到的人一點就會被認成轉傳者本人。
test("名片卡：連結一律不帶買方識別碼（k=）", () => {
  const msg = LINE.agentCardMessage([fakeListing("L1"), fakeListing("L2")]);
  const uris = walk(msg)
    .filter((n) => n.type === "uri" && typeof n.uri === "string")
    .map((n) => n.uri);
  assert.ok(uris.length >= 5, `按鈕數不對：${uris.length}`);
  for (const uri of uris) assert.ok(!/[?&]k=/.test(uri), `這個連結帶了識別碼：${uri}`);
});

test("名片卡：沒有空字串的 text（LINE 會整包退回）", () => {
  for (const listings of [[], [fakeListing("L1")]]) {
    for (const n of walk(LINE.agentCardMessage(listings))) {
      if (n.type === "text") assert.ok(String(n.text ?? "").trim().length > 0, "有空的 text 節點");
    }
  }
});

test("名片卡：按鈕文字不超過 20 字（LINE 的上限）", () => {
  for (const n of walk(LINE.agentCardMessage([fakeListing("L1")]))) {
    if (n.type === "uri" || n.type === "message") {
      assert.ok(String(n.label ?? "").length <= 20, `按鈕文字太長：${n.label}`);
    }
  }
});

// ---------------------------------------------------------------- 預約通知

const fakeViewing = {
  code: "BK-TEST01",
  listingId: "L1",
  listingIds: ["L1"],
  name: "陳小姐",
  phone: "0912345678",
  preferredAt: "9/27(六) 下午",
  note: "",
};

test("預約通知：帶上買方的購屋條件，跟後台「買方」那一欄同一份字", () => {
  const pref = {
    city: "台中市",
    districts: ["梧棲區", "清水區"],
    budgetMax: 500,
    rooms: 1,
    types: ["電梯大樓"],
    ageRange: "a0",
    features: ["平面車位"],
  };
  const body = LINE.viewingNotifyText(fakeViewing, [fakeListing("L1")], null, pref);
  assert.ok(body.includes(`購屋條件：${describePreference(pref)}`), body);
});

test("預約通知：沒留過條件也要有那一行，不能整行消失", () => {
  const body = LINE.viewingNotifyText(fakeViewing, [fakeListing("L1")], null, null);
  assert.match(body, /購屋條件：（沒有留過配對條件）/);
});

if (process.exitCode) {
  console.error(`\n有測試失敗（通過 ${passed} 項）`);
} else {
  console.log(`\n✅ check:match 全部通過（${passed} 項）`);
}
