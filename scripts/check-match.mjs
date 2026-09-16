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
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describePreference, normalizePreference, rankListings, scoreListing } from "../src/lib/match/matcher.ts";
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

test("rankListings：真實頁面用沙鹿 3 房條件排序，分數遞減", () => {
  const listings = parseBlocks(html).map((it) => toListingUpsert(it, "4817"));
  const ranked = rankListings({ city: "台中市", districts: ["沙鹿區"], rooms: 3 }, listings);
  assert.equal(ranked.length, listings.length);
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

if (process.exitCode) {
  console.error(`\n有測試失敗（通過 ${passed} 項）`);
} else {
  console.log(`\n✅ check:match 全部通過（${passed} 項）`);
}
