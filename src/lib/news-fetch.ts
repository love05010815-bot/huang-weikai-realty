/**
 * 📰 房產新聞抓取 —— 只負責「從網路抓回來、分區、過濾」，不碰資料庫。
 *
 * 來源兩種：
 *   1. Google 新聞 RSS 搜尋：地區名 × 房市主題詞（海線、中部各一條查詢）＋全台關鍵字逐一查。
 *      Google 給的連結是 news.google.com 的轉址，要另外解碼才拿得到真正的網址。
 *   2. 直接訂閱的 RSS（設定在 `config/news.ts`）。
 *
 * 三道關卡，順序固定：
 *   ① 房產相關：標題或摘要要有房市／建案／租金之類的字，只提到地名的政治、運動、美食一律丟掉。
 *   ② 地區分級：先看海線地名、再看中部，都沒有就是全台。**不是**「從海線查詢來的就算海線」——
 *      Google 的地區查詢常混入台北大安區、萬華美食這種東西。
 *   ③ 去重：同一則新聞會從好幾條查詢回來，用「標題去掉標點」當 key；
 *      同標題保留較優先的地區、較好的連結（直連勝過 Google 轉址）。
 *
 * ⚠️ 全文擷取有時間預算（Vercel 函式最多 60 秒）：海線、中部先處理，來不及的只留標題與連結。
 *    Google 解碼同一天連打太多次會被 429，撞到就停止解碼、其餘保留原連結，明天再來。
 */
import { NEWS_CONFIG, NEWS_REGION_ORDER, type NewsRegion } from "@/config/news";
import { htmlToText } from "@/lib/html-to-text";

export type FetchedNews = {
  title: string;
  url: string;
  source: string;
  /** RSS 的摘要（Google 新聞沒有摘要，會是空字串） */
  summary: string;
  /** 抓到的全文，沒抓到是 null */
  content: string | null;
  /** 台北時間 `YYYY-MM-DD HH:MM:SS`，RSS 沒給日期就是 null */
  publishedAt: string | null;
  region: NewsRegion;
};

export type LogFn = (line: string) => void;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const GOOGLE_ARTICLE_RE = /news\.google\.com\/(?:rss\/)?articles\/([^/?#]+)/;

/** Google 解碼被限流（HTTP 429）。跟一般錯誤分開，撞到就整批停止解碼。 */
export class GoogleRateLimited extends Error {
  constructor() {
    super("Google 暫時限制解碼請求");
    this.name = "GoogleRateLimited";
  }
}

// ---------------------------------------------------------------- 小工具

/** 台北時間字串 `YYYY-MM-DD HH:MM:SS`。台灣沒有日光節約時間，固定 +8。 */
export function taipeiStamp(d: Date = new Date()): string {
  return new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
}

/** 去掉標點、空白、符號並轉小寫，用來判斷「同一則新聞」。保留任何文字的字母與數字（含中文）。 */
export function normalizeTitle(title: string): string {
  return (title || "").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
}

/** 把 HTML 片段變成一行乾淨文字（去標籤、還原 entity、壓空白）。 */
function cleanText(fragment: string): string {
  return htmlToText(fragment).replace(/\s+/g, " ").trim();
}

function stripCdata(s: string): string {
  return s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
}

/** 取 XML 區塊裡某個標籤的內容（容許屬性與 CDATA）。 */
function tagText(block: string, name: string): string {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i");
  const m = re.exec(block);
  return m ? stripCdata(m[1]).trim() : "";
}

/** RFC822 之類的日期 → 台北時間字串。解析不了回 null。 */
export function parseDateToTaipei(raw: string): string | null {
  let s = (raw || "").trim();
  if (!s) return null;
  // ETtoday 的 pubDate 長這樣：「Mon,14 Sep 2026 18:13:00 +0800」—— 逗號後少一個空格
  s = s.replace(/^([A-Za-z]{3}),(\S)/, "$1, $2");
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return taipeiStamp(new Date(t));
}

type FetchResult = { status: number; text: string; url: string; contentType: string };

async function fetchText(url: string, timeoutMs: number, init: RequestInit = {}): Promise<FetchResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      redirect: "follow",
      cache: "no-store",
      headers: {
        "user-agent": UA,
        "accept-language": "zh-TW,zh;q=0.9,en;q=0.5",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    const text = await res.text();
    return { status: res.status, text, url: res.url, contentType: res.headers.get("content-type") || "" };
  } finally {
    clearTimeout(timer);
  }
}

/** 簡單的工作池：N 個 worker 輪流從佇列拿工作，過了 deadline 就不再拿新的。 */
async function runPool<T>(items: T[], workers: number, deadline: number, work: (item: T) => Promise<void>) {
  let next = 0;
  async function worker() {
    while (next < items.length && Date.now() < deadline) {
      const item = items[next++];
      try {
        await work(item);
      } catch {
        // 單一項目失敗不影響其他項目；錯誤由 work 自己記錄
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, workers) }, () => worker()));
}

// ---------------------------------------------------------------- 分級與相關性

function regionRank(region: NewsRegion): number {
  return NEWS_REGION_ORDER.indexOf(region);
}

function placeHit(term: string, head: string, body: string, full: string): boolean {
  if (!term) return false;
  if (
    (NEWS_CONFIG.ambiguousPlaces as readonly string[]).includes(term) &&
    !NEWS_CONFIG.placeHints.some((h) => full.includes(h))
  ) {
    return false;
  }
  // 標題／摘要出現一次就算；只在內文出現的話要兩次以上，避免順帶一提的比較
  if (head.includes(term)) return true;
  return body.split(term).length - 1 >= 2;
}

/** 依內容判斷地區：先海線、再中部，都沒有就是全台。 */
export function classifyRegion(item: Pick<FetchedNews, "title" | "summary" | "content">): NewsRegion {
  const head = `${item.title} ${item.summary}`;
  const body = item.content || "";
  const full = `${head} ${body}`;
  if (NEWS_CONFIG.coastPlaces.some((t) => placeHit(t, head, body, full))) return "coast";
  if (NEWS_CONFIG.centralPlaces.some((t) => placeHit(t, head, body, full))) return "central";
  return "national";
}

/** 標題或摘要有沒有房地產用語。 */
export function isHousingNews(title: string, summary: string): boolean {
  const head = `${title} ${summary}`;
  const terms: readonly string[] = [...NEWS_CONFIG.housingTerms, ...NEWS_CONFIG.topicTerms];
  return terms.some((t) => head.includes(t));
}

export function isGoogleLink(url: string): boolean {
  return GOOGLE_ARTICLE_RE.test(url || "");
}

// ---------------------------------------------------------------- RSS 解析

type RawItem = { title: string; link: string; description: string; pubDate: string; source: string };

/** 把 RSS 2.0 的 XML 拆成一筆一筆。不用 XML 套件 —— 新聞 RSS 的結構很固定，正規表達式夠用。 */
export function parseRssItems(xml: string): RawItem[] {
  const out: RawItem[] = [];
  const re = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const b = m[1];
    let link = tagText(b, "link").replace(/\s+/g, "");
    if (!/^https?:/i.test(link)) {
      const guid = tagText(b, "guid");
      if (/^https?:/i.test(guid)) link = guid.trim();
    }
    out.push({
      title: cleanText(tagText(b, "title")),
      link,
      description: tagText(b, "description"),
      pubDate: tagText(b, "pubDate") || tagText(b, "dc:date"),
      source: cleanText(tagText(b, "source")),
    });
  }
  return out;
}

function googleNewsUrl(query: string, days: number): string {
  const q = `${query} when:${days}d`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
}

type Query = { region: NewsRegion; label: string; query: string; days: number };

function buildQueries(): Query[] {
  const topics = NEWS_CONFIG.topicTerms.join(" OR ");
  const list: Query[] = [
    {
      region: "coast",
      label: "海線在地",
      query: `(${NEWS_CONFIG.coastPlaces.join(" OR ")}) (${topics})`,
      days: NEWS_CONFIG.regionDays.coast,
    },
    {
      region: "central",
      label: "中部房市",
      query: `(${NEWS_CONFIG.centralPlaces.join(" OR ")}) (${topics})`,
      days: NEWS_CONFIG.regionDays.central,
    },
  ];
  for (const kw of NEWS_CONFIG.nationalKeywords) {
    list.push({ region: "national", label: `全台／${kw}`, query: kw, days: NEWS_CONFIG.regionDays.national });
  }
  return list;
}

/** Google 新聞的標題格式是「標題 - 媒體名稱」，把媒體名拆出來。 */
function splitGoogleTitle(title: string, source: string): { title: string; source: string } {
  if (source && title.endsWith(` - ${source}`)) {
    return { title: title.slice(0, -(source.length + 3)).trim(), source };
  }
  const idx = title.lastIndexOf(" - ");
  if (idx > 0) return { title: title.slice(0, idx).trim(), source: source || title.slice(idx + 3).trim() };
  return { title, source };
}

// ---------------------------------------------------------------- 第一步：抓清單

export type CollectResult = { items: FetchedNews[]; counts: Record<NewsRegion, number> };

/**
 * 抓所有來源，回傳去重、分級、過濾後的清單（還沒有全文，也還沒進資料庫）。
 * 每個來源獨立 try，一個來源掛掉不影響其他。
 */
export async function collectNews(log: LogFn): Promise<CollectResult> {
  const now = Date.now();
  const found = new Map<string, FetchedNews>();

  function add(item: FetchedNews, days: number, requireTopic: boolean): "added" | "dup" | "old" | "irrelevant" | "invalid" {
    if (!item.title || !/^https?:/i.test(item.url)) return "invalid";
    if (item.publishedAt) {
      const t = Date.parse(item.publishedAt.replace(" ", "T") + "+08:00");
      if (!Number.isNaN(t) && t < now - days * 86_400_000) return "old";
    }
    if (requireTopic && !isHousingNews(item.title, item.summary)) return "irrelevant";
    item.region = classifyRegion(item);
    const key = normalizeTitle(item.title);
    const existing = found.get(key);
    if (!existing) {
      found.set(key, item);
      return "added";
    }
    if (regionRank(item.region) < regionRank(existing.region)) existing.region = item.region;
    if (isGoogleLink(existing.url) && !isGoogleLink(item.url)) {
      found.set(key, { ...item, region: existing.region });
    }
    return "dup";
  }

  const tasks: Array<() => Promise<void>> = [];

  for (const q of buildQueries()) {
    tasks.push(async () => {
      try {
        const res = await fetchText(googleNewsUrl(q.query, q.days), 12_000);
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        const raws = parseRssItems(res.text);
        let added = 0;
        let skipped = 0;
        for (const r of raws) {
          const st = splitGoogleTitle(r.title, r.source);
          const result = add(
            {
              title: st.title,
              url: r.link,
              source: st.source,
              summary: "",
              content: null,
              publishedAt: parseDateToTaipei(r.pubDate),
              region: "national",
            },
            q.days,
            true,
          );
          if (result === "added") added += 1;
          if (result === "irrelevant") skipped += 1;
        }
        log(`Google 新聞（${q.label}）：${raws.length} 則，新增 ${added} 則，非房產相關略過 ${skipped} 則`);
      } catch (e) {
        log(`Google 新聞（${q.label}）抓取失敗：${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  for (const feed of NEWS_CONFIG.rssFeeds) {
    tasks.push(async () => {
      try {
        const res = await fetchText(feed.url, 12_000);
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        const raws = parseRssItems(res.text);
        let added = 0;
        let skipped = 0;
        for (const r of raws) {
          const result = add(
            {
              title: r.title,
              url: r.link,
              source: feed.name,
              summary: cleanText(r.description).slice(0, 500),
              content: null,
              publishedAt: parseDateToTaipei(r.pubDate),
              region: "national",
            },
            NEWS_CONFIG.regionDays.national,
            feed.filter,
          );
          if (result === "added") added += 1;
          if (result === "irrelevant") skipped += 1;
        }
        log(`RSS ${feed.name}：${raws.length} 則，新增 ${added} 則${feed.filter ? `，非房產相關略過 ${skipped} 則` : ""}`);
      } catch (e) {
        log(`RSS ${feed.name} 抓取失敗：${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  await Promise.allSettled(tasks.map((t) => t()));

  const items = [...found.values()];
  const counts = countByRegion(items);
  log(`地區分布（依標題）：海線 ${counts.coast} 則、中部 ${counts.central} 則、全台 ${counts.national} 則`);
  return { items, counts };
}

export function countByRegion(items: Pick<FetchedNews, "region">[]): Record<NewsRegion, number> {
  const counts: Record<NewsRegion, number> = { coast: 0, central: 0, national: 0 };
  for (const it of items) counts[it.region] += 1;
  return counts;
}

// ---------------------------------------------------------------- Google 轉址解碼

/** 把 news.google.com/rss/articles/... 解成真正的新聞網址。被限流丟 GoogleRateLimited。 */
export async function decodeGoogleUrl(url: string): Promise<string> {
  const id = GOOGLE_ARTICLE_RE.exec(url)?.[1];
  if (!id) return url;
  const page = await fetchText(`https://news.google.com/articles/${id}`, 8_000);
  if (page.status === 429) throw new GoogleRateLimited();
  if (page.status !== 200) throw new Error(`HTTP ${page.status}`);
  const sig = /data-n-a-sg="([^"]+)"/.exec(page.text)?.[1];
  const ts = /data-n-a-ts="([^"]+)"/.exec(page.text)?.[1];
  if (!sig || !ts) throw new Error("找不到解碼參數");

  const req = [
    "Fbv4je",
    `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${ts},"${sig}"]`,
  ];
  const res = await fetchText("https://news.google.com/_/DotsSplashUi/data/batchexecute", 8_000, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: "f.req=" + encodeURIComponent(JSON.stringify([[req]])),
  });
  if (res.status === 429) throw new GoogleRateLimited();
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const chunk = res.text.split("\n\n")[1];
  const outer = JSON.parse(chunk) as unknown[][];
  const inner = JSON.parse(String(outer[0][2])) as unknown[];
  const real = inner[1];
  if (typeof real !== "string" || !/^https?:/i.test(real)) throw new Error("解碼結果不是網址");
  return real;
}

// ---------------------------------------------------------------- 全文擷取

/** 從新聞頁 HTML 抓出主文。沒有第三方套件：先找 <article>，再退回 <body> 的段落。 */
export function extractMainText(html: string): string {
  let h = html.replace(/<(script|style|noscript|iframe|svg|template)[^>]*>[\s\S]*?<\/\1>/gi, "");
  h = h.replace(/<(nav|header|footer|aside|form)[^>]*>[\s\S]*?<\/\1>/gi, "");
  const article = /<article[^>]*>([\s\S]*?)<\/article>/i.exec(h)?.[1];
  const scope = article ?? (/<body[^>]*>([\s\S]*?)<\/body>/i.exec(h)?.[1] ?? h);
  const paras = [...scope.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => cleanText(m[1]))
    .filter((p) => p.length >= 15);
  let text = paras.join("\n");
  if (text.length < 100) {
    text = htmlToText(scope)
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length >= 15)
      .join("\n");
  }
  return text.slice(0, NEWS_CONFIG.maxContentChars);
}

async function fetchArticleText(url: string): Promise<string> {
  const res = await fetchText(url, 8_000);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  if (!/html|xml/i.test(res.contentType)) return "";
  return extractMainText(res.text);
}

// ---------------------------------------------------------------- 第二步：解碼＋全文（有時間預算）

export type EnrichResult = { decoded: number; withText: number; targets: number; googleBlocked: boolean };

/**
 * 解開 Google 轉址、抓全文。海線、中部先處理，其餘依時間新到舊；過了 deadline 就不再開新的工作。
 * 就地修改 items（url 換成真網址、content 填入全文）。
 */
export async function enrichNews(items: FetchedNews[], deadline: number, log: LogFn): Promise<EnrichResult> {
  const ordered = [...items].sort(
    (a, b) => regionRank(a.region) - regionRank(b.region) || (b.publishedAt || "").localeCompare(a.publishedAt || ""),
  );
  const targets = ordered.slice(0, NEWS_CONFIG.maxFullText);
  const result: EnrichResult = { decoded: 0, withText: 0, targets: targets.length, googleBlocked: false };
  const googleTotal = targets.filter((t) => isGoogleLink(t.url)).length;
  log(`處理 ${targets.length} 則的連結與全文（海線、中部優先；其中 ${googleTotal} 則要解 Google 轉址）…`);

  await runPool(targets, 4, deadline, async (it) => {
    if (isGoogleLink(it.url)) {
      if (result.googleBlocked) return;
      try {
        it.url = await decodeGoogleUrl(it.url);
        result.decoded += 1;
      } catch (e) {
        if (e instanceof GoogleRateLimited) result.googleBlocked = true;
        return;
      }
    }
    if (it.content) return;
    try {
      const text = await fetchArticleText(it.url);
      if (text.length >= 100) {
        it.content = text;
        result.withText += 1;
      }
    } catch {
      // 抓不到全文不是錯誤：只留標題與連結
    }
  });

  let msg = `Google 轉址解碼成功 ${result.decoded}/${googleTotal} 則，取得全文 ${result.withText}/${targets.length} 則`;
  if (result.googleBlocked) msg += "（Google 暫時限制解碼，其餘保留原連結）";
  if (Date.now() >= deadline) msg += "（時間用完，其餘只留標題）";
  log(msg);
  return result;
}

/** 抓到全文後再分一次級：只會往更優先的地區升級，不會降級。 */
export function reclassifyWithContent(items: FetchedNews[], log: LogFn): void {
  let upgraded = 0;
  for (const it of items) {
    const next = classifyRegion(it);
    if (regionRank(next) < regionRank(it.region)) {
      it.region = next;
      upgraded += 1;
    }
  }
  const counts = countByRegion(items);
  if (upgraded) log(`依全文重新分級：${upgraded} 則升級為海線或中部`);
  log(`最終地區分布：海線 ${counts.coast} 則、中部 ${counts.central} 則、全台 ${counts.national} 則`);
}
