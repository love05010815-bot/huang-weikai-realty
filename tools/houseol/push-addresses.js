/**
 * 🔒 把 addresses.local.json 的門牌地址寫進資料庫。
 *
 * 用法（在 booking-system 目錄底下）：
 *   node tools/houseol/push-addresses.js
 *
 * 這是「抓愛屋」的第二步。第一步（import.js 或 auto-scrape.js）產出兩樣東西：
 *   ・src/config/houseol-inventory.json —— 乾淨版，有版控，**沒有地址**
 *   ・tools/houseol/addresses.local.json —— 只有地址，**不進版控**
 * 這支負責把後者送進資料庫的 `houseol_address` 表，
 * 後台 `/admin/map-listings` 挑案時才看得到地址、按「帶入」才填得進去。
 *
 * ⚠️ 忘了跑這支的話：庫存池會更新，但地址停在上一次。不會報錯，
 *    只是新案子按「帶入」地址欄是空的。所以第一步跑完會提醒你跑這支。
 *
 * ⚠️ 這支只做「有就更新、沒有就新增」，**不刪任何東西**。
 *    書籤那條路一次只抓一頁，做成「這批沒有的就刪」會害你漏抓一頁就少十筆。
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { ADDRESSES_PATH, readAddresses } = require("./addresses");

const ROOT = path.join(__dirname, "..", "..");

/** 從 .env.local 撈 DATABASE_URL。不用 dotenv，省一個相依 */
function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const name of [".env.local", ".env"]) {
    let text;
    try {
      text = fs.readFileSync(path.join(ROOT, name), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("DATABASE_URL=")) continue;
      let v = t.slice("DATABASE_URL=".length).trim();
      if (v.length > 1 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) {
        v = v.slice(1, -1);
      }
      if (v) return v;
    }
  }
  return null;
}

async function main() {
  const byCaseId = readAddresses();
  const entries = Object.entries(byCaseId).filter(([id, addr]) => id && addr);

  if (entries.length === 0) {
    console.error(`${path.relative(ROOT, ADDRESSES_PATH)} 裡沒有地址。`);
    console.error("先跑第一步抓愛屋：node tools/houseol/import.js <放 houseol-page-*.json 的資料夾>");
    process.exit(1);
  }

  const url = databaseUrl();
  if (!url) {
    console.error("找不到 DATABASE_URL（.env.local 或環境變數都沒有）。");
    process.exit(1);
  }

  const { PrismaClient } = require(path.join(ROOT, "node_modules", "@prisma", "client"));
  const db = new PrismaClient({ datasources: { db: { url } } });

  try {
    // ⚠️ 這段 DDL 跟 src/lib/houseol-address.ts 的 ensureHouseolAddressTable() 一模一樣。
    //    改一邊要改兩邊，不然兩邊建出來的表會長得不一樣，而且等到寫入才炸。
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS houseol_address (
        case_id    VARCHAR(64)  NOT NULL,
        address    VARCHAR(255) NOT NULL,
        updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (case_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const before = await db.$queryRawUnsafe("SELECT COUNT(*) AS n FROM houseol_address");
    const beforeCount = Number(before[0].n);

    for (const [caseId, address] of entries) {
      await db.$executeRawUnsafe(
        `INSERT INTO houseol_address (case_id, address) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE address = VALUES(address)`,
        String(caseId).trim().slice(0, 64),
        String(address).trim().slice(0, 255)
      );
    }

    const after = await db.$queryRawUnsafe("SELECT COUNT(*) AS n FROM houseol_address");
    const afterCount = Number(after[0].n);

    console.log(`送出 ${entries.length} 筆地址。`);
    console.log(`資料庫筆數：${beforeCount} → ${afterCount}（新增 ${afterCount - beforeCount}，其餘是更新既有的）`);
    console.log("後台 /admin/map-listings 挑案清單現在會顯示地址，按「帶入」也會一起填。");
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error("寫入失敗：" + (e && e.message ? e.message : e));
  process.exit(1);
});
