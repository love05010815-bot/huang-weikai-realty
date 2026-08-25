/**
 * 🔒 愛屋物件的門牌地址 —— 存資料庫，**不進 repo**
 *
 * ## 為什麼不跟庫存池放同一個檔
 *
 * `src/config/houseol-inventory.json` 有進版控，而**這個 repo 是公開的**。
 * 一百多位屋主的門牌放進去等於公開在網路上，而且 git 歷史刪不掉。
 * 所以抓取工具那邊照舊把地址從庫存檔剔除（`tools/houseol/sanitize.js`），
 * 地址走完全獨立的一條路：
 *
 *   愛屋 → `tools/houseol/addresses.local.json`（gitignore）
 *        → `node tools/houseol/push-addresses.js` → 這張表
 *
 * ## 為什麼不乾脆只留本機檔
 *
 * 助理那顆 Deploy Hook 是從 GitHub main 建置的。地址如果只存在本機檔案，
 * 用 Hook 部署的那一版會**沒有那個檔案** —— 帶入功能默默失效、不報錯、
 * 畫面看起來完全正常。放資料庫兩條部署路徑拿到的東西才會一樣。
 *
 * ## 這些地址只給後台看
 *
 * 只有 `/admin/map-listings` 會讀，用來在挑案清單顯示、以及按「帶入」時
 * 填進物件地址欄。**對外的 `/map` 一個字都不會出現。**
 */

import { db } from "@/lib/db";

/** 一筆：愛屋案件編號 → 門牌地址 */
export type HouseolAddressRow = { caseId: string; address: string };

let ensured = false;

/**
 * 建表（不存在才建）。
 *
 * ⚠️ `tools/houseol/push-addresses.js` 有一份一模一樣的 DDL（那支是純 node
 *    腳本，沒辦法 import 這裡）。改這裡記得同步改那裡，否則兩邊建出來的表
 *    會長得不一樣，而且是等到寫入才炸。
 */
export async function ensureHouseolAddressTable(): Promise<void> {
  if (ensured) return;
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS houseol_address (
      case_id    VARCHAR(64)  NOT NULL,
      address    VARCHAR(255) NOT NULL,
      updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (case_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  ensured = true;
}

/**
 * 案件編號 → 地址。
 *
 * 讀不到（表還沒建、資料庫在睡）回空 Map，不丟例外 ——
 * 沒有地址只是少一個便利功能，不該讓整個後台開不起來。
 */
export async function getHouseolAddressMap(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    await ensureHouseolAddressTable();
    const rows = await db.$queryRawUnsafe<{ case_id: string; address: string }[]>(
      `SELECT case_id, address FROM houseol_address`,
    );
    for (const r of rows) {
      const addr = r.address?.trim();
      if (r.case_id && addr) out.set(r.case_id, addr);
    }
  } catch {
    // 沒有地址就沒有地址，後台照常運作
  }
  return out;
}

/**
 * 批次寫入（有就更新、沒有就新增）。
 *
 * **刻意不刪除舊資料。** 書籤那條路是「翻一頁點一次」，漏抓一頁很正常；
 * 如果做成「這批沒有的就刪掉」，少抓一頁就會靜靜砍掉十筆地址。
 * 留著的過期地址不會有任何副作用 —— 那個案件編號已經不在庫存池裡，
 * 挑案清單根本選不到它。
 */
export async function upsertHouseolAddresses(rows: HouseolAddressRow[]): Promise<number> {
  await ensureHouseolAddressTable();
  let written = 0;
  for (const r of rows) {
    const caseId = r.caseId?.trim();
    const address = r.address?.trim();
    if (!caseId || !address) continue;
    await db.$executeRawUnsafe(
      `INSERT INTO houseol_address (case_id, address) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE address = VALUES(address)`,
      caseId,
      address.slice(0, 255),
    );
    written++;
  }
  return written;
}
