/**
 * 🏢 建案 ↔ 太平洋官網在售物件 —— **純規則**（不碰資料庫、不碰網路；scripts/check-project-inventory.mjs 直接載它跑測試）
 *
 * 2026-10-20 系統擁有者貼了另一家網站的截圖（每個社區底下列出「在售物件（出售 18、出租 1）」），
 * 說「建案地圖裡面我都已經建立好社區清單，請你從太平洋官網抓取該社區的在售物件(租的不要)直接套入進去，
 * 像這個網站這樣，但不要模仿他，做一個你的版本」。
 *
 * 物件來源是 `match_listing`（lib/match/sync.ts 每 30 分鐘從官網同步、查詢條件 Type=1 只有「售」），
 * **不另外抓**。難的只有一件事：官網那一筆沒有「社區」欄 —— 列表 API 根本沒這個欄位，
 * 單筆 API 的 community 實測 44 筆只有 2 筆有值 —— 所以要自己對。兩招，照順序：
 *
 *   ① 標題裡有案名：「聯悦臻2房平車高樓海景戶」→ 聯悅臻。
 *      ・正規化後比（去空白標點、悦→悅、臺→台、全形數字→半形），案名、alias、aliases 都認；
 *        案名結尾是數字的多一個中文數字寫法（遠雄之星5 也認「遠雄之星五」，標題真的會這樣寫）。
 *      ・**長的案名先比**：有「聯悅臻品」就不會被「聯悅臻」搶走。
 *      ・案名結尾是數字、標題接著是「房／廳／衛／坪／樓…」→ 那個數字是「2房」的 2，不算
 *        （「微風一品2房平車」不是微風一品2）。
 *      ・案名不在標題開頭、前一個字又是中文、而且官網座標離那根圖釘超過 300 公尺 → 當成誤判丟掉
 *        （實測「花漾天鵝…」被「漾天鵝」吃到，座標差 1.6 公里）。開頭就是案名的不看距離 —— 標題寫得那麼明白，
 *        離得遠多半是座標錯，不是案名錯（勝興豐境、富宇豐卉都遇過差一公里以上）。
 *   ② 標題沒案名、但官網座標離某根圖釘很近：≤35 公尺、而且第二近的至少兩倍遠又 ≥60 公尺（排除緊鄰的大樓）。
 *      實測標題對得到的 201 筆裡 146 筆座標在 50 公尺內，官網座標是棟的、不是路的，夠準。
 *      只對「會在大樓裡」的型態（大樓／華廈／公寓／套房／透天／店面／辦公）；土地、廠房、農舍不對 ——
 *      那些不會是某個社區「裡面」的一戶。
 *
 * 🔴 寧可少列、不要錯列：一戶掛錯社區，客戶點進去看到的是別棟的房子，跟廣告不實沒兩樣。
 *    所以 ② 的門檻寬鬆不得，① 的誤判規則也不要為了多撿幾筆去放寬。數字（35／60／300）都是用正式庫實測調的。
 *
 * 🔵 他自己上架的地圖物件（map_listing，後台 /admin/map-listings）另外有一段「我在這個建案的在售物件」，
 *    同一戶不要在底下再出現一次 —— 呼叫端把那些的 S 編號（與同建案同標題的）丟進 exclude。
 */

export type InventorySource = {
  /** 太平洋官網 S／P 編號（match_listing 主鍵） */
  id: string;
  title: string;
  /** match_listing.type：電梯大樓／華廈／公寓／套房／透天厝／土地／店面… */
  type: string;
  district: string;
  /** 萬；0 ＝ 沒資料 */
  price: number;
  /** 建坪；0 ＝ 沒資料 */
  size: number;
  rooms: number;
  halls: number;
  baths: number;
  /** 「14/15」「1-3/3」「B1/14」或空字串 */
  floor: string;
  /** 屋齡（年）；0 ＝ 沒資料 */
  age: number;
  images: string[];
  lat: number | null;
  lng: number | null;
};

/** 丟給前台的一筆，只帶畫面要的欄位（/map 整頁一起送，欄位越少越好） */
export type InventoryItem = {
  id: string;
  title: string;
  /** 萬；null ＝ 不顯示 */
  price: number | null;
  size: number | null;
  rooms: number | null;
  halls: number | null;
  baths: number | null;
  floor: string;
  kind: string;
  age: number | null;
  photo: string | null;
  /** 怎麼對到這個建案的：title＝標題有案名、near＝座標最近 */
  how: "title" | "near";
};

export type ProjectInventoryMap = Record<string, InventoryItem[]>;

type ProjectLike = { id: string; name: string; alias?: string; aliases?: string[] };
type CoordLike = { lat: number; lng: number };

const SEPARATORS = /[・‧·．.\-–—|｜/／【】\[\]「」『』()（）!！~～&＆]/g;

function foldChars(raw: string): string {
  return String(raw ?? "")
    .replace(/[\s　]/g, "")
    .replace(/悦/g, "悅")
    .replace(/臺/g, "台")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toLowerCase();
}

/** 案名／比對用的正規化：去空白、**去掉**間隔號與括號、異體字、全形數字 → 半形、英文小寫 */
export function normalizeName(raw: string): string {
  return foldChars(raw).replace(SEPARATORS, "");
}

/**
 * 標題用的正規化：跟 normalizeName 一樣，但間隔號、括號、斜線**留成一個 |** 而不是拿掉 ——
 * 「獨家｜漾天鵝三房」裡那個 ｜ 是明確的斷詞，案名前面是它就不算「黏在別的字後面」（見 matchByTitle 的 prevCjk）。
 */
export function normalizeTitle(raw: string): string {
  return foldChars(raw).replace(SEPARATORS, "|").replace(/\|{2,}/g, "|");
}

const CJK_DIGIT = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

/** 一個案名的所有寫法：正規化本體 ＋ 結尾數字的中文寫法（1～10） */
export function nameVariants(name: string): string[] {
  const n = normalizeName(name);
  if (!n) return [];
  const out = [n];
  const m = /^(.*?)(\d{1,2})$/.exec(n);
  if (m && m[1] && Number(m[2]) >= 1 && Number(m[2]) <= 10) out.push(m[1] + CJK_DIGIT[Number(m[2])]);
  return out;
}

type NameEntry = { key: string; id: string };
type Pin = { id: string; lat: number; lng: number };

export type InventoryIndex = {
  /** 長的排前面 */
  names: NameEntry[];
  pins: Pin[];
  pinById: Map<string, Pin>;
};

export function buildInventoryIndex(projects: readonly ProjectLike[], coords: Record<string, CoordLike>): InventoryIndex {
  const names: NameEntry[] = [];
  for (const p of projects) {
    for (const raw of [p.name, p.alias, ...(p.aliases ?? [])]) {
      if (!raw) continue;
      for (const key of nameVariants(raw)) {
        // 兩個字以下的名字（椽城、金牌、澄邑）太容易撞到一般用詞，只認標題開頭（見 matchByTitle）
        if (key.length < 2) continue;
        names.push({ key, id: p.id });
      }
    }
  }
  names.sort((a, b) => b.key.length - a.key.length);
  const pins: Pin[] = [];
  for (const p of projects) {
    const c = coords[p.id];
    if (c) pins.push({ id: p.id, lat: c.lat, lng: c.lng });
  }
  return { names, pins, pinById: new Map(pins.map((x) => [x.id, x])) };
}

/** 案名結尾是數字時，標題接著這些字就表示那個數字是格局（2房）不是案名序號 */
const UNIT_AFTER = /^[房廳衛坪樓層車間戶棟f]/;
const ENDS_WITH_SEQ = /[0-9〇一二三四五六七八九十]$/;
const CJK = /[一-鿿]/;

export type TitleMatch = { id: string; start: number; prevCjk: boolean };

/**
 * 標題 → 建案 id。長的案名先比；第一個過關的就是答案。
 * 回 null ＝ 標題裡沒有任何案名（或只有被格局數字騙到的那種）。
 */
export function matchByTitle(index: InventoryIndex, title: string): TitleMatch | null {
  const t = normalizeTitle(title);
  if (!t) return null;
  for (const { key, id } of index.names) {
    // 兩個字的名字只認開頭
    const at = key.length <= 2 ? (t.startsWith(key) ? 0 : -1) : t.indexOf(key);
    if (at < 0) continue;
    const after = t.slice(at + key.length, at + key.length + 1);
    if (ENDS_WITH_SEQ.test(key) && UNIT_AFTER.test(after)) continue;
    const prev = at > 0 ? t[at - 1] : "";
    return { id, start: at, prevCjk: CJK.test(prev) };
  }
  return null;
}

/** 兩點距離（公尺），haversine */
export function distanceM(a: CoordLike, b: CoordLike): number {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** ② 的門檻（公尺）。用正式庫實測調的，見檔頭 */
export const NEAR_MAX_M = 35;
export const NEAR_SECOND_MIN_M = 60;
export const NEAR_SECOND_RATIO = 2;
/** ① 的誤判保險：案名不在開頭、前一字是中文、又離圖釘這麼遠 → 不認 */
export const TITLE_FAR_M = 300;

/** 會在大樓／社區「裡面」的型態才拿座標去對 */
export const PROXIMITY_TYPES: ReadonlySet<string> = new Set(["電梯大樓", "華廈", "公寓", "套房", "透天厝", "店面", "辦公"]);
/** 這幾種不是某個社區裡的一戶 —— 標題有案名也不掛（「聯悅臻旁建地」是旁邊的地，不是聯悅臻的戶） */
export const NEVER_TYPES: ReadonlySet<string> = new Set(["土地", "農舍", "廠房"]);

export function nearestPins(index: InventoryIndex, pt: CoordLike): { first: { id: string; d: number } | null; second: { id: string; d: number } | null } {
  let first: { id: string; d: number } | null = null;
  let second: { id: string; d: number } | null = null;
  for (const p of index.pins) {
    const d = distanceM(pt, p);
    if (!first || d < first.d) {
      second = first;
      first = { id: p.id, d };
    } else if (!second || d < second.d) {
      second = { id: p.id, d };
    }
  }
  return { first, second };
}

/** 這一筆是出租嗎（同步只抓售，這是保險） */
export function isRental(title: string): boolean {
  return /^\s*(租|出租|月租|招租)/.test(String(title ?? ""));
}

export type Attribution = { projectId: string; how: "title" | "near" };

/** 一筆物件 → 掛在哪個建案底下；對不到回 null */
export function attributeListing(index: InventoryIndex, src: InventorySource): Attribution | null {
  if (isRental(src.title) || NEVER_TYPES.has(src.type)) return null;
  const pt = src.lat !== null && src.lng !== null ? { lat: src.lat, lng: src.lng } : null;

  const byTitle = matchByTitle(index, src.title);
  if (byTitle) {
    const pin = index.pinById.get(byTitle.id);
    const suspicious = byTitle.start > 0 && byTitle.prevCjk && pt && pin && distanceM(pt, pin) > TITLE_FAR_M;
    if (!suspicious) return { projectId: byTitle.id, how: "title" };
  }

  if (!pt || !PROXIMITY_TYPES.has(src.type)) return null;
  const { first, second } = nearestPins(index, pt);
  if (!first || first.d > NEAR_MAX_M) return null;
  if (second && (second.d < NEAR_SECOND_MIN_M || second.d < first.d * NEAR_SECOND_RATIO)) return null;
  return { projectId: first.id, how: "near" };
}

const posOrNull = (n: number): number | null => (Number.isFinite(n) && n > 0 ? n : null);

export function toInventoryItem(src: InventorySource, how: "title" | "near"): InventoryItem {
  const photo = src.images.find((u) => /^https?:\/\//i.test(String(u ?? ""))) ?? null;
  return {
    id: src.id,
    title: src.title,
    price: posOrNull(src.price),
    size: posOrNull(src.size),
    rooms: posOrNull(src.rooms),
    halls: src.rooms > 0 ? Math.max(0, src.halls) : null,
    baths: src.rooms > 0 ? Math.max(0, src.baths) : null,
    floor: String(src.floor ?? "").trim(),
    kind: String(src.type ?? "").trim(),
    age: posOrNull(src.age),
    photo,
    how,
  };
}

/** 便宜的排前面（跟精選好案同一條規則）；沒價格的墊底，同價比坪數大的 */
export function sortInventory(items: InventoryItem[]): InventoryItem[] {
  return [...items].sort((a, b) => {
    if (a.price === null && b.price !== null) return 1;
    if (a.price !== null && b.price === null) return -1;
    if (a.price !== null && b.price !== null && a.price !== b.price) return a.price - b.price;
    return (b.size ?? 0) - (a.size ?? 0);
  });
}

export type BuildOptions = {
  /** 已經在「我在這個建案的在售物件」出現過的 S 編號 */
  excludeIds?: ReadonlySet<string>;
  /** 建案 id → 他自己那幾戶的標題（正規化前的原字即可）—— 同建案同標題的也當同一戶 */
  excludeTitlesByProject?: Record<string, readonly string[]>;
};

/** 整份在售物件 → 建案 id → 物件清單（沒有物件的建案不會有 key） */
export function buildProjectInventory(index: InventoryIndex, sources: readonly InventorySource[], opts: BuildOptions = {}): ProjectInventoryMap {
  const excludeIds = opts.excludeIds ?? new Set<string>();
  const titleSets = new Map<string, Set<string>>();
  for (const [pid, titles] of Object.entries(opts.excludeTitlesByProject ?? {})) {
    titleSets.set(pid, new Set(titles.map(normalizeName).filter(Boolean)));
  }
  const out: Record<string, InventoryItem[]> = {};
  for (const src of sources) {
    const id = String(src.id ?? "").trim().toUpperCase();
    if (!id || excludeIds.has(id)) continue;
    const hit = attributeListing(index, src);
    if (!hit) continue;
    if (titleSets.get(hit.projectId)?.has(normalizeName(src.title))) continue;
    (out[hit.projectId] ??= []).push(toInventoryItem({ ...src, id }, hit.how));
  }
  for (const pid of Object.keys(out)) out[pid] = sortInventory(out[pid]);
  return out;
}

// ---------------------------------------------------------------- 顯示用

/** 1038 → 「1,038 萬」；小數保留到一位；null → 空字串 */
export function priceText(wan: number | null): string {
  if (wan === null || !Number.isFinite(wan) || wan <= 0) return "";
  const rounded = Math.round(wan * 10) / 10;
  return `${rounded.toLocaleString("zh-TW", { maximumFractionDigits: 1 })} 萬`;
}

/** 「14/15」→「14/15 樓」、「B1/14」→「B1/14 樓」、「1-3/3」→「1-3/3 樓」；空 → 空 */
export function floorLabel(floor: string): string {
  const f = String(floor ?? "").trim();
  return f ? `${f} 樓` : "";
}

/** 標題底下那一行：「39.13 坪・2房2廳1衛・14/15 樓・電梯大樓」，沒有的段落不出現 */
export function specText(it: InventoryItem): string {
  const parts: string[] = [];
  if (it.size !== null) parts.push(`${it.size.toLocaleString("zh-TW", { maximumFractionDigits: 2 })} 坪`);
  if (it.rooms !== null) parts.push(`${it.rooms}房${it.halls ?? 0}廳${it.baths ?? 0}衛`);
  const fl = floorLabel(it.floor);
  if (fl) parts.push(fl);
  if (it.kind) parts.push(it.kind);
  return parts.join("・");
}

/** 清單上那顆「在售 N」要算的數：他自己的 ＋ 官網對到的（已去重） */
export function inventoryCount(map: ProjectInventoryMap, projectId: string): number {
  return map[projectId]?.length ?? 0;
}
