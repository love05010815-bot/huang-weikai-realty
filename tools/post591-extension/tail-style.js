/**
 * 固定尾段的樣式 —— 2026-09-11 他說的：同事在「⚙ 我的資料」可以像 591 編輯器那排一樣（字級 16/18px、粗體、底線、
 * 文字顏色、底色）幫自己的固定尾段設樣式。**只套在固定尾段那幾行**；「☆主推特色介紹:」與型錄的 ✨ 行維持純文字
 * （他 2026-09-07 拍板同事版不帶他的格式 —— 這裡是同事自己選的，不是他的版型）。
 *
 * 純函式、不碰 DOM，scripts/check-post591.mjs 群組 K 直接 import 來測。
 * 591 的編輯器（ProseMirror）實測吃 <span style="font-size / color / background-color">、<strong>、<u>；
 * 樂屋的 Summernote 是 contenteditable，innerHTML 進去什麼都留。
 */

/** 字級跟 591 編輯器一樣只有兩級；"" = 不設定 */
export const TAIL_SIZES = ["", "16px", "18px"];

/** 調色盤：前 11 個是 591 編輯器的「標準色」，後面是他自己版型在用的幾個色＋白（白底＝取消螢光） */
export const TAIL_COLORS = [
  "#000000", "#c00000", "#ff0000", "#ffc000", "#ffff00", "#92d050", "#00b050", "#00b0f0", "#0070c0", "#002060", "#7030a0",
  "#ff0207", "#951919", "#af551b", "#9035cc", "#246aed", "#1a7f37", "#ffffff",
];

const HEX = /^#[0-9a-f]{6}$/;

export function normalizeTailStyle(s) {
  const o = s && typeof s === "object" ? s : {};
  const hex = (v) => {
    const t = String(v || "").trim().toLowerCase();
    return HEX.test(t) ? t : "";
  };
  return {
    size: TAIL_SIZES.includes(o.size) ? o.size : "",
    bold: !!o.bold,
    underline: !!o.underline,
    color: hex(o.color),
    bg: hex(o.bg),
  };
}

export function tailStyleActive(style) {
  const s = normalizeTailStyle(style);
  return !!(s.size || s.bold || s.underline || s.color || s.bg);
}

/** 外掛頁預覽用的 inline CSS */
export function tailStyleCss(style) {
  const s = normalizeTailStyle(style);
  const parts = [];
  if (s.size) parts.push(`font-size:${s.size}`);
  if (s.bold) parts.push("font-weight:700");
  if (s.underline) parts.push("text-decoration:underline");
  if (s.color) parts.push(`color:${s.color}`);
  if (s.bg) parts.push(`background-color:${s.bg}`);
  return parts.join(";");
}

export const escapeHtml = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * 整段描述 → 591／樂屋吃的 HTML：固定尾段那幾行套樣式，前面的行照舊純文字（一行一個 <p>，空行 <p><br></p>）。
 * 固定尾段從哪一行開始：先找跟 tailFirstLine 一樣的那一行（使用者在 ④ 改過字，第一行多半還在）；
 * 找不到就從最後一個 ✨ 行的下一行起。沒設樣式、或找不到起點、起點之後沒字 → 回空字串，外掛就貼純文字（跟以前一樣）。
 * 巢狀順序跟後台 descToHtml 一樣（底色＞字級＞顏色＞粗體＞底線），ProseMirror 貼上實測留得住。
 */
export function buildTailDescHtml(desc, tailFirstLine, style) {
  const s = normalizeTailStyle(style);
  if (!tailStyleActive(s)) return "";
  const lines = String(desc || "").replace(/\r/g, "").split("\n");
  const first = String(tailFirstLine || "").trim();
  let start = first ? lines.findIndex((l) => l.trim() === first) : -1;
  if (start < 0) {
    let lastFeature = -1;
    lines.forEach((l, i) => {
      if (/^\s*✨/.test(l)) lastFeature = i;
    });
    if (lastFeature < 0) return "";
    start = lastFeature + 1;
  }
  if (!lines.slice(start).some((l) => l.trim())) return "";
  return lines
    .map((line, i) => {
      const t = line.trim();
      if (!t) return "<p><br></p>";
      let inner = escapeHtml(t);
      if (i >= start) {
        if (s.underline) inner = `<u>${inner}</u>`;
        if (s.bold) inner = `<strong>${inner}</strong>`;
        if (s.color) inner = `<span style="color:${s.color}">${inner}</span>`;
        if (s.size) inner = `<span style="font-size:${s.size}">${inner}</span>`;
        if (s.bg) inner = `<span style="background-color:${s.bg}">${inner}</span>`;
      }
      return `<p>${inner}</p>`;
    })
    .join("");
}
