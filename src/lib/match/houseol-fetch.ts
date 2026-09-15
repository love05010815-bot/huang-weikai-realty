/**
 * 從愛屋店網抓在售物件 —— 只負責「拿回來、解析好」，不碰資料庫
 *
 * 做法：直接呼叫店網前端載入列表用的同一個端點
 *   POST https://www.houseol.com.tw/Function/Ajax/SearchObj.aspx
 *   StoreList=<storeid>&RS_Type=2（售案）&EventType=AllObj&Pg1=<頁碼>…
 * 一頁 10 筆，先抓第 1 頁拿總筆數，其餘頁面幾頁並行。
 *
 * 為什麼不用之前那套「登入愛屋後台用 Playwright 抓」：登入那條路 2026-08-25 已經放棄
 * （見 .github/workflows/houseol-sync.yml 的註解）。店網是公開頁，不用登入、沒有 WAF 擋，
 * 而且回的是結構化欄位，比書籤小工具穩得多。
 *
 * ⚠️ 有時間預算（budgetMs）：Vercel 函式最多跑 60 秒，抓不完就先回「不完整」，
 *    呼叫端看 complete 決定要不要把「這次沒看到的物件」當成下架。
 */
import { parseBlocks, splitResponse, type RawHouseolItem } from "./houseol-parse";

const SITE = "https://www.houseol.com.tw";
const UA = "Mozilla/5.0 (compatible; weikaihouse-match-sync/1.0)";

export type FetchAllResult = {
  total: number;
  items: RawHouseolItem[];
  /** 有沒有把全部頁面抓完。false = 超過時間預算或某頁失敗，items 只是部分 */
  complete: boolean;
  pagesFetched: number;
  storeName: string;
};

/**
 * 開店網首頁只為了拿店名。
 *
 * ⚠️ 刻意**不帶它回的 cookie** 去抓列表：那是 ASP.NET 的 session cookie，同一個 session 的請求
 *    伺服器會排隊處理（實測 4 頁並行要 12 秒，不帶 cookie 只要 4 秒）。不帶 cookie 端點照樣回資料。
 */
async function openStore(storeId: string): Promise<{ storeName: string }> {
  const res = await fetch(`${SITE}/sell_item?storeid=${encodeURIComponent(storeId)}`, {
    headers: { "User-Agent": UA },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`店網首頁回應 ${res.status}`);
  const html = await res.text();
  const storeName = (html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "").split("|")[0].trim();
  return { storeName };
}

export async function fetchPage(storeId: string, page: number): Promise<{ total: number; items: RawHouseolItem[] }> {
  const body = new URLSearchParams({
    HotObj: "0",
    TabID: "Obj_List",
    RS_Type: "2",
    StoreList: String(storeId),
    EventType: "AllObj",
    Pg1_ID: "Pg1",
    Pg1: String(page),
    OrderS_ID: "OrderS",
    OrderS: "",
    RawUrl: `/sell_item?storeid=${storeId}`,
    rnd: String(Math.random()),
  });
  const res = await fetch(`${SITE}/Function/Ajax/SearchObj.aspx`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${SITE}/sell_item?storeid=${storeId}`,
      "User-Agent": UA,
    },
    body: body.toString(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`店網列表第 ${page} 頁回應 ${res.status}`);
  const { total, html } = splitResponse(await res.text());
  return { total, items: parseBlocks(html) };
}

/**
 * 逐頁抓完整份在售清單（以物件編號去重）。
 *
 * @param budgetMs 時間預算（毫秒）。到了就停，回 complete=false。
 * @param concurrency 同時抓幾頁。不帶 cookie 時一頁約 4 秒、並行不互相拖累：6 頁並行，28 頁約 22 秒。
 */
export async function fetchAllListings(
  storeId: string,
  { budgetMs = 40_000, concurrency = 6, maxPages = 200 }: { budgetMs?: number; concurrency?: number; maxPages?: number } = {},
): Promise<FetchAllResult> {
  const startedAt = Date.now();
  const { storeName } = await openStore(storeId);
  const seen = new Map<string, RawHouseolItem>();
  const collect = (items: RawHouseolItem[]) => {
    for (const it of items) if (!seen.has(it.objId)) seen.set(it.objId, it);
  };

  const first = await fetchPage(storeId, 1);
  collect(first.items);
  const total = first.total || first.items.length;
  const perPage = first.items.length || 10;
  const pages = Math.min(maxPages, Math.ceil(total / perPage));
  let pagesFetched = 1;

  for (let page = 2; page <= pages; page += concurrency) {
    if (Date.now() - startedAt > budgetMs) {
      return { total, items: [...seen.values()], complete: false, pagesFetched, storeName };
    }
    const batch: Promise<{ total: number; items: RawHouseolItem[] }>[] = [];
    for (let p = page; p < page + concurrency && p <= pages; p++) batch.push(fetchPage(storeId, p));
    const results = await Promise.all(batch);
    pagesFetched += results.length;
    for (const r of results) collect(r.items);
    if (seen.size >= total) break;
  }

  // 抓到的比總數少（例如中途有一頁是空的）也算不完整，避免把沒抓到的當成下架
  const complete = seen.size >= Math.min(total, pages * perPage) || seen.size >= total;
  return { total, items: [...seen.values()], complete, pagesFetched, storeName };
}
