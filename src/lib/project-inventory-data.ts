/**
 * 🏢 建案 ↔ 太平洋在售物件 —— **伺服器端載入器**（碰資料庫、碰分享 API 的快取）。規則本身在 lib/project-inventory.ts。
 *
 * /map 的 page.tsx 在靜態產生（ISR 五分鐘）時呼叫 `getProjectInventory()`，把「建案 id → 在售物件」整份塞給
 * ProjectExplorer；官網每 30 分鐘同步一次 match_listing（lib/match/sync.ts），所以頁面最慢 35 分鐘跟上官網。
 *
 * 去重：他自己在後台 /admin/map-listings 上架的那幾戶（map_listing）在面板上另有一段，同一戶不要在官網清單再出現。
 * map_listing 沒存 S 編號，從「物件資訊」那條連結對回去：
 *   ・官網物件頁 ?saleID=S… → 直接就是
 *   ・舊愛屋型錄 …No=AA… → match_listing.houseol_id 對回 S 編號（一句 IN 查詢）
 *   ・分享連結 prim.pacific.com.tw/s/<code> → 分享 API（跟售價那支同一組 fetch 選項 → 同一筆 Data Cache，不多打）
 *   ・都對不到的，同一個建案底下標題一模一樣也當同一戶（他帶入時標題就是官網標題）
 *
 * 🔴 讀不到（資料庫掛了、官網沒同步過）一律回空物件：建案地圖本體是靜態的，不能因為物件讀不到整頁開天窗。
 * 🔴 這支會被 /map 這個 ISR 頁面 import：裡面的 fetch **不准寫 cache:"no-store"**（會把整頁變動態，見 learning_fetch_no_store_kills_isr）。
 */
import { COORDS, PROJECTS } from "@/data/port-projects";
import { db } from "@/lib/db";
import { houseolCaseId } from "@/lib/houseol-price";
import type { PublicMapListing } from "@/lib/map-listings";
import { ensureMatchTables, type MatchListing } from "@/lib/match/store";
import { fetchPrimShare, pacificSaleIdFrom, primShareCode } from "@/lib/prim-share";
import { buildInventoryIndex, buildProjectInventory, normalizeName, type InventorySource, type ProjectInventoryMap } from "@/lib/project-inventory";

/** 建案名稱與圖釘的查找表 —— 建案總表是靜態的，整個程序建一次就好 */
export const INVENTORY_INDEX = buildInventoryIndex(PROJECTS, COORDS);

type Row = {
  id: string;
  title: string;
  district: string;
  price: unknown;
  rooms: unknown;
  halls: unknown;
  baths: unknown;
  size: unknown;
  type: string;
  age: unknown;
  floor: string | null;
  images: string | null;
  lat: unknown;
  lng: unknown;
};

/** 只撈畫面與對照要用的欄位 —— features／description 那些 TEXT 不要跟著 800 多筆一起進記憶體 */
const SELECT_AVAILABLE =
  "SELECT id, title, district, price, rooms, halls, baths, `size`, `type`, age, `floor`, images, lat, lng FROM match_listing WHERE status = 'available'";

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const coord = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
};
function parseImages(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
  } catch {
    return [];
  }
}

export function sourceFromRow(r: Row): InventorySource {
  return {
    id: String(r.id ?? "").trim(),
    title: String(r.title ?? "").trim(),
    type: String(r.type ?? "").trim(),
    district: String(r.district ?? "").trim(),
    price: num(r.price),
    size: num(r.size),
    rooms: num(r.rooms),
    halls: num(r.halls),
    baths: num(r.baths),
    floor: String(r.floor ?? "").trim(),
    age: num(r.age),
    images: parseImages(r.images),
    lat: coord(r.lat),
    lng: coord(r.lng),
  };
}

/** 單戶頁用：store.ts 讀出來的那一筆 → 對照用的形狀 */
export function sourceFromListing(l: MatchListing): InventorySource {
  return {
    id: l.id,
    title: l.title,
    type: l.type,
    district: l.district,
    price: l.price,
    size: l.size,
    rooms: l.rooms,
    halls: l.halls,
    baths: l.baths,
    floor: l.floor,
    age: l.age,
    images: l.images,
    lat: l.lat,
    lng: l.lng,
  };
}

export async function listInventorySources(): Promise<InventorySource[]> {
  await ensureMatchTables();
  const rows = await db.$queryRawUnsafe<Row[]>(SELECT_AVAILABLE);
  return rows.map(sourceFromRow);
}

export type OwnerOverrides = {
  /** 大寫 S 編號 → 他在後台掛的建案 id */
  overrides: Map<string, string>;
  /** normalizeName(標題) → 建案 id（連結對不回 S 編號那幾戶的備援） */
  titleOverrides: Map<string, string>;
};

/**
 * 他自己在後台（map_listing）指定過的「這一戶屬於哪個建案」→ S 編號對照。
 * 2026-10-20 他拍板地圖不再另外顯示他 key 的那一段、一律以官網資料為主，但他點過的建案歸屬還是最可信的依據，
 * 拿來當對照的第一順位（lib/project-inventory.ts 的 overrides）。
 * 對不回 S 編號的（沒填連結、分享連結失效）退而用標題對（titleOverrides）。
 */
export async function ownerOverrides(ownedByProject: Map<string, PublicMapListing[]>): Promise<OwnerOverrides> {
  const overrides = new Map<string, string>();
  const titleOverrides = new Map<string, string>();
  const houseolIds: Array<{ aa: string; projectId: string }> = [];
  const primCodes: Array<{ code: string; projectId: string }> = [];
  for (const [projectId, list] of ownedByProject) {
    if (!projectId) continue;
    for (const l of list) {
      const t = normalizeName(l.title);
      if (t) titleOverrides.set(t, projectId);
      const href = l.linkHref ?? "";
      if (!href) continue;
      const sale = pacificSaleIdFrom(href);
      if (sale) {
        overrides.set(sale.toUpperCase(), projectId);
        continue;
      }
      const code = primShareCode(href);
      if (code) {
        primCodes.push({ code, projectId });
        continue;
      }
      const aa = houseolCaseId(href);
      if (aa) houseolIds.push({ aa: aa.toUpperCase(), projectId });
    }
  }

  if (houseolIds.length > 0) {
    const byAa = new Map(houseolIds.map((x) => [x.aa, x.projectId]));
    const uniq = [...byAa.keys()].slice(0, 300);
    const rows = await db.$queryRawUnsafe<{ id: string; houseol_id: string }[]>(
      `SELECT id, houseol_id FROM match_listing WHERE houseol_id IN (${uniq.map(() => "?").join(",")})`,
      ...uniq,
    );
    for (const r of rows) {
      const pid = byAa.get(String(r.houseol_id ?? "").toUpperCase());
      if (pid) overrides.set(String(r.id).toUpperCase(), pid);
    }
  }

  // 分享連結：網路不是資料庫，可以並行；選項跟 lib/houseol-price.ts 的售價一樣 → Next Data Cache 同一筆
  const uniqCodes = primCodes.slice(0, 100);
  const shares = await Promise.all(uniqCodes.map((x) => fetchPrimShare(x.code, { revalidate: 3600, timeoutMs: 6000 })));
  shares.forEach((r, i) => {
    if (r.ok && r.share.items.length === 1) overrides.set(r.share.items[0].objNo.toUpperCase(), uniqCodes[i].projectId);
  });
  return { overrides, titleOverrides };
}

/**
 * /map 用：建案 id → 官網在售物件（便宜的排前面）。讀不到回 {}，不丟例外。
 * @param ownedByProject getMapListingsByProject() 的結果（他在後台掛好建案的那幾戶）—— 只拿來當對照依據，不另外顯示
 */
export async function getProjectInventory(ownedByProject: Map<string, PublicMapListing[]>): Promise<ProjectInventoryMap> {
  try {
    const sources = await listInventorySources();
    const owner = await ownerOverrides(ownedByProject);
    return buildProjectInventory(INVENTORY_INDEX, sources, owner);
  } catch (e) {
    console.error("[project-inventory] 讀不到官網在售物件，建案底下先不列：", e);
    return {};
  }
}
