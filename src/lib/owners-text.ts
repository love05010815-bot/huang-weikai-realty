/**
 * 屋主建檔的純文字工具 —— **沒有任何 import**，客戶端元件可以直接用。
 *
 * 跟 lib/owners.ts 分開的理由：那支 import 了 Prisma（`@/lib/db`），
 * 客戶端元件只要從它拿一支小函式，整個 Prisma 就會被拖進瀏覽器 bundle、build 直接炸。
 * tsc 不會抓這種錯，要等 `next build` 才知道。
 */

/**
 * 切字串但不切壞 emoji（跟 posts.ts／videos.ts 的 cut 同一支）。
 * `slice` 按 UTF-16 單位切，emoji 占兩個單位，切在中間 Prisma 會丟
 * `unexpected end of hex escape`、整筆存不進去，訊息完全看不出跟 emoji 有關。
 */
export function cut(s: string, n: number): string {
  const clean = s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
  const out = clean.slice(0, n);
  return /[\uD800-\uDBFF]$/.test(out) ? out.slice(0, -1) : out;
}

/** 標籤欄：逗號／頓號／分號／空白都當分隔，去重、去空 */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const t of raw.split(/[,，、;；\s]+/)) {
    const v = t.trim();
    if (v && !seen.has(v)) seen.add(v);
  }
  return [...seen];
}

/**
 * 電話只留數字，搜尋與 tel: 連結用：「0912-345-678」「0912 345 678」「(04)2626-1234」都要對得起來。
 * 存進資料庫的還是他打的原樣（顯示用），這支只拿來比對。
 */
export function phoneDigits(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D+/g, "");
}

/** "YYYY-MM-DD" 往後推 n 天（可為負），一樣用字串算，不繞去本地時區 */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 兩個 "YYYY-MM-DD" 差幾天（to - from），同一天是 0 */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** 合約到期提醒的一句話：「剩 N 天」「今天到期」「已過期 N 天」 */
export function contractDueLabel(today: string, contractEnd: string): string {
  const n = daysBetween(today, contractEnd);
  if (n > 0) return `剩 ${n} 天`;
  if (n === 0) return "今天到期";
  return `已過期 ${-n} 天`;
}

export type ContractReminderItem = {
  ownerName: string;
  ownerPhone: string | null;
  address: string;
  community: string | null;
  contractNo: string | null;
  contractStart: string | null;
  contractEnd: string;
};

/**
 * 推給專員的 LINE 文字。幾筆合在一則裡，不要一筆一則——官方帳號每月免費額度只有 200 則。
 * 連結帶 openExternalBrowser=1：他都從 LINE 點，沒這個參數會卡在 LINE 內建瀏覽器的 Google 登入。
 */
export function buildContractReminderText(today: string, items: ContractReminderItem[], siteUrl: string): string {
  const fmt = (d: string | null) => (d ? d.replaceAll("-", "/") : "？");
  const lines: string[] = [`📄 委託合約到期提醒（${items.length} 件）`, ""];
  for (const it of items) {
    lines.push(`▍${it.ownerName}${it.ownerPhone ? `｜${it.ownerPhone}` : ""}`);
    lines.push(`${it.community ? `${it.community}｜` : ""}${it.address}`);
    lines.push(`合約${it.contractNo ? ` ${it.contractNo}` : ""}：${fmt(it.contractStart)} ～ ${fmt(it.contractEnd)}（${contractDueLabel(today, it.contractEnd)}）`);
    lines.push("");
  }
  lines.push(`查看屋主建檔：${siteUrl.replace(/\/$/, "")}/admin/owners?openExternalBrowser=1`);
  return lines.join("\n");
}
