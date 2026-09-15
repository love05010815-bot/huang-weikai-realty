/**
 * 愛屋店網 → match_listing 的同步，以及「新物件推播給條件相符的買方」
 *
 * 誰來觸發：
 *   - keep-warm 排程每 10 分鐘敲 /api/match/sync，這裡自己判斷「距上次成功不到 30 分鐘就不跑」，
 *     所以敲再多次也只是兩個 SELECT。跟 /api/news/daily 同一套想法，不需要密鑰。
 *   - 後台「立即同步」按鈕：force=true，不看間隔。
 *
 * 同步規則：
 *   - 以愛屋物件編號當主鍵，重複同步只更新、不重複建立。
 *   - 店網上消失的物件（成交、撤件）標成 hidden，配對結果就不會再出現。
 *     **只有在整份清單抓完整時才做**——抓一半就把沒看到的當下架，會把好物件誤殺。
 *   - 第一次同步（表是空的）當成「建立基準」，不推播——不然 276 戶會一次推給所有人。
 *   - 之後的新物件：對每位「綁了 LINE、留過條件」的買方評分，達門檻的戶數合成一則 carousel 推播；
 *     一次同步最多推給 MATCH.maxNotifyBuyersPerSync 位（省 200 則／月的額度）。
 */
import { MATCH } from "@/config/match";
import { getConfig, setConfig } from "@/lib/google-calendar";
import { fetchAllListings } from "./houseol-fetch";
import { toListingUpsert, type ListingUpsert } from "./houseol-parse";
import { listingCarousel, pushMessages, text } from "./line";
import { rankListings } from "./matcher";
import { ensureMatchTables, getListingStatusMap, hideListings, listBuyersForNotify, upsertListings } from "./store";

const KEY_LAST_OK = "match_sync_last_ok";
const KEY_LOCK = "match_sync_lock";
const KEY_LAST_RESULT = "match_sync_last_result";

/** 另一次同步還在跑就不重複跑；但鎖超過這麼久就當它死了（函式被 Vercel 砍掉不會來解鎖） */
const LOCK_STALE_MS = 3 * 60_000;
/** 抓店網的時間預算。函式上限 60 秒，剩下要留給寫資料庫與推播 */
const FETCH_BUDGET_MS = 36_000;

export type SyncSummary = {
  ran: boolean;
  ok: boolean;
  reason?: string;
  trigger?: "auto" | "manual";
  at?: string;
  ms?: number;
  storeName?: string;
  total?: number;
  fetched?: number;
  complete?: boolean;
  added?: number;
  updated?: number;
  hidden?: number;
  notifiedBuyers?: number;
  baseline?: boolean;
};

export async function getLastSyncResult(): Promise<SyncSummary | null> {
  const raw = await getConfig(KEY_LAST_RESULT);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SyncSummary;
  } catch {
    return null;
  }
}

export async function runHouseolSync({ force = false, trigger = "auto" }: { force?: boolean; trigger?: "auto" | "manual" } = {}): Promise<SyncSummary> {
  const startedAt = Date.now();
  await ensureMatchTables();

  if (!force) {
    const lastOk = await getConfig(KEY_LAST_OK);
    if (lastOk && Date.now() - Date.parse(lastOk) < MATCH.syncIntervalMin * 60_000) {
      return { ran: false, ok: true, reason: `距上次同步不到 ${MATCH.syncIntervalMin} 分鐘` };
    }
  }
  const lock = await getConfig(KEY_LOCK);
  if (lock && Date.now() - Date.parse(lock) < LOCK_STALE_MS) {
    return { ran: false, ok: true, reason: "另一次同步進行中" };
  }
  await setConfig(KEY_LOCK, new Date().toISOString());

  let summary: SyncSummary;
  try {
    summary = await doSync(trigger);
  } catch (e) {
    summary = { ran: true, ok: false, trigger, at: new Date().toISOString(), reason: e instanceof Error ? e.message : String(e) };
    console.error("[match/sync] 同步失敗:", e);
  } finally {
    await setConfig(KEY_LOCK, null);
  }
  summary.ms = Date.now() - startedAt;
  await setConfig(KEY_LAST_RESULT, JSON.stringify(summary));
  if (summary.ok) await setConfig(KEY_LAST_OK, new Date().toISOString());
  return summary;
}

async function doSync(trigger: "auto" | "manual"): Promise<SyncSummary> {
  const storeId = MATCH.houseolStoreId;
  const { total, items, complete, storeName } = await fetchAllListings(storeId, { budgetMs: FETCH_BUDGET_MS });

  const wanted = MATCH.houseolStoreCode ? items.filter((it) => it.storeCode === MATCH.houseolStoreCode) : items;
  const upserts: ListingUpsert[] = wanted.map((raw) => toListingUpsert(raw, storeId));

  const before = await getListingStatusMap(storeId);
  const baseline = before.size === 0;
  const fresh = upserts.filter((l) => !before.has(l.id));
  const updated = upserts.length - fresh.length;

  await upsertListings(upserts);

  let hidden = 0;
  if (complete) {
    const seen = new Set(upserts.map((l) => l.id));
    const gone = [...before].filter(([id, status]) => status === "available" && !seen.has(id)).map(([id]) => id);
    await hideListings(gone);
    hidden = gone.length;
  }

  const notifiedBuyers = baseline || fresh.length === 0 ? 0 : await notifyBuyers(fresh);

  return {
    ran: true,
    ok: true,
    trigger,
    at: new Date().toISOString(),
    storeName,
    total,
    fetched: items.length,
    complete,
    added: fresh.length,
    updated,
    hidden,
    notifiedBuyers,
    baseline,
  };
}

/** 新物件 → 推播給條件相符的買方；回推播了幾位 */
async function notifyBuyers(fresh: ListingUpsert[]): Promise<number> {
  const buyers = await listBuyersForNotify();
  let count = 0;
  for (const buyer of buyers) {
    if (count >= MATCH.maxNotifyBuyersPerSync) break;
    if (!buyer.lineUserId || !buyer.preference) continue;
    const matches = rankListings(buyer.preference, fresh, { threshold: MATCH.threshold, limit: MATCH.maxListingsPerNotify });
    if (!matches.length) continue;
    const ok = await pushMessages(buyer.lineUserId, [
      text(`🏠 有 ${matches.length} 個新物件符合您的條件（配對度 ${matches[0].score}% 起）`),
      listingCarousel(matches),
    ]);
    if (ok) count++;
  }
  return count;
}
