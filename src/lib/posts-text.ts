/**
 * 📄 文章內文的排版規則 —— 純函式，不碰資料庫、不碰 API，前後台共用。
 *
 * ## 為什麼不用 Markdown 套件
 *
 * 他的文案是**從 FB／LINE 那種貼文直接複製過來的**，長這樣：
 *
 *     🏦 政策利率維持不變，正式「連10凍」
 *     🏡 自然人第2戶購屋貸款最高成數
 *     👉 從原本「6成」調升至「7成」
 *
 * 丟進標準 Markdown 會把這幾行**合併成一行**（Markdown 的單換行不算換行），
 * 他貼上去看到的東西跟前台長出來的東西就不一樣了 —— 那是最難查的一種壞掉，
 * 因為兩邊都「沒有錯誤訊息」。所以這裡的第一條規則是：
 *
 * 🔴 **他怎麼換行，前台就怎麼換行。** 不合併、不重排、不猜他的意圖。
 *
 * 在那之上只加四條他會用到的語法，其餘一律當純文字：
 *
 *   `## 標題` 或整行 `【標題】`  → 小標
 *   `- 項目`                     → 項目符號清單
 *   `---`                        → 分隔線
 *   `**粗體**`                   → 粗體；文字裡的網址自動變連結
 *
 * ⚠️ emoji 開頭的行**刻意不當成清單**。貼文裡 🔸🏦👉 這些是他排版的一部分，
 *    改成 ul 會把他的縮排與符號換掉，看起來就不是他寫的那篇了。
 *
 * ## 這支同時餵前台與後台預覽
 *
 * 後台編輯器右邊的預覽跟前台內頁跑的是**同一個 `parsePostBody()`**。
 * 不要為了預覽另外寫一份簡化版 —— 那等於預覽永遠有機會跟正式頁不一樣，
 * 而他只會在客戶看到之後才發現。
 */

/** 一段文字裡的行內樣式。 */
export type PostSpan =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "link"; text: string; href: string };

/** 一篇文章拆出來的區塊。 */
export type PostBlock =
  | { kind: "heading"; spans: PostSpan[] }
  | { kind: "paragraph"; lines: PostSpan[][] }
  | { kind: "list"; items: PostSpan[][] }
  | { kind: "divider" };

/** 網址：http/https 開頭，吃到空白或中文全形標點為止。結尾的標點不算進網址。 */
const URL_RE = /https?:\/\/[^\s<>「」【】（）()，。、！？]+/g;

/** `**粗體**`。非貪婪，且中間不能換行（跨行的星號多半是他打錯，不要吃掉整段）。 */
const STRONG_RE = /\*\*([^*\n]+)\*\*/g;

/** 把一行純文字切成行內樣式。先切粗體，再在非粗體的片段裡找網址。 */
export function parseSpans(line: string): PostSpan[] {
  const out: PostSpan[] = [];
  let last = 0;
  STRONG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = STRONG_RE.exec(line))) {
    if (m.index > last) out.push(...linkify(line.slice(last, m.index)));
    out.push({ kind: "strong", text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(...linkify(line.slice(last)));
  return out;
}

function linkify(text: string): PostSpan[] {
  const out: PostSpan[] = [];
  let last = 0;
  URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(text))) {
    // 網址黏到的結尾標點（例如「…weikaihouse.com。」）不要算進連結
    let href = m[0];
    while (href.length > 1 && /[.,;:!?)]$/.test(href)) href = href.slice(0, -1);
    const start = m.index;
    if (start > last) out.push({ kind: "text", text: text.slice(last, start) });
    out.push({ kind: "link", text: href, href });
    last = start + href.length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** 整行被【】包起來（前面可以有 emoji 或空白）＝ 小標。 */
const BRACKET_HEADING_RE = /^\s*[^\p{L}\p{N}\s]{0,3}\s*【(.+)】\s*$/u;

/** `- `、`* `、`• `、`・` 開頭 ＝ 清單。⚠️ emoji 不在這裡，理由見檔頭。 */
const BULLET_RE = /^\s*(?:[-*•]\s+|・\s*)(.*)$/;

const HEADING_RE = /^\s*#{1,4}\s+(.+?)\s*$/;
const DIVIDER_RE = /^\s*(?:-{3,}|={3,}|—{2,})\s*$/;

/**
 * 把整篇內文拆成區塊。
 *
 * 空白行分段；同一段裡的每一行各自保留（前台用 `<br>` 接回去）。
 */
export function parsePostBody(body: string): PostBlock[] {
  const blocks: PostBlock[] = [];
  const lines = (body || "").replace(/\r\n?/g, "\n").split("\n");

  /** 正在累積的段落／清單。碰到不同型別或空白行就收掉。 */
  let para: PostSpan[][] = [];
  let list: PostSpan[][] = [];

  const flush = () => {
    if (para.length) blocks.push({ kind: "paragraph", lines: para });
    if (list.length) blocks.push({ kind: "list", items: list });
    para = [];
    list = [];
  };

  for (const raw of lines) {
    if (!raw.trim()) {
      flush();
      continue;
    }
    if (DIVIDER_RE.test(raw)) {
      flush();
      blocks.push({ kind: "divider" });
      continue;
    }
    const head = HEADING_RE.exec(raw) ?? BRACKET_HEADING_RE.exec(raw);
    if (head) {
      flush();
      blocks.push({ kind: "heading", spans: parseSpans(head[1].trim()) });
      continue;
    }
    const bullet = BULLET_RE.exec(raw);
    if (bullet) {
      if (para.length) flush();
      list.push(parseSpans(bullet[1]));
      continue;
    }
    if (list.length) flush();
    para.push(parseSpans(raw.trim()));
  }
  flush();
  return blocks;
}

/** 把內文壓成一行純文字（語法符號都拿掉），摘要與 og:description 用。 */
export function postPlainText(body: string): string {
  return (body || "")
    .replace(/\r\n?/g, "\n")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*#{1,4}\s+/gm, "")
    .replace(/^\s*(?:[-*•]\s+|・\s*)/gm, "")
    .replace(/^\s*(?:-{3,}|={3,}|—{2,})\s*$/gm, " ")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 自動摘要：他沒填摘要時，拿內文開頭湊一段。
 *
 * ⚠️ 切在 `limit` 個字，但**不切在網址中間** —— 半截網址看起來像亂碼。
 */
export function postExcerpt(body: string, limit = 90): string {
  const text = postPlainText(body);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}…`;
}

/** 中文習慣的字數（不含空白）。後台顯示用。 */
export function postCharCount(body: string): number {
  return Array.from(postPlainText(body).replace(/\s+/g, "")).length;
}

/** 估閱讀時間（分鐘，最少 1）。中文一分鐘約 400 字。 */
export function postReadMinutes(body: string): number {
  return Math.max(1, Math.round(postCharCount(body) / 400));
}
