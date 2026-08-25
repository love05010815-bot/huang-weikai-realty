/**
 * 把書籤小工具抓下來的 houseol-page-*.json 合併成一份庫存池：
 * src/config/houseol-inventory.json
 *
 * 用法：
 *   node tools/houseol/import.js <資料夾路徑>
 *
 * <資料夾路徑> 放你下載下來那堆 houseol-page-*.json 的地方
 * （通常是瀏覽器的「下載項目」資料夾，或你另外整理過的資料夾）。
 * 不會動原始檔案，只讀不寫。
 *
 * 每次重跑會把 src/config/houseol-inventory.json 整個重新產生 ——
 * 委託到期或已下架的物件，重抓一次就會自動從清單消失，不用手動清。
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { sanitizeRow } = require("./sanitize");
const { mergeAddresses } = require("./addresses");

const ROOT = path.join(__dirname, "..", "..");
const OUT_PATH = path.join(ROOT, "src", "config", "houseol-inventory.json");

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error("用法：node tools/houseol/import.js <放 houseol-page-*.json 的資料夾>");
    process.exit(1);
  }

  const absDir = path.resolve(dir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    console.error(`找不到資料夾：${absDir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(absDir)
    .filter((f) => /^houseol-page-.*\.json$/.test(f))
    .map((f) => path.join(absDir, f));

  if (files.length === 0) {
    console.error(`${absDir} 裡沒有找到 houseol-page-*.json，確認資料夾放對了嗎？`);
    process.exit(1);
  }

  const byId = new Map();
  const allRaw = []; // 原始列（還沒 sanitize，含門牌）—— 只餵給地址暫存檔，不會進庫存檔
  let totalRawRows = 0;

  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      console.error(`跳過壞掉的檔案 ${path.basename(file)}：${e.message}`);
      continue;
    }
    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
    totalRawRows += rows.length;
    for (const raw of rows) {
      allRaw.push(raw);
      let clean;
      try {
        clean = sanitizeRow(raw);
      } catch (e) {
        console.error(`跳過一筆資料（${e.message}），來源檔 ${path.basename(file)}`);
        continue;
      }
      const key = clean.caseId || clean.title;
      if (!key) continue;
      byId.set(key, clean); // 同一個編號重複出現，用最後一筆蓋掉（抓比較新那次的狀態）
    }
  }

  const items = [...byId.values()].sort((a, b) => (a.district || "").localeCompare(b.district || "", "zh-Hant"));

  const byDistrict = {};
  for (const item of items) {
    const d = item.district || "（未知行政區）";
    byDistrict[d] = (byDistrict[d] || 0) + 1;
  }

  const output = {
    generatedAt: new Date().toISOString(),
    sourceFiles: files.length,
    count: items.length,
    byDistrict,
    items
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");

  console.log(`讀了 ${files.length} 個檔案、${totalRawRows} 筆原始資料，去重後 ${items.length} 筆。`);
  console.log("各行政區筆數：");
  for (const [d, c] of Object.entries(byDistrict)) {
    console.log(`  ${d}：${c} 筆`);
  }
  console.log(`已寫入 ${path.relative(ROOT, OUT_PATH)}`);

  // 🔒 地址走完全獨立的一條路：上面那個庫存檔已經被 sanitizeRow() 剔掉地址，
  //    這裡用的是原始資料，寫進一個 gitignore 掉的本機檔。
  const addr = mergeAddresses(allRaw, output.generatedAt);
  console.log("");
  console.log(`門牌地址：新增 ${addr.added} 筆、更新 ${addr.updated} 筆，暫存檔共 ${addr.total} 筆`);
  console.log(`  ${path.relative(ROOT, addr.path)}（不進版控，不要外傳）`);
  console.log("");
  console.log("⚠️ 還沒完 —— 地址還在本機檔，後台看不到。接著跑：");
  console.log("     node tools/houseol/push-addresses.js");
}

main();
