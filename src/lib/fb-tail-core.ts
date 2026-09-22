/**
 * FB 社團廣告「固定尾段」的純邏輯 —— 沒有任何人的資料。
 *
 * 為什麼跟 `config/fb-tail.ts` 分開：那支放的是黃瑋凱本人的尾段（電話、LINE、經紀人證號）與他的網址補丁，
 * 同事版外掛（tools/fb-group-poster/app）要把操作畫面整包編進外掛裡，**不能把他的個資一起編進去**，
 * 所以畫面只 import 這支；他的尾段由後台那一頁（FbAdminManager）另外傳進來。
 */

/** 文案 ＋ 固定尾段，中間空一行。尾段已經在文案裡（自己貼過）就不重複接。 */
export function withTail(adText: string, tail: string): string {
  const body = String(adText || "").replace(/\s+$/, "");
  const t = String(tail || "").trim();
  if (!t) return body;
  // 用尾段的第一行當指紋：若自己貼過整段，就不要再接一次
  const firstLine = t.split("\n").find((l) => l.trim());
  if (firstLine && body.includes(firstLine.trim())) return body;
  return body ? `${body}\n\n${t}` : t;
}

/** 找出被截斷、點不開的連結（結尾是 ... 或 …）。回傳整行，方便直接顯示。 */
export function truncatedLinks(text: string): string[] {
  return String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /https?:\/\/\S*(\.\.\.|…)\s*$/.test(l));
}
