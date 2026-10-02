/**
 * 物件同步（太平洋官網 ＋ 愛屋店網 → match_listing），以及「新物件／價格異動推播給條件相符的買方」
 *
 * 兩個來源（2026-10-02 起，規則與原因見 lib/match/merge.ts）：
 *   pacific  太平洋官網 www.pacific.com.tw 的查詢 API，海線七家店（config/match.ts 的 PACIFIC_STORES）。主來源。
 *   houseol  愛屋店網 storeid 4817 的公開頁，只補梧棲店「官網沒上架」的那幾筆。
 *
 * 誰來觸發：
 *   - keep-warm 排程每 10 分鐘敲 /api/match/sync。這裡自己判斷哪個來源「距上次成功超過 30 分鐘」，
 *     **一次只跑一個**（官網約 10 秒、店網約 30 秒，一起跑會撞到 Vercel 60 秒的上限）；都沒到期就只是幾個 SELECT。
 *     跟 /api/news/daily 同一套想法，不需要密鑰。
 *   - 後台「立即同步」按鈕：force=true 指定來源，不看間隔（後台會兩個來源各按一次）。
 *
 * 同步規則：
 *   - 主鍵是官網的 S 編號（店網網址裡也是同一個），兩邊同一間落在同一筆。重複同步只更新、不重複建立。
 *   - 官網寫它看到的全部；店網只寫「官網目前沒有、或官網已下架」的，官網有的由官網作主。
 *   - 消失的物件（成交、撤件）標成 hidden，配對結果就不會再出現 —— 只動自己來源寫的，
 *     而且**只有在整份清單抓完整時才做**：抓一半就把沒看到的當下架，會把好物件誤殺。
 *   - 某個來源第一次跑（庫裡沒有它寫過的東西）當成「建立基準」，不推播 —— 不然換來源那天會把幾百筆當新物件推給所有人。
 *   - 之後的新物件：對每位「綁了 LINE、留過條件」的買方評分，達門檻的戶數合成一則 carousel 推播；
 *     一次同步最多推給 MATCH.maxNotifyBuyersPerSync 位（省 200 則／月的額度）。
 *   - 價格異動（2026-09-18 他要的）：跟同步前的快照比價，有變動且買方條件對得上就一起通知，
 *     卡片多一行「🔻 降價 X 萬（原 Y 萬）」。只跟自己來源上次寫的比，避免兩個來源價格差一點點變成假異動。
 *     新物件與價格異動是**兩則不同的訊息**，但合在同一次 push 送出（LINE 一次最多 5 則）。
 */
import { MATCH, PACIFIC_CITY, PACIFIC_DISTRICTS, PACIFIC_STORES } from "@/config/match";
import { getConfig, setConfig } from "@/lib/google-calendar";
import { detectPriceChanges, type PriceChange as PriceDiff } from "./diff";
import { fetchAllListings } from "./houseol-fetch";
import { toListingUpsert, type ListingUpsert } from "./houseol-parse";
import { listingCarousel, priceChangeCarousel, pushMessages, text, type LineMessage } from "./line";
import { rankListings } from "./matcher";
import { isBaseline, listingsToHide, pickDueSource, planHouseolWrites, sameSourceSnapshot, SOURCE_LABEL, SOURCES, type Source } from "./merge";
import { fetchPacificListings } from "./pacific-fetch";
import { pacificToListingUpsert } from "./pacific-parse";
import { deleteLegacyListings, ensureMatchTables, getListingSnapshot, hideListings, listBuyersForNotify, upsertListings } from "./store";
import { createBuyerToken } from "./token";

export type { Source } from "./merge";
export { SOURCES, SOURCE_LABEL } from "./merge";

const KEY_LOCK = "match_sync_lock";
const keyLastOk = (src: Source) => `match_sync_last_ok_${src}`;
const keyLastResult = (src: Source) => `match_sync_last_result_${src}`;

/** 另一次同步還在跑就不重複跑；但鎖超過這麼久就當它死了（函式被 Vercel 砍掉不會來解鎖） */
const LOCK_STALE_MS = 3 * 60_000;
/** 抓資料的時間預算。函式上限 60 秒，剩下要留給寫資料庫與推播 */
const FETCH_BUDGET_MS = 38_000;

export type SyncSummary = {
  ran: boolean;
  ok: boolean;
  reason?: string;
  source?: Source;
  trigger?: "auto" | "manual";
  at?: string;
  ms?: number;
  /** 店網：店名；官網：來源名稱 */
  storeName?: string;
  /** 來源說它有幾筆（官網是八區全部、含別家） */
  total?: number;
  /** 抓到幾筆（官網：過濾完只剩七家店的） */
  fetched?: number;
  complete?: boolean;
  added?: number;
  updated?: number;
  /** 店網：官網已經有、讓給官網的筆數 */
  skipped?: number;
  hidden?: number;
  /** 清掉幾筆換主鍵前的舊格式資料 */
  removedLegacy?: number;
  notifiedBuyers?: number;
  /** 這次比對出幾筆價格異動 */
  priceChanged?: number;
  /** 價格異動太多，判定是解析出問題，沒有發通知 */
  priceChangeSkipped?: boolean;
  baseline?: boolean;
  /** 官網：各店幾筆 */
  stores?: Record<string, number>;
};

/** 每則推播結尾都提醒怎麼退訂 —— LINE 官方帳號的規矩，也省得他被檢舉 */
const OPT_OUT = "\n不想再收到可回覆「停止通知」。";

/** 一筆價格異動：物件本身，加上同步前的舊價（判斷邏輯在 lib/match/diff.ts，那邊有測試） */
type PriceChange = PriceDiff<ListingUpsert>;

export async function getLastSyncResult(src: Source): Promise<SyncSummary | null> {
  const raw = await getConfig(keyLastResult(src));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SyncSummary;
  } catch {
    return null;
  }
}

/** 後台用：兩個來源各自最近一次的結果 */
export async function getLastSyncResults(): Promise<Record<Source, SyncSummary | null>> {
  const [pacific, houseol] = await Promise.all([getLastSyncResult("pacific"), getLastSyncResult("houseol")]);
  return { pacific, houseol };
}

export function isSource(v: unknown): v is Source {
  return typeof v === "string" && (SOURCES as readonly string[]).includes(v);
}

/**
 * 跑一次同步。
 *   source 沒給：自動挑「距上次成功超過 syncIntervalMin 分鐘」的來源，一次只跑一個；都沒到期就不跑。
 *   source 有給＋force：不看間隔立刻跑那一個（後台按鈕）。
 */
export async function runListingSync({
  force = false,
  trigger = "auto",
  source,
}: { force?: boolean; trigger?: "auto" | "manual"; source?: Source } = {}): Promise<SyncSummary> {
  const startedAt = Date.now();
  await ensureMatchTables();

  let picked: Source | null = source ?? null;
  if (!picked || !force) {
    const lastOk = { pacific: await getConfig(keyLastOk("pacific")), houseol: await getConfig(keyLastOk("houseol")) };
    const due = pickDueSource(Date.now(), lastOk, MATCH.syncIntervalMin * 60_000);
    if (picked) {
      // 指定了來源但沒 force：還沒到期就不跑
      const okAt = lastOk[picked] ? Date.parse(lastOk[picked] as string) : NaN;
      if (Number.isFinite(okAt) && Date.now() - okAt < MATCH.syncIntervalMin * 60_000) {
        return { ran: false, ok: true, source: picked, reason: `距上次同步不到 ${MATCH.syncIntervalMin} 分鐘` };
      }
    } else {
      if (!due) return { ran: false, ok: true, reason: `兩個來源都在 ${MATCH.syncIntervalMin} 分鐘內同步過` };
      picked = due;
    }
  }

  const lock = await getConfig(KEY_LOCK);
  if (lock && Date.now() - Date.parse(lock) < LOCK_STALE_MS) {
    return { ran: false, ok: true, source: picked, reason: "另一次同步進行中" };
  }
  await setConfig(KEY_LOCK, new Date().toISOString());

  let summary: SyncSummary;
  try {
    summary = picked === "pacific" ? await syncPacific(trigger) : await syncHouseol(trigger);
  } catch (e) {
    summary = { ran: true, ok: false, source: picked, trigger, at: new Date().toISOString(), reason: e instanceof Error ? e.message : String(e) };
    console.error(`[match/sync] ${picked} 同步失敗:`, e);
  } finally {
    await setConfig(KEY_LOCK, null);
  }
  summary.ms = Date.now() - startedAt;
  await setConfig(keyLastResult(picked), JSON.stringify(summary));
  if (summary.ok) await setConfig(keyLastOk(picked), new Date().toISOString());
  return summary;
}

/** 太平洋官網：海線八區逐區抓，只留七家店 */
async function syncPacific(trigger: "auto" | "manual"): Promise<SyncSummary> {
  const r = await fetchPacificListings({
    city: PACIFIC_CITY,
    districts: PACIFIC_DISTRICTS,
    storeCodes: Object.keys(PACIFIC_STORES),
    budgetMs: FETCH_BUDGET_MS,
  });
  const upserts = r.items.map((it) => pacificToListingUpsert(it, { phone: PACIFIC_STORES[it.storeID]?.phone }));
  const stores: Record<string, number> = {};
  for (const l of upserts) stores[l.storeId] = (stores[l.storeId] ?? 0) + 1;

  const seen = new Set(upserts.map((l) => l.id));
  const out = await writeAndNotify("pacific", trigger, upserts, seen, r.complete);
  return { ...out, storeName: SOURCE_LABEL.pacific, total: r.total, fetched: upserts.length, stores };
}

/** 愛屋店網：梧棲店整份抓，官網已經有的讓給官網 */
async function syncHouseol(trigger: "auto" | "manual"): Promise<SyncSummary> {
  const r = await fetchAllListings(MATCH.houseolStoreId, { budgetMs: FETCH_BUDGET_MS, concurrency: 8 });
  const wanted = MATCH.houseolStoreCode ? r.items.filter((it) => it.storeCode === MATCH.houseolStoreCode) : r.items;
  const all = wanted.map((raw) => toListingUpsert(raw, MATCH.houseolPacificStore));

  // 快照要在 upsert 之前拿：寫下去之後舊價格就被蓋掉了
  const before = await getListingSnapshot();
  const { upserts, skipped } = planHouseolWrites(all, before);
  // 「看到」要算店網這次抓到的全部（含讓給官網的），不然讓出去那幾筆會被當成消失
  const seen = new Set(all.map((l) => l.id));
  const out = await writeAndNotify("houseol", trigger, upserts, seen, r.complete, before);
  return { ...out, storeName: r.storeName, total: r.total, fetched: all.length, skipped };
}

/**
 * 兩個來源共用的後半段：比對快照 → 寫入 → 下架 → 清舊格式 → 推播。
 * before 可以由呼叫端先拿（店網要先用它決定寫哪些）。
 */
async function writeAndNotify(
  source: Source,
  trigger: "auto" | "manual",
  upserts: ListingUpsert[],
  seen: Set<string>,
  complete: boolean,
  before?: Map<string, { status: string; price: number; src: string }>,
): Promise<SyncSummary> {
  const snapshot = before ?? (await getListingSnapshot());
  const baseline = isBaseline(snapshot, source);
  const fresh = upserts.filter((l) => !snapshot.has(l.id));
  const updated = upserts.length - fresh.length;

  // 價格異動（判斷規則與防呆見 lib/match/diff.ts）—— 只跟自己來源上次寫的比
  const priceChanges: PriceChange[] = detectPriceChanges(sameSourceSnapshot(snapshot, source), upserts);

  await upsertListings(upserts);

  let hidden = 0;
  let removedLegacy = 0;
  if (complete) {
    const gone = listingsToHide(snapshot, seen, source);
    await hideListings(gone);
    hidden = gone.length;
    // 換主鍵（2026-10-02）之前的舊資料：只要有一個來源完整跑過一次，就可以清了
    if (upserts.length > 0) removedLegacy = await deleteLegacyListings();
  }

  // 一次冒出一大堆價格異動，多半是解析壞了或官網改版，不是真的全店降價 —— 擋下來只記數字。
  const priceChangeSkipped = !MATCH.notifyPriceChanges || priceChanges.length > MATCH.maxPriceChangesPerSync;
  if (priceChangeSkipped && priceChanges.length > MATCH.maxPriceChangesPerSync) {
    console.error(`[match/sync] ${source} 一次偵測到 ${priceChanges.length} 筆價格異動，超過上限，這次不發價格通知`);
  }
  const toNotifyPrice = priceChangeSkipped ? [] : priceChanges;

  const notifiedBuyers = baseline || (fresh.length === 0 && toNotifyPrice.length === 0) ? 0 : await notifyBuyers(fresh, toNotifyPrice);

  return {
    ran: true,
    ok: true,
    source,
    trigger,
    at: new Date().toISOString(),
    complete,
    added: fresh.length,
    updated,
    hidden,
    removedLegacy,
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
