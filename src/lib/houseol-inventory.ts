/**
 * 讀 tools/houseol/import.js 產生的 src/config/houseol-inventory.json。
 *
 * 這是本機檔案，不是資料庫 —— 檔案不存在（還沒抓過愛屋）就回傳空陣列，
 * 不要噴錯，`/admin/map-listings` 沒有這份資料一樣要能正常運作。
 *
 * ⚠️ 這個檔案用了 node:fs，只能在伺服器端（server component）import。
 *    型別跟純函式輔助放在 houseol-item.ts，client component 要用那邊。
 */

import fs from "node:fs";
import path from "node:path";
import type { HouseolItem } from "./houseol-item";

const INVENTORY_PATH = path.join(process.cwd(), "src", "config", "houseol-inventory.json");

export function loadHouseolInventory(): HouseolItem[] {
  let raw: string;
  try {
    raw = fs.readFileSync(INVENTORY_PATH, "utf8");
  } catch {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as { items?: unknown };
    return Array.isArray(parsed.items) ? (parsed.items as HouseolItem[]) : [];
  } catch {
    return [];
  }
}
