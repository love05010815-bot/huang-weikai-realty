/**
 * 兩個物件來源怎麼合在同一張表 —— 純函式，不碰資料庫、不碰網路
 *
 * 2026-10-02 起物件有兩個來源（決定過程見 .claude/memory/project_buyer_match.md）：
 *   pacific  太平洋官網，海線七家店的物件。**主來源**。
 *   houseol  愛屋店網（梧棲店 storeid 4817）。只用來補梧棲店「官網沒上架」的那幾筆（實測 262 筆少 39 筆）。
 * 兩邊同一間物件的主鍵都是官網的 S 編號，所以會落在同一筆。
 *
 * 規則（每一條都有測試，scripts/check-match.mjs）：
 *   1. 兩個來源輪流跑，一次只跑一個 —— 官網約 10 秒、店網約 30 秒，一起跑會撞到 Vercel 60 秒的上限。
 *   2. 官網寫它看到的全部；店網只寫「官網目前沒有、或官網已經下架」的，官網有的那筆由官網作主。
 *      不然兩邊的價格偶爾差一點點，就會在每次輪替時互相蓋來蓋去、還觸發假的「價格異動」通知。
 *   3. 下架只動自己來源寫的那些：這次整份抓完整了、而且沒看到 → 下架。別人寫的不碰。
 *   4. 某個來源第一次跑（庫裡沒有它寫過的東西）當成「建立基準」，不推播 —— 不然換來源那天會把幾百筆當新物件推給所有人。
 *
 * ⚠️ 這個檔刻意不 import 任何 "@/..." 的東西：scripts/check-match.mjs 用 node 直接載它跑測試。
 */

export type Source = "pacific" | "houseol";

export const SOURCES: readonly Source[] = ["pacific", "houseol"];

/** 給後台顯示用的名稱（放這裡而不是 sync.ts：那支會拖進資料庫與 LINE，client component 不能 import） */
export const SOURCE_LABEL: Record<Source, string> = {
  pacific: "太平洋官網（海線七家店）",
  houseol: "愛屋店網（梧棲店補洞）",
};

/** 同步前的快照裡一筆的樣子（store.ts 的 getListingSnapshot） */
export type SnapshotRow = { status: string; price: number; src: string };

/**
 * 這次該跑哪個來源。都到期就挑最久沒跑的；都沒到期回 null。
 * 從來沒跑過的（lastOk 是 null）永遠算最久沒跑。
 */
export function pickDueSource(now: number, lastOk: Record<Source, string | null>, intervalMs: number): Source | null {
  let best: Source | null = null;
  let bestAt = Infinity;
  for (const src of SOURCES) {
    const raw = lastOk[src];
    const at = raw ? Date.parse(raw) : NaN;
    const okAt = Number.isFinite(at) ? at : -Infinity;
    if (now - okAt < intervalMs) continue;
    if (okAt < bestAt) {
      best = src;
      bestAt = okAt;
    }
  }
  return best;
}

/**
 * 店網那條路要寫哪些：官網已經有、而且還在售的跳過（官網作主）；
 * 其他的（庫裡沒有、店網自己寫的、官網已下架的）都寫。
 */
export function planHouseolWrites<T extends { id: string }>(items: T[], before: Map<string, SnapshotRow>): { upserts: T[]; skipped: number } {
  const upserts: T[] = [];
  let skipped = 0;
  for (const it of items) {
    const prev = before.get(it.id);
    if (prev && prev.src === "pacific" && prev.status === "available") skipped++;
    else upserts.push(it);
  }
  return { upserts, skipped };
}

/** 這次抓完整之後該下架的：這個來源寫的、還在售、這次沒看到 */
export function listingsToHide(before: Map<string, SnapshotRow>, seen: Set<string>, src: Source): string[] {
  const gone: string[] = [];
  for (const [id, prev] of before) {
    if (prev.src === src && prev.status === "available" && !seen.has(id)) gone.push(id);
  }
  return gone;
}

/** 這個來源是不是第一次跑（庫裡沒有它寫過的東西）→ 當基準，不推播 */
export function isBaseline(before: Map<string, SnapshotRow>, src: Source): boolean {
  for (const prev of before.values()) if (prev.src === src) return false;
  return true;
}

/** 價格異動只跟「自己來源上次寫的」比；別的來源寫的那筆價格可能差一點點，比了會變成假的異動 */
export function sameSourceSnapshot(before: Map<string, SnapshotRow>, src: Source): Map<string, SnapshotRow> {
  const out = new Map<string, SnapshotRow>();
  for (const [id, prev] of before) if (prev.src === src) out.set(id, prev);
  return out;
}
