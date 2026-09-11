/**
 * 🧾 愛屋型錄頁 → 物件比較表的九個欄位
 *
 * 2026-09-10 系統擁有者指定：/map 的在售物件要能勾起來比較（開價／建案名／屋齡／樓層樓高／
 * 主建物坪數／主＋附屬坪數／格局／車位有無／公設比），**資料一律從「物件介紹」那顆愛屋型錄連結現抓**，
 * 不另外在後台手打（跟售價同一個理由：打了會忘了改）。
 *
 * ## 型錄頁的版面（2026-09-10 拿三戶實測）
 *
 * 每個欄位長這樣，桌機表頭與手機標題各印一次標籤，值只有一個：
 *
 *   <div class="t-th">主建物坪</div>
 *   <div class="t-td">
 *     <div class="title">主建物坪</div>
 *     <p>20.818 坪</p>
 *   </div>
 *
 * 所以這裡只認 `<div class="title">標籤</div>` 緊接著的第一個 `<p>` —— 用標籤定位、不用位置
 * （愛屋改版時錨點多半還在、位置一定變；跟 houseol-price.ts 同一條）。
 * ⚠️ 不要把整頁轉成純文字再丟給 post591-parser 的 parseHouseol：標籤印兩次會讓文字欄位
 *    （車位型式、類型）抓到第二個標籤、被當成空值；而且兩個功能會綁死，改一邊另一邊默默壞。
 *
 * 實測到的幾種值：
 *   ・「主&ensp;+附屬」的標籤夾著 HTML 實體、「屋　　齡」夾著全形空白 → 標籤比對前先去掉所有空白
 *   ・預售戶沒有「竣工日期」「屋齡」，「公設比」是空的
 *   ・沒車位：「車位型式 無」「(含車位面積 0坪)」；有車位：「坡道/平面」「公設車位/B1-15」
 *   ・「樓別/樓高 6 /15」；透天會是「全棟/4」「1-2/2」（左邊不保證是數字，右邊一定是）
 *   ・「竣工日期 2025/6/6」沒補零；「屋齡」是愛屋自己算的「未滿一年」「1.3 年」
 *
 * ## 抓不到怎麼辦
 * 每個欄位獨立、抓不到就 null，畫面那格顯示「型錄未載」。整頁一個欄位都認不得（fieldCount 0）
 * 多半是愛屋改版了 —— fetch 那層會 console.warn 一行讓 Vercel log 看得到。永遠不 throw。
 *
 * ⚠️ 一律用 regex 字面值，不要用 new RegExp("…\\d…") 組字串（見 houseol-price.ts 同一段警告）。
 */

import { fetchHouseolHtml, houseolCaseId, parseHouseolPrice } from "@/lib/houseol-price";

export type HouseolFacts = {
  /** 委託總價（萬）。跟卡片售價同一條規則（parseHouseolPrice），抓不到才退回型錄欄位 */
  price: number | null;
  /** 型錄「社區」欄，建案名的備援（正常情況建案名來自 map_listing 掛的建案） */
  community: string | null;
  /** 「樓別/樓高」原文，例如「6 /15」「全棟/4」 */
  floorRaw: string | null;
  /** 拆開的樓別／樓高。左邊照原文（可能是「全棟」「1-2」），右邊一定是數字 */
  floor: { level: string; total: number } | null;
  /** 登記坪數（權狀） */
  regPing: number | null;
  /** 含車位坪。沒車位的型錄寫 0 */
  parkPing: number | null;
  mainPing: number | null;
  attPing: number | null;
  /** 型錄「主 +附屬」；型錄沒印這欄才用主建物＋附屬建物加出來 */
  mainAttPing: number | null;
  layout: { room: number; hall: number; bath: number } | null;
  /** 車位有無＋型式（「坡道/平面」）。型錄連車位型式跟含車位坪都沒有 → null */
  parking: { has: boolean; type: string } | null;
  /** 公設比原文正規化成「33%」「33.4%」；預售或沒填 → null */
  publicRatio: string | null;
  /** 竣工日期原文（「2025/6/6」） */
  completion: string | null;
  /** 型錄「屋齡」原文（「未滿一年」「1.3 年」）。愛屋自己算的，優先顯示它 */
  age: string | null;
  /** 型錄「類型/現況」（「大樓/空屋」「華廈/預售」），拿來判斷預售 */
  kind: string | null;
  /** 型錄上讀到幾組「標籤＋值」。0 ＝ 版面認不得（愛屋改版了），畫面每格都會是「型錄未載」 */
  fieldCount: number;
};

/** 顯示用：欄位在型錄上是空的、或型錄根本沒這一欄 */
export const MISSING_TEXT = "型錄未載";

// ---------------------------------------------------------------- HTML → 標籤/值

/**
 * `<div class="title">標籤</div>` 後面緊接的第一個 `<p>` 就是值。
 * 標籤 div 後面若直接接 `</div>`（值整個不存在），這一組就對不上、被跳過，不會偷抓下一組的 <p>。
 */
const PAIR_RE = /<div\s+class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi;

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;|&ensp;|&emsp;|&thinsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => {
      const code = parseInt(hex, 16);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    })
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      const code = Number(dec);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    });
}

/** 去標籤、還原實體、把全形空白一起收成單一半形空白 */
function cleanText(fragment: string): string {
  return decodeEntities(fragment.replace(/<[^>]+>/g, " "))
    .replace(/[\s　]+/g, " ")
    .trim();
}

/**
 * 整頁的「標籤 → 值」。標籤去掉所有空白（「主 +附屬」→「主+附屬」、「屋　　齡」→「屋齡」）。
 * 同一個標籤出現兩次只認第一次。值是空字串代表型錄那格沒填。
 */
export function houseolFieldMap(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of html.matchAll(PAIR_RE)) {
    const key = cleanText(m[1]).replace(/\s+/g, "");
    if (!key || out.has(key)) continue;
    out.set(key, cleanText(m[2]));
  }
  return out;
}

/** 值裡的第一個數字（「44.98 坪」→ 44.98、「10.95坪)」→ 10.95、「1,128萬」→ 1128）。沒有數字 → null */
function firstNumber(value: string | null): number | null {
  if (!value) return null;
  const m = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** 車位型式寫成這些字就是「沒車位」 */
const NO_PARKING = /^(?:無|沒有|無車位|不含車位|-|—|－)$/;

// ---------------------------------------------------------------- 主函式

export function parseHouseolFacts(html: string): HouseolFacts {
  const fields = houseolFieldMap(html);
  const get = (label: string): string | null => {
    const v = fields.get(label);
    return v ? v : null;
  };
  const find = (pred: (label: string) => boolean): string | null => {
    for (const [label, value] of fields) if (value && pred(label)) return value;
    return null;
  };

  // 售價：先走卡片同一條（三個錨點），抓不到才看型錄欄位。合理範圍同 parseHouseolPrice。
  let price = parseHouseolPrice(html);
  if (price == null) {
    const n = firstNumber(get("委託總價"));
    if (n != null && /萬/.test(get("委託總價") ?? "") && n >= 50 && n <= 100000) price = n;
  }

  const floorRaw = get("樓別/樓高");
  let floor: HouseolFacts["floor"] = null;
  if (floorRaw) {
    // 一定要有「/」當標記；右邊（總樓高）一定是數字，左邊照原文（6、全棟、1-2）
    const m = floorRaw.match(/^(.+?)\s*\/\s*(\d{1,3})\s*$/);
    if (m) floor = { level: m[1].replace(/\s+/g, ""), total: Number(m[2]) };
  }

  const mainPing = firstNumber(get("主建物坪"));
  const attPing = firstNumber(get("附屬建物"));
  const mainAttPrinted = firstNumber(get("主+附屬"));
  const mainAttPing =
    mainAttPrinted ?? (mainPing != null && attPing != null ? round2(mainPing + attPing) : null);

  const layoutRaw = get("房/廳/衛");
  const lm = layoutRaw?.match(/(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/);
  const layout = lm ? { room: Number(lm[1]), hall: Number(lm[2]), bath: Number(lm[3]) } : null;

  // 「(含車位坪」與「(含車位面積」兩種標籤都看過，用開頭比對
  const parkPing = firstNumber(find((label) => /^\(?含車位/.test(label)));
  const parkType = get("車位型式")?.replace(/\s+/g, "") ?? null;
  let parking: HouseolFacts["parking"] = null;
  if (parkType) {
    const none = NO_PARKING.test(parkType);
    parking = { has: !none, type: none ? "" : parkType };
  } else if (parkPing != null) {
    parking = { has: parkPing > 0, type: "" };
  }

  const ratioRaw = get("公設比");
  const rm = ratioRaw?.match(/(\d+(?:\.\d+)?)\s*%/);
  const publicRatio = rm ? `${rm[1]}%` : null;

  const completionRaw = get("竣工日期");
  const completion = completionRaw && /\d{4}\s*[/\-.年]\s*\d{1,2}/.test(completionRaw) ? completionRaw : null;

  return {
    price,
    community: get("社區"),
    floorRaw,
    floor,
    regPing: firstNumber(get("登記坪數")),
    parkPing,
    mainPing,
    attPing,
    mainAttPing,
    layout,
    parking,
    publicRatio,
    completion,
    age: get("屋齡"),
    kind: get("類型/現況")?.replace(/\s+/g, "") ?? null,
    fieldCount: fields.size,
  };
}

/**
 * 這顆「物件介紹」連結對應的九個欄位。跟售價共用同一筆抓回來的 HTML（同一小時快取）。
 * 不是愛屋型錄、抓不到 → null；抓到但版面認不得 → fieldCount 0 的空殼（畫面每格「型錄未載」）。
 */
export async function fetchHouseolFacts(href: string): Promise<HouseolFacts | null> {
  const html = await fetchHouseolHtml(href);
  if (!html) return null;
  const facts = parseHouseolFacts(html);
  if (facts.fieldCount === 0) {
    console.warn(`[houseol-facts] 型錄頁一個欄位都認不得，愛屋可能改版了：${houseolCaseId(href)}`);
  }
  return facts;
}

// ---------------------------------------------------------------- 顯示用

/** 「2025/6/6」「2023-03-01」「2025年6月」→ Date（UTC 零點）。認不得 → null */
function parseYmd(value: string | null): Date | null {
  const m = value?.match(/(\d{4})\s*[/\-.年]\s*(\d{1,2})(?:\s*[/\-.月]\s*(\d{1,2}))?/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = m[3] ? Number(m[3]) : 1;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d));
}

/** 20.818 → 「20.82 坪」；22.8 → 「22.8 坪」 */
export function formatPing(n: number | null): string | null {
  if (n == null) return null;
  return `${n.toLocaleString("zh-TW", { maximumFractionDigits: 2 })} 坪`;
}

/** 「6 /15」→「6F／15F」；「全棟/4」→「全棟／4F」；「1-2/2」→「1-2F／2F」 */
export function formatFloor(floor: HouseolFacts["floor"]): string | null {
  if (!floor) return null;
  const level = /^\d+(?:[-~]\d+)?$/.test(floor.level) ? `${floor.level}F` : floor.level;
  return `${level}／${floor.total}F`;
}

export function formatLayout(layout: HouseolFacts["layout"]): string | null {
  if (!layout) return null;
  return `${layout.room}房${layout.hall}廳${layout.bath}衛`;
}

/** 「有（坡道/平面）」「有」「無」 */
export function formatParking(parking: HouseolFacts["parking"]): string | null {
  if (!parking) return null;
  if (!parking.has) return "無";
  return parking.type ? `有（${parking.type}）` : "有";
}

/**
 * 屋齡：型錄自己印的優先（「未滿一年」「1.3 年」）；型錄沒印就拿竣工日期算到小數一位；
 * 兩個都沒有但現況是預售 → 「預售（尚未完工）」；再沒有 → null。
 *
 * 用一位小數、不取整 —— 取整（3.9 → 3 年）是往對自己有利的方向取巧，跟 port-projects 的 houseAge 同一條原則。
 */
export function formatAge(
  facts: Pick<HouseolFacts, "age" | "completion" | "kind">,
  now: Date = new Date(),
): string | null {
  if (facts.age) return facts.age.replace(/\s+/g, " ");
  const done = parseYmd(facts.completion);
  if (done) {
    const years = (now.getTime() - done.getTime()) / (365.25 * 86400000);
    if (years < 0) return "尚未完工";
    if (years < 1) return "未滿 1 年";
    return `${years.toFixed(1)} 年`;
  }
  if (facts.kind && /預售/.test(facts.kind)) return "預售（尚未完工）";
  return null;
}

/** 「2025/6/6」→「2025 年 6 月完工」，給屋齡底下的小字 */
export function formatCompletion(completion: string | null): string | null {
  const d = parseYmd(completion);
  if (!d) return null;
  return `${d.getUTCFullYear()} 年 ${d.getUTCMonth() + 1} 月完工`;
}
