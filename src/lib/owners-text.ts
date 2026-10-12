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
