/**
 * 📄 讀一頁愛屋電子型錄 —— 給 `/admin/map-listings` 的「貼連結就帶入」用
 *
 * 他貼一條愛屋連結（或只有案號），這支負責抓回來、讀出標題／地址／社區／格局／特色，
 * 後台再拿社區名去 `project-match.ts` 猜建案。
 *
 * ## 為什麼不共用 591 那支 `post591-parser.ts` 的 `parseListing()`
 * 那支的欄位錨點對的是**登入後**的型錄版型（「格局」「建坪」），公開型錄用的是
 * 「房/廳/衛」「登記坪數」「屋　　齡」，所以標題、格局、坪數在公開頁上一律讀不到
 * （2026-09-16 實測三筆都是 undefined，社區／地址／總價則讀得到）。
 * **591 那支正在線上跑、有回歸測試，不要為了這裡去動它的錨點**，這裡自己讀。
 * 共用的只有純工具：HTML→文字、照片網址、從網址讀案號。
 *
 * ## 公開型錄長什麼樣（2026-09-16 實測，68 行）
 *   第 1 行 不動產電子型錄 / 第 2 行 標題 / 第 3 行 地址
 *   之後都是「標籤一行、值下一行」：委託總價／登記坪數／房/廳/衛／樓別/樓高／
 *   類型/現況／社區／屋　　齡／鄰近公園／鄰近市場／鄰近學校／環境特色／物件編號…
 *
 * ⚠️ **公開型錄沒有完整門牌**（愛屋把號碼藏起來，只到路名）。完整門牌在資料庫
 *    `houseol_address` 表（來源是書籤小工具），呼叫端要自己補，見 `lib/houseol-address.ts`。
 * ⚠️ 依賴愛屋的版面。他們改版這裡就讀不到 —— 讀不到的欄位一律留空、**不要用猜的填**，
 *    畫面上會顯示「這幾欄沒讀到」讓他自己補。
 */
import { extractPhotosFromHtml, houseolHtmlToText, listingNoFromUrl } from "@/lib/post591-parser";

/** 只准連這個網域（防 SSRF：這支會拿使用者貼的字串去發請求） */
const HOUSEOL_HOST = /(^|\.)houseol\.com\.tw$/i;

/** 案號長相：AA6362139（成屋）／AK5373873（土地） */
const CASE_ID = /\b(A[A-Z]\d{6,9})\b/;

export type CatalogListing = {
  caseId: string;
  /** 型錄第一行的物件標題 */
  title: string;
  /** 型錄上的地址。**沒有門牌號碼**，只到路名 */
  address: string;
  community: string;
  /** 委託總價（萬） */
  price: number | null;
  /** 登記坪數 */
  ping: number | null;
  rooms: number | null;
  halls: number | null
  baths: number | null;
  /** 「12/13」= 12 樓、共 13 層 */
  floor: string;
  age: number | null;
  /** 華廈／大樓／透天… */
  kind: string;
  /** 空屋／自住／出租中… */
  state: string;
  /** 有沒有車位（登記坪數那行的「含車位面積 X 坪」＞0，或產權車位有值） */
  hasParking: boolean;
  nearbySchool: string;
  nearbyMarket: string;
  nearbyPark: string;
  /** 型錄「環境特色」逐行（很多物件是空的） */
  features: string[];
  /**
   * 型錄頁上帶的座標（「更多照片」那條連結裡的 google=緯度,經度）。
   * ⚠️ **不能直接信**：2026-09-17 拿 10 案跟系統擁有者自己標的建案圖釘比對，
   *    7 案差 14～54 公尺、1 案差 343 公尺、**2 案差 3.5～4 公里**（德光聚、兆登櫻）。
   *    那是同事在愛屋後台自己拉的點，錯了也沒人會發現。**畫面上一定要讓他確認過再存**。
   */
  lat: number | null;
  lng: number | null;
  /** 型錄頁上的照片網址（還沒下載，要另外處理） */
  photos: string[];
  /** 這一頁的網址，可以直接當「物件資訊」按鈕的連結 */
  catalogUrl: string;
};

/**
 * 這個網址可不可以拿去抓圖。
 * 🔴 **一定要擋**：網址是從瀏覽器端傳進來的，不擋就是開一個「叫伺服器去打任意網址」的洞。
 */
export function isHouseolPhotoUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (u.protocol === "https:" || u.protocol === "http:") && HOUSEOL_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

export function catalogUrlFor(caseId: string): string {
  return `https://es.houseol.com.tw/Ecatalog.aspx?UID=SP123&UAID=H229&No=${encodeURIComponent(caseId)}&AID=H229&S1=&S2=`;
}

/** 標籤比對前先把空白拿掉：型錄的「屋　　齡」中間是全形空白 */
function labelKey(line: string): string {
  return line.replace(/[\s　:：]/g, "");
}

/** 找「標籤在某一行、值在下一行」的值。找不到回空字串 */
function valueAfter(lines: string[], label: string): string {
  const want = labelKey(label);
  for (let i = 0; i < lines.length - 1; i++) {
    if (labelKey(lines[i]) === want) return lines[i + 1].trim();
  }
  return "";
}

function toNum(s: string): number | null {
  const m = String(s).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** 把型錄整頁文字讀成一筆物件 */
export function parseCatalogText(text: string, html = ""): CatalogListing | null {
  const lines = text.split("\n").map((l) => l.trim());
  const caseId = valueAfter(lines, "物件編號") || text.match(CASE_ID)?.[1] || "";
  if (!caseId) return null;

  // 標題與地址：緊接在「不動產電子型錄」後面的兩行
  const head = lines.findIndex((l) => labelKey(l) === "不動產電子型錄");
  const title = head >= 0 ? (lines[head + 1] ?? "") : "";
  const address = head >= 0 ? (lines[head + 2] ?? "") : "";

  // 「更多照片」連結裡夾著愛屋自己存的座標：…EInfos.aspx?type=3&google=24.261195 ,120.536500&picstr=…
  const coord = text.match(/google=\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);

  const layout = valueAfter(lines, "房/廳/衛").match(/(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/);
  const sizeLine = valueAfter(lines, "登記坪數");
  const parkingArea = toNum(text.match(/含車位面積[\s\S]{0,12}?(\d+(?:\.\d+)?)\s*坪/)?.[1] ?? "") ?? 0;
  const kindState = valueAfter(lines, "類型/現況").split("/");

  // 環境特色：抓到下一個已知區塊為止。⚠️ 型錄最後那排 [地圖][街景][更多照片] 不能混進來
  const featureBlock = text.match(/環境特色[\s:：]*\n([\s\S]*?)(?=\n\s*(?:物件編號|\[地圖\]|經紀人員)|$)/);
  const features = (featureBlock?.[1] ?? "")
    .split("\n")
    .map((l) => l.replace(/^[\s✨*・·\-–—①-⑳❶-❿0-9.、]+/, "").trim())
    .filter((l) => l.length >= 6);

  return {
    caseId,
    title,
    address,
    community: valueAfter(lines, "社區"),
    price: toNum(valueAfter(lines, "委託總價")),
    ping: toNum(sizeLine),
    rooms: layout ? Number(layout[1]) : null,
    halls: layout ? Number(layout[2]) : null,
    baths: layout ? Number(layout[3]) : null,
    floor: valueAfter(lines, "樓別/樓高").replace(/\s+/g, ""),
    age: toNum(valueAfter(lines, "屋齡")),
    kind: (kindState[0] ?? "").trim(),
    state: (kindState[1] ?? "").trim(),
    hasParking: parkingArea > 0 || !!valueAfter(lines, "產權車位"),
    nearbySchool: valueAfter(lines, "鄰近學校"),
    nearbyMarket: valueAfter(lines, "鄰近市場"),
    nearbyPark: valueAfter(lines, "鄰近公園"),
    features,
    lat: coord ? Number(coord[1]) : null,
    lng: coord ? Number(coord[2]) : null,
    photos: html ? extractPhotosFromHtml(html, caseId) : [],
    catalogUrl: catalogUrlFor(caseId),
  };
}

/**
 * 從他貼的東西讀出案號。吃三種：
 *   ・型錄網址   es.houseol.com.tw/Ecatalog.aspx?...No=AA6362139
 *   ・店網物件頁 www.houseol.com.tw/sell_item/H229-S3149676/（網址裡沒有案號，要抓頁面）
 *   ・直接打案號 AA6362139
 * 回 null 代表看不懂。
 */
export async function resolveCaseId(input: string): Promise<{ caseId: string } | { error: string }> {
  const raw = input.trim();
  if (!raw) return { error: "還沒貼東西" };

  const direct = raw.match(/^(A[A-Z]\d{6,9})$/i);
  if (direct) return { caseId: direct[1].toUpperCase() };

  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return { error: "看不懂這串東西：請貼愛屋的物件連結，或直接打案號（例：AA6362139）" };
  }
  if (!HOUSEOL_HOST.test(url.hostname)) {
    return { error: `只認得愛屋的連結（houseol.com.tw），這個是 ${url.hostname}` };
  }

  const fromUrl = listingNoFromUrl(url.toString()) || url.toString().match(CASE_ID)?.[1];
  if (fromUrl) return { caseId: fromUrl.toUpperCase() };

  // 店網的物件頁：網址只有店內流水號（S3149676），案號要進頁面裡找
  const html = await fetchText(url.toString());
  if (!html.ok) return { error: html.error };
  const found = html.text.match(CASE_ID)?.[1];
  if (!found) return { error: "這一頁裡找不到愛屋案號，換貼電子型錄的連結試試" };
  return { caseId: found.toUpperCase() };
}

async function fetchText(url: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; weikaihouse.com/1.0; +https://weikaihouse.com)",
        accept: "text/html",
      },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: `愛屋回應 ${res.status}，可能是案號打錯或物件已下架` };
    return { ok: true, text: await res.text() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: /timeout|abort/i.test(msg) ? "愛屋太久沒回應（8 秒），等一下再試" : `連不上愛屋：${msg}` };
  }
}

/** 貼進來的字串 → 一筆讀好的物件。失敗一律回看得懂的訊息，不 throw */
export async function fetchCatalog(input: string): Promise<{ ok: true; listing: CatalogListing } | { ok: false; error: string }> {
  const resolved = await resolveCaseId(input);
  if ("error" in resolved) return { ok: false, error: resolved.error };

  const page = await fetchText(catalogUrlFor(resolved.caseId));
  if (!page.ok) return { ok: false, error: page.error };

  const listing = parseCatalogText(houseolHtmlToText(page.text), page.text);
  if (!listing) return { ok: false, error: `${resolved.caseId} 這一頁讀不出物件資料（愛屋可能改版了）` };
  return { ok: true, listing };
}

/** 帶進「賣點」欄的文字：一行規格 ＋ 型錄的環境特色（沒有特色就補一行生活機能） */
export function buildPoints(l: CatalogListing): string[] {
  const spec = [
    l.kind,
    l.rooms !== null ? `${l.rooms}房${l.halls ?? 0}廳${l.baths ?? 0}衛` : "",
    l.ping !== null ? `登記 ${l.ping} 坪` : "",
    l.floor ? `${l.floor} 樓` : "",
    l.age !== null ? `屋齡 ${l.age} 年` : "",
    l.hasParking ? "含車位" : "",
    l.price !== null ? `總價 ${l.price} 萬` : "",
  ].filter(Boolean);

  const points = spec.length ? [spec.join("｜")] : [];
  if (l.features.length) return [...points, ...l.features];

  const nearby = [
    l.nearbySchool && `學校：${l.nearbySchool}`,
    l.nearbyMarket && `生活：${l.nearbyMarket}`,
    l.nearbyPark && `公園：${l.nearbyPark}`,
  ].filter(Boolean);
  if (nearby.length) points.push(nearby.join("｜"));
  return points;
}
