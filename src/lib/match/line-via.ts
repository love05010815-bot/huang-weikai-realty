/**
 * 買方的 LINE 是怎麼加的（2026-10-05 他要的：代客建檔「怎麼稱呼」下面多兩格）
 *
 *   私人 LINE   客人加的是他自己的 LINE —— 官方帳號永遠不會知道這個人，line_user_id 一直是空的
 *   官方 LINE   客人加的是店的官方帳號（@a8865）
 *   後面那一格  客人在 LINE 上的 ID 或名稱，之後翻名單才對得上「LINE 上那個人是誰」
 *
 * 這兩格是他**手動記**的，跟 match_buyer.line_user_id（官方帳號真的綁定了、推播推得到）是兩回事：
 * 畫面上「LINE 已綁／未綁」看的還是 line_user_id，這裡只是多一個標籤。純函式、不碰資料庫，前後台都 import。
 */
export type LineVia = "private" | "official";

export const LINE_VIA_OPTIONS: readonly { value: LineVia; label: string }[] = [
  { value: "private", label: "私人 LINE" },
  { value: "official", label: "官方 LINE" },
];

/** 表單／資料庫送來的值整理成合法的；不認得的一律當沒選 */
export function normalizeLineVia(v: unknown): LineVia | "" {
  return v === "private" || v === "official" ? v : "";
}

export function lineViaLabel(via: LineVia | "" | null | undefined): string {
  return LINE_VIA_OPTIONS.find((o) => o.value === via)?.label ?? "";
}

/** 給畫面一行字：「私人 LINE：小凱」「官方 LINE」「LINE：小凱」；兩格都空就是 "" */
export function lineText(via: LineVia | "" | null | undefined, name: string | null | undefined): string {
  const label = lineViaLabel(via);
  const n = (name ?? "").trim();
  if (label && n) return `${label}：${n}`;
  if (label) return label;
  return n ? `LINE：${n}` : "";
}
