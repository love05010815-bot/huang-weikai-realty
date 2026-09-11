/**
 * 🏷️ 精選好案的「售價」—— 從「物件資訊」那顆連結指到的愛屋電子型錄頁現抓
 *
 * 2026-09-07 系統擁有者指定：精選好案每張卡片都要顯示售價，價格直接抓物件資訊裡
 * 的愛屋型錄，不另外在後台手打（打了也會忘了改）。
 *
 * ## 為什麼不用 src/config/houseol-inventory.json（書籤小工具抓的快照）
 * 快照是 2026-08-25 抓的，兩週後線上 6 戶裡有 3 戶降價了
 * （798→788、1198→1128、798→768）。照快照顯示就是對客戶報錯價。價格會動，一定要抓現在的。
 *
 * ## 只抓什麼、抓多少
 * - **只認 `es.houseol.com.tw` 的型錄頁**（`Ecatalog.aspx?...&No=<案號>`），別的網域一律回 null。
 *   591 那種條款明文禁止程式抓取的（見記憶 learning_591_no_scraping）**絕對不碰** ——
 *   物件資訊連到 591 的那幾戶，卡片就是沒有售價，要顯示就把連結換成愛屋型錄。
 * - 一戶一頁，靠 Next 的 data cache 一小時內只抓一次；精選好案只有十幾戶，
 *   等於每小時對愛屋最多十幾個請求。
 * - User-Agent 表明是本站，愛屋那邊要找人可以直接找到。
 *
 * ⚠️ 愛屋 `robots.txt` 是 `User-agent: * / Disallow: /`（只放行 Facebook 的連結預覽爬蟲）。
 *    這裡抓的是他自己委託、本來就拿去分享給客戶的電子型錄，量極小、UA 有具名，
 *    系統擁有者知情後決定要抓。**要收掉的話，把 lib/listings.ts 裡 `withHouseolPrices`
 *    那一行拿掉就好，其他不用動。**
 *
 * ## 失敗怎麼辦
 * 一律回 null、絕不 throw —— 那張卡片就不顯示售價，首頁與 /listings 不能因為愛屋慢了
 * 或掛了就開天窗。下一次 revalidate 會再試。
 *
 * 🔴 這是「靜默失效」的高風險區：**本機抓得到不代表 Vercel 抓得到**（機房 IP 可能被擋）。
 *    部署後一定要 curl 線上 /listings 數「售價」印出來幾個，不能只看 build 過。
 */

const HOUSEOL_HOST = /(^|\.)houseol\.com\.tw$/i;

/** 型錄網址 → 案號（`No=AA5975363`）。不是愛屋型錄、或案號長得不像，就 null。 */
export function houseolCaseId(href: string): string | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  if (!HOUSEOL_HOST.test(u.hostname)) return null;
  const no = (u.searchParams.get("No") ?? "").trim();
  return /^[A-Z]{1,3}\d{5,}$/i.test(no) ? no.toUpperCase() : null;
}

/**
 * 從型錄 HTML 撈「委託總價」（單位：萬）。三個錨點照穩定度排，第一個中就回：
 *   1. `<p id="Price" class="red size22">1128萬</p>` —— 頁面主體那個紅色大字
 *   2. 「委託總價」這個標籤之後第一個「數字萬」
 *   3. og:title 裡的「數字萬」（例：`德光聚三房配B1平車 1128萬 -梧棲新市鎮旗艦加盟店`）
 *
 * ⚠️ 用關鍵字比對定位、不用位置 —— 愛屋改版時錨點多半還在、位置一定變
 *    （跟 591 解析那次學到的是同一條）。
 * 2026-09-07 拿線上 6 個型錄頁實測，三個錨點六戶全中、數字一致。
 */
export function parseHouseolPrice(html: string): number | null {
  // ⚠️ 一律用 regex 字面值，不要用 new RegExp("…\\d…") 組字串 ——
  //    這台機器的 Bash 工具會把 heredoc 裡的 `\\` 收成 `\`，字串裡的 `\d` 就變成普通的 d，
  //    regex 整個壞掉還不報錯（2026-09-07 第一版就是這樣死的，見記憶 learning_bash_tool_heredoc_quotes）。
  //    每個錨點最後那組 `([\d,]+(?:\.\d+)?)\s*萬` 是同一個「數字萬」，三處要一起改。
  const anchors: RegExp[] = [
    /id=["']Price["'][^>]*>\s*([\d,]+(?:\.\d+)?)\s*萬/i,
    /委託總價[\s\S]{0,400}?([\d,]+(?:\.\d+)?)\s*萬/,
    /og:title['"]?\s+content=['"][^'"]*?\s([\d,]+(?:\.\d+)?)\s*萬/,
  ];
  for (const re of anchors) {
    const m = html.match(re);
    if (!m) continue;
    const n = Number(m[1].replace(/,/g, ""));
    // 合理範圍 50 萬～10 億。超出的多半是抓到別的欄位（坪數、電話、日期），寧可不顯示
    if (Number.isFinite(n) && n >= 50 && n <= 100000) return n;
  }
  return null;
}

/**
 * 把型錄頁的 HTML 抓回來。售價（這支檔）與物件比較表（lib/houseol-facts.ts）共用 ——
 * 兩邊傳同一個網址、同一組 fetch 選項，Next 的 data cache 就是同一筆，一小時內只抓一次，
 * 比較表不會讓愛屋多挨一次請求。
 * 不是愛屋型錄、逾時、非 200 → null，**永遠不 throw**。
 */
export async function fetchHouseolHtml(href: string): Promise<string | null> {
  if (!houseolCaseId(href)) return null;
  try {
    const res = await fetch(href, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; weikaihouse.com/1.0; +https://weikaihouse.com)",
        accept: "text/html",
      },
      signal: AbortSignal.timeout(6000),
      // 一小時內同一戶只抓一次。頁面本身是 5 分鐘 revalidate，價格最慢一小時跟上。
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * 這顆「物件資訊」連結對應的售價（萬）。
 * 不是愛屋型錄、逾時、非 200、解析不到、數字離譜 → 全部 null，**永遠不 throw**。
 */
export async function fetchHouseolPrice(href: string): Promise<number | null> {
  const html = await fetchHouseolHtml(href);
  return html ? parseHouseolPrice(html) : null;
}

/** 1128 → 「1,128 萬」；1128.5 → 「1,128.5 萬」。給卡片顯示用。 */
export function formatWan(n: number): string {
  return `${n.toLocaleString("zh-TW", { maximumFractionDigits: 1 })} 萬`;
}
