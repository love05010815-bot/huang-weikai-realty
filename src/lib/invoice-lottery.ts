/**
 * 統一發票兌獎 —— 純函式（解析財政部中獎號碼頁、對獎）。
 *
 * 2026-11-19 系統擁有者：「我想做一個統一發票兌獎工具在我的免費小工具內」（前台 /invoice）。
 *
 * 這個檔不碰網路、不碰 next/*，客戶端元件可以直接 import；抓資料在 invoice-lottery-fetch.ts。
 * 改解析或對獎規則跑 `npm run check:invoice`（scripts/fixtures 裡存了兩頁官方原始 HTML 與 RSS）。
 *
 * 資料來源（財政部財政資訊中心，公開頁面）：
 *   ・https://invoice.etax.nat.gov.tw/index.html       最新一期中獎號碼單（含領獎期間）
 *   ・https://invoice.etax.nat.gov.tw/lastNumber.html  上一期
 *   ・https://invoice.etax.nat.gov.tw/invoice.xml      RSS，近六期的特別獎／特獎／頭獎（沒有領獎期間）——備援
 *
 * 獎別與獎金（統一發票給獎辦法第 3 條，也印在官方中獎號碼單每一列）：
 *   特別獎 8 碼全中 1,000 萬｜特獎 8 碼全中 200 萬｜頭獎 8 碼全中 20 萬
 *   二獎 末 7 碼同頭獎 4 萬｜三獎 末 6 碼 1 萬｜四獎 末 5 碼 4 千｜五獎 末 4 碼 1 千｜六獎 末 3 碼 200
 *   增開六獎：這兩期的號碼單沒有這一列；哪一期又出現，解析會收進 extraSixth、照末 3 碼 200 元對。
 *   雲端發票專屬獎是另一套（財政部直接對載具、不用自己對），這裡不處理。
 */

export type InvoiceDraw = {
  /** 民國年，例 115 */
  rocYear: number;
  /** 這一期的第一個月（1、3、5、7、9、11） */
  firstMonth: number;
  /** 顯示用，例「115 年 7–8 月」 */
  label: string;
  /** 特別獎（8 碼） */
  special: string;
  /** 特獎（8 碼） */
  grand: string;
  /** 頭獎（8 碼，通常三組） */
  firsts: string[];
  /** 增開六獎（3 碼）；沒有就是空陣列 */
  extraSixth: string[];
  /** 領獎期間，西元 YYYY-MM-DD；RSS 備援拿不到就是 null */
  claimFrom: string | null;
  claimTo: string | null;
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type PrizeKey = "special" | "grand" | "first" | "second" | "third" | "fourth" | "fifth" | "sixth" | "extraSixth";

export const PRIZES: Record<PrizeKey, { name: string; amount: number; rule: string }> = {
  special: { name: "特別獎", amount: 10_000_000, rule: "8 碼與特別獎號碼完全相同" },
  grand: { name: "特獎", amount: 2_000_000, rule: "8 碼與特獎號碼完全相同" },
  first: { name: "頭獎", amount: 200_000, rule: "8 碼與頭獎號碼完全相同" },
  second: { name: "二獎", amount: 40_000, rule: "末 7 碼與頭獎相同" },
  third: { name: "三獎", amount: 10_000, rule: "末 6 碼與頭獎相同" },
  fourth: { name: "四獎", amount: 4_000, rule: "末 5 碼與頭獎相同" },
  fifth: { name: "五獎", amount: 1_000, rule: "末 4 碼與頭獎相同" },
  sixth: { name: "六獎", amount: 200, rule: "末 3 碼與頭獎相同" },
  extraSixth: { name: "增開六獎", amount: 200, rule: "末 3 碼與增開六獎號碼相同" },
};

/** 頭獎號碼「末 n 碼相同」對到哪一獎；n 從 8 到 3 */
const FIRST_LADDER: Record<number, PrizeKey> = { 8: "first", 7: "second", 6: "third", 5: "fourth", 4: "fifth", 3: "sixth" };

/* ---------- 解析 ---------- */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function periodLabel(rocYear: number, firstMonth: number): string {
  return `${rocYear} 年 ${firstMonth}–${firstMonth + 1} 月`;
}

/** 民國年月日 → 西元 YYYY-MM-DD */
function rocToIso(y: string, m: string, d: string): string {
  return `${Number(y) + 1911}-${pad2(Number(m))}-${pad2(Number(d))}`;
}

function validPeriod(rocYear: number, firstMonth: number): boolean {
  return rocYear >= 100 && rocYear < 300 && firstMonth >= 1 && firstMonth <= 11 && firstMonth % 2 === 1;
}

/** 把標籤拿掉（不補空白 —— 頭獎是「前 5 碼」「末 3 碼」兩個 span 接在一起），再照非數字切開 */
function digitsIn(html: string): string[] {
  return html
    .replace(/<[^>]+>/g, "")
    .split(/\D+/)
    .filter(Boolean);
}

function validate(draw: InvoiceDraw): string | null {
  const is8 = (s: string) => /^\d{8}$/.test(s);
  if (!validPeriod(draw.rocYear, draw.firstMonth)) return `期別不對（${draw.rocYear} 年 ${draw.firstMonth} 月）`;
  if (!is8(draw.special)) return `特別獎不是 8 碼（${draw.special || "空"}）`;
  if (!is8(draw.grand)) return `特獎不是 8 碼（${draw.grand || "空"}）`;
  if (draw.firsts.length === 0) return "沒有頭獎號碼";
  const badFirst = draw.firsts.find((s) => !is8(s));
  if (badFirst !== undefined) return `頭獎不是 8 碼（${badFirst}）`;
  const badExtra = draw.extraSixth.find((s) => !/^\d{3}$/.test(s));
  if (badExtra !== undefined) return `增開六獎不是 3 碼（${badExtra}）`;
  return null;
}

/**
 * 解析官方中獎號碼單（index.html／lastNumber.html）。
 * 這頁是哪一期：選單裡 class 帶 etw-on 的那個連結，title 是「115年07-08月中獎號碼單」。
 * 號碼：第一張 <table>（同一張表桌機版、手機版各印一次，內容相同，只讀第一張），
 *       每列第一格是獎別、第二格裡 class 帶 etw-tbiggest 的 <p> 一個是一組號碼。
 * 對不上就回 ok:false —— 官方改版時要壞得很明顯，不要悄悄拿到半套號碼。
 */
export function parseInvoiceHtml(html: string): ParseResult<InvoiceDraw> {
  let period: RegExpMatchArray | null = null;
  for (const tag of html.match(/<a\b[^>]*>/g) ?? []) {
    if (!/class="[^"]*\betw-on\b/.test(tag)) continue;
    period = tag.match(/title="(\d{2,3})年(\d{1,2})-(\d{1,2})月中獎號碼單"/);
    if (period) break;
  }
  if (!period) return { ok: false, error: "找不到這頁的期別（選單裡沒有 etw-on 的中獎號碼單）" };
  const rocYear = Number(period[1]);
  const firstMonth = Number(period[2]);

  const table = html.match(/<table\b[\s\S]*?<\/table>/);
  if (!table) return { ok: false, error: "找不到中獎號碼表格" };

  const byPrize = new Map<string, string[]>();
  for (const row of table[0].match(/<tr\b[\s\S]*?<\/tr>/g) ?? []) {
    const cells = row.match(/<td\b[\s\S]*?<\/td>/g);
    if (!cells || cells.length < 2) continue;
    const name = cells[0].replace(/<[^>]+>/g, "").replace(/\s+/g, "");
    const numbers: string[] = [];
    for (const p of cells[1].match(/<p\b[^>]*\betw-tbiggest\b[^>]*>[\s\S]*?<\/p>/g) ?? []) {
      numbers.push(...digitsIn(p));
    }
    if (name && numbers.length) byPrize.set(name, numbers);
  }

  const claim = table[0].match(/領獎期間自\s*(\d+)年(\d+)月(\d+)日起至\s*(\d+)年(\d+)月(\d+)日止/);

  const draw: InvoiceDraw = {
    rocYear,
    firstMonth,
    label: periodLabel(rocYear, firstMonth),
    special: byPrize.get("特別獎")?.[0] ?? "",
    grand: byPrize.get("特獎")?.[0] ?? "",
    firsts: byPrize.get("頭獎") ?? [],
    extraSixth: byPrize.get("增開六獎") ?? [],
    claimFrom: claim ? rocToIso(claim[1], claim[2], claim[3]) : null,
    claimTo: claim ? rocToIso(claim[4], claim[5], claim[6]) : null,
  };
  // 特別獎、特獎各只有一組；多出來代表表格結構變了
  if ((byPrize.get("特別獎")?.length ?? 0) > 1 || (byPrize.get("特獎")?.length ?? 0) > 1) {
    return { ok: false, error: "特別獎或特獎讀到不只一組號碼，表格格式可能改了" };
  }
  const bad = validate(draw);
  return bad ? { ok: false, error: bad } : { ok: true, value: draw };
}

/**
 * 解析官方 RSS（invoice.xml）——備援用，新的在前面。
 * 每個 <item>：title「115年 07~08月」、description「<p>特別獎：…</p><p>特獎：…</p><p>頭獎：a、b、c</p>」。
 * 沒有領獎期間。格式不對的那一期跳過；一期都讀不到才算失敗。
 */
export function parseInvoiceRss(xml: string): ParseResult<InvoiceDraw[]> {
  const draws: InvoiceDraw[] = [];
  for (const item of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const title = item.match(/<title>(?:<!\[CDATA\[)?\s*(\d{2,3})年\s*(\d{1,2})\s*[~-]\s*(\d{1,2})月/);
    const desc = item.match(/<description>([\s\S]*?)<\/description>/);
    if (!title || !desc) continue;
    const pick = (label: string): string[] => {
      // 「特獎」不能吃到「特別獎」那段：標籤前面必須是 > 或開頭
      const m = desc[1].match(new RegExp(`(?:^|>)\\s*${label}[：:]([^<]*)`));
      return m ? digitsIn(m[1]) : [];
    };
    const rocYear = Number(title[1]);
    const firstMonth = Number(title[2]);
    const draw: InvoiceDraw = {
      rocYear,
      firstMonth,
      label: periodLabel(rocYear, firstMonth),
      special: pick("特別獎")[0] ?? "",
      grand: pick("特獎")[0] ?? "",
      firsts: pick("頭獎"),
      extraSixth: pick("增開六獎"),
      claimFrom: null,
      claimTo: null,
    };
    if (!validate(draw)) draws.push(draw);
  }
  return draws.length ? { ok: true, value: draws } : { ok: false, error: "RSS 裡讀不到任何一期號碼" };
}

/* ---------- 對獎 ---------- */

export type Win = {
  prize: PrizeKey;
  name: string;
  amount: number;
  /** 對中的那一組中獎號碼 */
  matched: string;
};

/** 只留數字（全形數字也收），給輸入框用 */
export function onlyDigits(text: string): string {
  return text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\D/g, "");
}

/** 兩個號碼從尾巴數起連續相同幾碼 */
function sameTail(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

/**
 * 完整 8 碼對獎。同時對中多個獎只能領一個（官方領獎注意事項第 6 點），回獎金最高的那個；沒中回 null。
 * 不是 8 碼數字也回 null —— 呼叫端自己先擋。
 */
export function checkFull(number: string, draw: InvoiceDraw): Win | null {
  if (!/^\d{8}$/.test(number)) return null;
  const wins: Win[] = [];
  const add = (prize: PrizeKey, matched: string) => wins.push({ prize, name: PRIZES[prize].name, amount: PRIZES[prize].amount, matched });
  if (number === draw.special) add("special", draw.special);
  if (number === draw.grand) add("grand", draw.grand);
  for (const first of draw.firsts) {
    const prize = FIRST_LADDER[sameTail(number, first)];
    if (prize) add(prize, first);
  }
  for (const extra of draw.extraSixth) {
    if (number.endsWith(extra)) add("extraSixth", extra);
  }
  wins.sort((a, b) => b.amount - a.amount);
  return wins[0] ?? null;
}

export type TailHit = { kind: "special" | "grand" | "first" | "extraSixth"; number: string };

export type TailResult =
  /** 末 3 碼沒對到任何號碼，這張確定沒中 */
  | { verdict: "miss"; hits: [] }
  /** 末 3 碼同頭獎或增開六獎：至少 200 元，補前 5 碼看有沒有更大的 */
  | { verdict: "win"; hits: TailHit[] }
  /** 末 3 碼只跟特別獎／特獎一樣：那兩個獎要 8 碼全中，補完才知道 */
  | { verdict: "maybe"; hits: TailHit[] };

/** 末 3 碼快速對獎 */
export function checkTail(tail: string, draw: InvoiceDraw): TailResult {
  if (!/^\d{3}$/.test(tail)) return { verdict: "miss", hits: [] };
  const hits: TailHit[] = [];
  if (draw.special.endsWith(tail)) hits.push({ kind: "special", number: draw.special });
  if (draw.grand.endsWith(tail)) hits.push({ kind: "grand", number: draw.grand });
  for (const first of draw.firsts) if (first.endsWith(tail)) hits.push({ kind: "first", number: first });
  for (const extra of draw.extraSixth) if (extra === tail) hits.push({ kind: "extraSixth", number: extra });
  if (hits.length === 0) return { verdict: "miss", hits: [] };
  const sure = hits.some((h) => h.kind === "first" || h.kind === "extraSixth");
  return { verdict: sure ? "win" : "maybe", hits };
}

/* ---------- 領獎期間 ---------- */

export type ClaimStatus = "open" | "notYet" | "expired" | "unknown";

/** today 是台灣當天的 YYYY-MM-DD；字串直接比大小就是日期先後 */
export function claimStatus(draw: InvoiceDraw, today: string): ClaimStatus {
  if (!draw.claimFrom || !draw.claimTo) return "unknown";
  if (today < draw.claimFrom) return "notYet";
  if (today > draw.claimTo) return "expired";
  return "open";
}

/** 現在台灣是幾月幾日（YYYY-MM-DD）。伺服器在東京、客戶可能在國外，一律換成台北時間 */
export function taipeiToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * 這一期之後的下一期什麼時候開獎。開獎日是每逢單月 25 日（統一發票給獎辦法第 4 條），
 * 對的是前兩個月：7–8 月的發票 9/25 開、9–10 月的 11/25 開、11–12 月的隔年 1/25 開。
 * 只回月份不回年份 —— 畫面上講「9–10 月的發票 11 月 25 日開獎」就夠了。
 */
export function nextDraw(draw: InvoiceDraw): { firstMonth: number; drawMonth: number } {
  const firstMonth = draw.firstMonth === 11 ? 1 : draw.firstMonth + 2;
  const drawMonth = firstMonth === 11 ? 1 : firstMonth + 2;
  return { firstMonth, drawMonth };
}

/** 2026-10-06 → 「115 年 10 月 6 日」 */
export function rocDateText(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y - 1911} 年 ${m} 月 ${d} 日`;
}

/** 200 → 「200 元」、4000 → 「4,000 元」、10000 → 「1 萬元」、10000000 → 「1,000 萬元」 */
export function amountText(amount: number): string {
  if (amount >= 10_000 && amount % 10_000 === 0) return `${(amount / 10_000).toLocaleString("en-US")} 萬元`;
  return `${amount.toLocaleString("en-US")} 元`;
}
