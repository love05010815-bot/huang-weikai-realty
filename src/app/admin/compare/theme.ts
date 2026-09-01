/**
 * 把後台的 CIS 色票轉成 CSS 變數，給 compare.module.css 用。
 *
 * 🔴 **色碼只有 `_components/cis.ts` 一個來源。** CSS module 讀不到 TS 物件，所以在最外層
 *    用 inline style 把值往下傳，樣式表一律 `var(--cmp-*)`。
 *
 * ⚠️ 第一版整份 CSS 寫死淺色貼進深色後台：卡片是白的，文字框寫 `color: inherit`
 *    繼承到深色主題的淺色字 —— 淺字打在白底上等於隱形，貼進去的內容完全看不到。
 *    要加新顏色請加變數，不要在 CSS 裡直接寫色碼。
 */
import type { CSSProperties } from "react";
import { CHIP, CIS } from "@/app/admin/_components/cis";

export const COMPARE_THEME = {
  "--cmp-card": CIS.card,
  "--cmp-card-soft": CIS.bgSoft,
  "--cmp-border": CIS.cardBorder,
  "--cmp-divider": CIS.divider,
  "--cmp-text": CIS.text,
  "--cmp-sub": CIS.textSub,
  "--cmp-mute": CIS.textMute,
  "--cmp-accent": CIS.blue,
  "--cmp-accent-deep": CIS.blueDeep,
  "--cmp-highlight": CIS.yellow,
  // 反白徽章的墨色：小字（11px）要 4.5:1，用亮底＋深字比暗底＋亮字穩
  "--cmp-ink": CIS.bg,
  // 底色用的淡色塊：CIS.yellow(#F5C0C4) 與 CIS.blue(#F26666) 的低透明度版本。
  // CSS 沒辦法對 hex 變數加 alpha，所以在這裡先調好再傳下去 —— 這樣 CSS 就零色碼。
  "--cmp-highlight-bg": "rgba(245,192,196,0.10)",
  "--cmp-highlight-bg-strong": "rgba(245,192,196,0.18)",
  "--cmp-accent-bg": "rgba(242,102,102,0.10)",
  "--cmp-hover": CIS.cardHover,
  // 輸入欄位要比卡片更暗，才看得出是「可以打字的凹槽」
  "--cmp-input": "rgba(0,0,0,0.30)",
  "--cmp-input-focus": "rgba(0,0,0,0.45)",
  "--cmp-ok-bg": CHIP.success.bg,
  "--cmp-ok-bd": CHIP.success.border,
  "--cmp-ok-fg": CHIP.success.color,
  "--cmp-warn-bg": CHIP.warn.bg,
  "--cmp-warn-bd": CHIP.warn.border,
  "--cmp-warn-fg": CHIP.warn.color,
  "--cmp-bad-bg": CHIP.danger.bg,
  "--cmp-bad-bd": CHIP.danger.border,
  "--cmp-bad-fg": CHIP.danger.color,
  "--cmp-info-bg": CHIP.info.bg,
  "--cmp-info-fg": CHIP.info.color,
  "--cmp-neutral-bg": CHIP.neutral.bg,
  "--cmp-neutral-fg": CHIP.neutral.color,
} as CSSProperties;
