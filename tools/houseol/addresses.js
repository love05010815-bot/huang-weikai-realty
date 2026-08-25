/**
 * 🔒 門牌地址的暫存檔 —— 這條路完全不碰 repo
 *
 * 愛屋的委託列表有「門牌地址」欄，但那一欄**絕對不能**進
 * `src/config/houseol-inventory.json`（那個檔有版控、repo 是公開的）。
 * `sanitize.js` 負責把它從庫存資料裡剔掉，這支則負責把它另外收在一個
 * **gitignore 掉的本機檔**，再由 `push-addresses.js` 寫進資料庫。
 *
 * 為什麼是「合併」不是「覆蓋」：書籤那條路是「翻一頁點一次」，
 * 一次只拿得到一頁。覆蓋的話最後一次匯入就會把前面幾頁的地址洗掉。
 */

"use strict";

const fs = require("fs");
const path = require("path");

/** ⚠️ 這個檔名有寫進 .gitignore。要改名的話兩邊一起改。 */
const ADDRESSES_PATH = path.join(__dirname, "addresses.local.json");

/** 讀現有的暫存檔。沒有、壞掉都回空物件 —— 這是暫存檔，重抓一次就有了 */
function readAddresses() {
  try {
    const parsed = JSON.parse(fs.readFileSync(ADDRESSES_PATH, "utf8"));
    return parsed && typeof parsed.byCaseId === "object" && parsed.byCaseId ? parsed.byCaseId : {};
  } catch {
    return {};
  }
}

/**
 * 把這批原始資料裡的地址合併進暫存檔。
 *
 * @param {Array<{caseId?: string, address?: string}>} rawRows 尚未 sanitize 的原始列
 * @param {string} generatedAt ISO 時間字串
 * @returns {{added: number, updated: number, total: number, path: string}}
 */
function mergeAddresses(rawRows, generatedAt) {
  const byCaseId = readAddresses();
  let added = 0;
  let updated = 0;

  for (const raw of rawRows || []) {
    const caseId = String((raw && raw.caseId) || "").trim();
    const address = String((raw && raw.address) || "").trim();
    if (!caseId || !address) continue;
    if (byCaseId[caseId] === undefined) added++;
    else if (byCaseId[caseId] !== address) updated++;
    byCaseId[caseId] = address.slice(0, 255);
  }

  const total = Object.keys(byCaseId).length;
  fs.writeFileSync(
    ADDRESSES_PATH,
    JSON.stringify({ generatedAt, count: total, byCaseId }, null, 2) + "\n",
    "utf8"
  );
  return { added, updated, total, path: ADDRESSES_PATH };
}

module.exports = { ADDRESSES_PATH, readAddresses, mergeAddresses };
