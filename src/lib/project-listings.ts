/**
 * 🔗 建案 ↔ 在售物件 的對照
 *
 * 目的：客戶在區域頁點一個建案，就看得到「瑋凱在這個建案有哪些物件在賣」。
 *
 * ## 為什麼用文字比對，不加資料庫欄位
 *
 * 物件的 `area` 欄本來就是「**行政區・建案名**」的格式（例：`清水區・聯悦聚`），
 * 所以建案名已經在資料裡了，不必為了連結去 ALTER TABLE、也不必改後台表單。
 *
 * 代價是「打錯字就對不上」。所以：
 *   ・比對前會正規化（去空白、統一異體字）
 *   ・對不上的不會消失，只是不掛到建案底下，前台照常出現在 /listings
 *   ・建案那邊用 `aliases` 收各種寫法（例：聯悅聚／聯悦聚）
 *
 * 哪天物件多到文字比對不可靠，再加 `listing.project_id` 欄位；
 * 那時這支檔案就變成「一次性回填」的工具，介面不用改。
 *
 * ⚠️ 這支檔案刻意不 import `/admin` 底下任何東西，也不改 `lib/listings.ts`——
 *    那些檔案別的對話視窗正在動，減少互相踩到的機會。
 */

import { PROJECTS, type Project } from "@/data/port-projects";
import { getPublicListings } from "@/lib/listings";
import type { Listing } from "@/config/listings";

/**
 * 正規化建案名，讓「同一個建案的不同寫法」能對上。
 *
 * 處理的差異：
 *   ・全形／半形空白、間隔號（・ ‧ · ．）
 *   ・異體字：悅/悦、鉑/鉑、臺/台
 *   ・大小寫
 */
function normalize(raw: string): string {
  return raw
    .replace(/[\s　]/g, "")
    .replace(/[・‧·．.]/g, "")
    .replace(/悦/g, "悅")
    .replace(/臺/g, "台")
    .toLowerCase();
}

/**
 * 從物件的 `area` 拆出可能的建案名。
 * `清水區・聯悦聚` → ["清水區", "聯悦聚"]，兩段都拿去比對
 * （有人可能寫成「聯悦聚・清水區」，不假設順序）。
 */
function areaTokens(area: string): string[] {
  return area
    .split(/[・‧·／/、,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 一個建案的所有可接受寫法 */
function projectNames(p: Project): string[] {
  return [p.name, p.alias, ...(p.aliases ?? [])].filter(Boolean).map(String);
}

/**
 * 把在售物件掛到建案底下。
 *
 * 回傳 `Map<建案 id, 該建案的在售物件[]>`。
 * 沒有物件的建案不會出現在 Map 裡（用 `.get(id) ?? []` 讀）。
 */
export async function getListingsByProject(): Promise<Map<string, Listing[]>> {
  const listings = await getPublicListings();
  const out = new Map<string, Listing[]>();

  // 先把所有建案的寫法攤平成查找表，避免 O(建案 × 物件) 逐一比字串
  const lookup = new Map<string, string>(); // 正規化後的名字 → 建案 id
  for (const p of PROJECTS) {
    for (const name of projectNames(p)) {
      lookup.set(normalize(name), p.id);
    }
  }

  for (const listing of listings) {
    for (const token of areaTokens(listing.area)) {
      const projectId = lookup.get(normalize(token));
      if (!projectId) continue;
      const bucket = out.get(projectId);
      if (bucket) bucket.push(listing);
      else out.set(projectId, [listing]);
      break; // 一筆物件只掛一個建案
    }
  }

  return out;
}

/**
 * 只要數量，給不需要物件內容的地方用（例如卡片上的「在售 2 件」）。
 * 序列化後可以直接丟給 client component。
 */
export async function getListingCountByProject(): Promise<Record<string, number>> {
  const map = await getListingsByProject();
  const out: Record<string, number> = {};
  for (const [id, list] of map) out[id] = list.length;
  return out;
}
