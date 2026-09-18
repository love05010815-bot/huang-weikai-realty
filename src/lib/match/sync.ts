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
 *   - 價格異動（2026-09-18 他要的）：跟同步前的快照比價，有變動且買方條件對得上就一起通知，
 *     卡片多一行「🔻 降價 X 萬（原 Y 萬）」。新物件與價格異動是**兩則不同的訊息**，
 *     但合在同一次 push 送出（LINE 一次最多 5 則），不會因此多算一次連線。
 */
import { MATCH } from "@/config/match";
import { getConfig, setConfig } from "@/lib/google-calendar";
import { fetchAllListings } from "./houseol-fetch";
import { detectPriceChanges, type PriceChange as PriceDiff } from "./diff";
import { toListingUpsert, type ListingUpsert } from "./houseol-parse";
import { listingCarousel, priceChangeCarousel, pushMessages, text, type LineMessage } from "./line";
import { rankListings } from "./matcher";
import { ensureMatchTables, getListingSnapshot, hideListings, listBuyersForNotify, upsertListings } from "./store";
import { createBuyerToken } from "./token";

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
  /** 這次比對出幾筆價格異動 */
  priceChanged?: number;
  /** 價格異動太多，判定是解析出問題，沒有發通知 */
  priceChangeSkipped?: boolean;
  baseline?: boolean;
};

/** 每則推播結尾都提醒怎麼退訂 —— LINE 官方帳號的規矩，也省得他被檢舉 */
const OPT_OUT = "\n不想再收到可回覆「停止通知」。";

/** 一筆價格異動：物件本身，加上同步前的舊價（判斷邏輯在 lib/match/diff.ts，那邊有測試） */
type PriceChange = PriceDiff<ListingUpsert>;

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

  // 快照要在 upsert 之前拿：寫下去之後舊價格就被蓋掉了
  const before = await getListingSnapshot(storeId);
  const baseline = before.size === 0;
  const fresh = upserts.filter((l) => !before.has(l.id));
  const updated = upserts.length - fresh.length;

  // 價格異動（判斷規則與防呆見 lib/match/diff.ts）
  const priceChanges: PriceChange[] = detectPriceChanges(before, upserts);

  await upsertListings(upserts);

  let hidden = 0;
  if (complete) {
    const seen = new Set(upserts.map((l) => l.id));
    const gone = [...before].filter(([id, prev]) => prev.status === "available" && !seen.has(id)).map(([id]) => id);
    await hideListings(gone);
    hidden = gone.length;
  }

  // 一次冒出一大堆價格異動，多半是愛屋改版或解析壞了，不是真的全店降價 —— 擋下來只記數字。
  const priceChangeSkipped =
    !MATCH.notifyPriceChanges || priceChanges.length > MATCH.maxPriceChangesPerSync;
  if (priceChangeSkipped && priceChanges.length > MATCH.maxPriceChangesPerSync) {
    console.error(`[match/sync] 一次偵測到 ${priceChanges.length} 筆價格異動，超過上限，這次不發價格通知`);
  }
  const toNotifyPrice = priceChangeSkipped ? [] : priceChanges;

  const notifiedBuyers =
    baseline || (fresh.length === 0 && toNotifyPrice.length === 0) ? 0 : await notifyBuyers(fresh, toNotifyPrice);

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
    priceChanged: priceChanges.length,
    priceChangeSkipped,
    baseline,
  };
}

/**
 * 新物件與價格異動 → 推播給條件相符的買方；回推播了幾位。
 *
 * 兩種通知是分開的訊息（他要求「價格異動就跳價格異動通知、新案件就跳新物件通知」），
 * 但同一位買方兩種都有時合在**一次 push** 送出 —— LINE 一次最多 5 則，這樣最多 4 則還在範圍內。
 */
async function notifyBuyers(fresh: ListingUpsert[], priceChanges: PriceChange[]): Promise<number> {
  const buyers = await listBuyersForNotify();
  const changedListings = priceChanges.map((c) => c.listing);
  const priceFromById = new Map(priceChanges.map((c) => [c.listing.id, c.priceFrom]));
  let count = 0;

  for (const buyer of buyers) {
    if (count >= MATCH.maxNotifyBuyersPerSync) break;
    if (!buyer.lineUserId || !buyer.preference) continue;

    const newMatches = fresh.length
      ? rankListings(buyer.preference, fresh, { threshold: MATCH.threshold, limit: MATCH.maxListingsPerNotify })
      : [];
    const priceMatches = changedListings.length
      ? rankListings(buyer.preference, changedListings, { threshold: MATCH.threshold, limit: MATCH.maxListingsPerNotify })
      : [];
    if (!newMatches.length && !priceMatches.length) continue;

    // 卡片上的「預約看屋」帶這位買方的識別碼 —— 他用哪支手機點開都對得回同一筆，
    // 預約也就不會又生出一個沒綁 LINE 的買方（見 lib/match/token.ts）。
    const token = createBuyerToken(buyer.id);

    let newText = newMatches.length
      ? `🏠 有 ${newMatches.length} 個新物件符合您的條件（配對度 ${newMatches[0].score}% 起）`
      : "";
    let priceText = "";
    if (priceMatches.length) {
      const allDropped = priceMatches.every((m) => (priceFromById.get(m.listing.id) ?? 0) > m.listing.price);
      priceText = allDropped
        ? `🔻 您的條件內有 ${priceMatches.length} 個物件降價了`
        : `💰 您的條件內有 ${priceMatches.length} 個物件價格異動`;
    }
    // 退訂提醒接在**最後出現的那一則文字**後面 —— 另外再發一則等於白花一則額度
    if (priceText) priceText += OPT_OUT;
    else newText += OPT_OUT;

    const messages: LineMessage[] = [];
    if (newMatches.length) messages.push(text(newText), listingCarousel(newMatches, token));
    if (priceMatches.length) {
      messages.push(
        text(priceText),
        priceChangeCarousel(
          priceMatches.map((m) => ({ ...m, priceFrom: priceFromById.get(m.listing.id) ?? 0 })),
          token,
        ),
      );
    }

    const ok = await pushMessages(buyer.lineUserId, messages);
    if (ok) count++;
  }
  return count;
}
