/**
 * 愛屋庫存池共用的清理邏輯。
 *
 * 只有這一個檔案知道「怎麼把地址砍成只剩行政區」，import.js 跟
 * test-roundtrip.js 都呼叫這裡，不要各寫各的 —— 兩邊邏輯兜不起來的話，
 * 就是這條防線失效的那一天。
 *
 * ⚠️ 這個 repo 是公開的。任何一筆資料進 src/config/houseol-inventory.json
 *    之前都要先過 sanitizeRow()，門牌地址、屋主姓名電話這些一律不留。
 */

"use strict";

/** "台中市梧棲區建國北街315巷7弄7號四樓" → "梧棲區"。抓不到就回傳空字串。 */
function districtOf(address) {
  if (!address) return "";
  const m = String(address).match(/(?:市|縣)([一-鿿]{1,3}區)/);
  return m ? m[1] : "";
}

/** 看起來像完整門牌地址的文字（有路/街/巷/弄/號這種字）。用來擋漏網之魚。 */
function looksLikeStreetAddress(value) {
  if (!value) return false;
  return /[一-鿿]{1,10}(路|街|巷|弄)[一-鿿0-9０-９]{0,10}號/.test(String(value));
}

/**
 * 一筆愛屋原始擷取資料 → 一筆可以進 repo 的乾淨資料。
 * 丟掉 address，只留 district；其餘欄位原樣保留（都是物件本身的
 * 公開資訊：案名、坪數、價格、委託期間，不是屋主個資）。
 */
function sanitizeRow(raw) {
  const { address, ...rest } = raw;
  const district = raw.district || districtOf(address);
  const clean = { ...rest, district };

  for (const key of Object.keys(clean)) {
    if (key === "district") continue;
    if (looksLikeStreetAddress(clean[key])) {
      throw new Error(`欄位 "${key}" 的值看起來像完整門牌地址，不能進 repo：${clean[key]}`);
    }
  }

  return clean;
}

module.exports = { districtOf, looksLikeStreetAddress, sanitizeRow };
