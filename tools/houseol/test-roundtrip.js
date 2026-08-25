/**
 * 防線測試：確保完整門牌地址永遠進不了 src/config/houseol-inventory.json。
 *
 * 跑法：node tools/houseol/test-roundtrip.js
 * 這支不碰真的愛屋資料，全部用假資料測 sanitize.js 的邏輯。
 */

"use strict";

const assert = require("node:assert");
const { districtOf, looksLikeStreetAddress, sanitizeRow } = require("./sanitize");

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (e) {
    console.error(`❌ ${name}`);
    console.error(`   ${e.message}`);
    process.exitCode = 1;
  }
}

check("districtOf 從完整地址抓出行政區", () => {
  assert.strictEqual(districtOf("台中市梧棲區建國北街315巷7弄7號四樓"), "梧棲區");
  assert.strictEqual(districtOf("台中市清水區港埠路三段213號七樓之2"), "清水區");
});

check("districtOf 抓不到就回空字串，不會噴錯", () => {
  assert.strictEqual(districtOf(""), "");
  assert.strictEqual(districtOf(undefined), "");
  assert.strictEqual(districtOf("隨便打的字"), "");
});

check("looksLikeStreetAddress 認得出帶路街巷弄號的文字", () => {
  assert.strictEqual(looksLikeStreetAddress("建國北街315巷7弄7號"), true);
  assert.strictEqual(looksLikeStreetAddress("中樂街119號"), true);
  assert.strictEqual(looksLikeStreetAddress("梧棲區"), false);
  assert.strictEqual(looksLikeStreetAddress("勝美新橫濱"), false);
});

check("sanitizeRow 把 address 換成 district，原欄位不見", () => {
  const clean = sanitizeRow({
    title: "新橫濱雙面採光大三房平車",
    community: "勝美新橫濱",
    address: "台中市清水區港埠路三段213號七樓之2"
  });
  assert.strictEqual(clean.district, "清水區");
  assert.strictEqual("address" in clean, false);
});

check("sanitizeRow 對第 5 關防線：其他欄位混進完整地址要直接擋下來", () => {
  assert.throws(() => {
    sanitizeRow({
      title: "測試",
      community: "台中市梧棲區建國北街315巷7弄7號", // 有人手殘把地址貼錯欄位
      address: "台中市梧棲區建國北街315巷7弄7號"
    });
  }, /完整門牌地址/);
});

check("sanitizeRow 沒有 address 欄位也不會炸", () => {
  const clean = sanitizeRow({ title: "測試", district: "龍井區" });
  assert.strictEqual(clean.district, "龍井區");
});

console.log(`\n${passed}/6 通過`);
if (process.exitCode) {
  console.log("有測試沒過，import.js 產生的資料可能不安全，先別匯入。");
}
