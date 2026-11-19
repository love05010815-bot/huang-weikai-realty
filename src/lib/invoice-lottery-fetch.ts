/**
 * 統一發票中獎號碼 —— 向財政部抓（只在伺服器跑）。解析在 invoice-lottery.ts。
 *
 * 快取：unstable_cache 一小時，**只存成功的**（失敗 throw、不進快取，下次再試）；頁面本身 ISR 一小時。
 * ⚠️ fetch 不要寫 cache:"no-store" —— 會把 /invoice 整頁變成動態（learning_fetch_no_store_kills_isr）。
 *
 * 順序：官方中獎號碼單兩頁（最新一期＋上一期，有領獎期間）→ 讀不到改用官方 RSS（只有號碼）→ 都不行回 null，
 * 頁面會明講「讀不到」並給官方連結，不拿舊號碼充數。
 */
import { unstable_cache } from "next/cache";
import { type InvoiceDraw, parseInvoiceHtml, parseInvoiceRss } from "@/lib/invoice-lottery";

export const INVOICE_OFFICIAL_URL = "https://invoice.etax.nat.gov.tw/";
const LATEST_URL = "https://invoice.etax.nat.gov.tw/index.html";
const PREVIOUS_URL = "https://invoice.etax.nat.gov.tw/lastNumber.html";
const RSS_URL = "https://invoice.etax.nat.gov.tw/invoice.xml";

export type InvoiceData = {
  /** 新的在前面；一到兩期 */
  draws: InvoiceDraw[];
  /** page＝官方中獎號碼單；rss＝備援（沒有領獎期間） */
  source: "page" | "rss";
};

async function getText(url: string, timeoutMs: number): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; invoice-checker)", Accept: "text/html,application/xml" },
  });
  if (!res.ok) throw new Error(`${url} 回 ${res.status}`);
  return res.text();
}

async function fromPages(): Promise<InvoiceData> {
  const [latestHtml, previousHtml] = await Promise.all([
    getText(LATEST_URL, 8000),
    // 上一期讀不到不擋最新一期
    getText(PREVIOUS_URL, 8000).catch(() => null),
  ]);
  const latest = parseInvoiceHtml(latestHtml);
  if (!latest.ok) throw new Error(`最新一期：${latest.error}`);
  const draws = [latest.value];
  if (previousHtml) {
    const previous = parseInvoiceHtml(previousHtml);
    // 兩頁回同一期（官方剛換期、還沒搬）就只留一份
    if (previous.ok && previous.value.special !== latest.value.special) draws.push(previous.value);
    else if (!previous.ok) console.error("[invoice] 上一期解析失敗：", previous.error);
  }
  return { draws, source: "page" };
}

async function fromRss(): Promise<InvoiceData> {
  const parsed = parseInvoiceRss(await getText(RSS_URL, 8000));
  if (!parsed.ok) throw new Error(parsed.error);
  return { draws: parsed.value.slice(0, 2), source: "rss" };
}

const loadCached = unstable_cache(
  async (): Promise<InvoiceData> => {
    try {
      return await fromPages();
    } catch (e) {
      console.error("[invoice] 官方中獎號碼單讀不到，改用 RSS：", e instanceof Error ? e.message : e);
      return await fromRss();
    }
  },
  ["invoice-lottery-v1"],
  { revalidate: 3600, tags: ["invoice-lottery"] },
);

export async function loadInvoiceData(): Promise<InvoiceData | null> {
  try {
    return await loadCached();
  } catch (e) {
    console.error("[invoice] 中獎號碼讀不到：", e instanceof Error ? e.message : e);
    return null;
  }
}
