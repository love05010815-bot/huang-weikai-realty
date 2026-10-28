/**
 * 後台 CIS 設計 token。
 *
 * 2026-10-28 起**值全部是 CSS 變數**（`var(--adm-*)`），真正的色碼只在
 * `_ui/adminShell.module.css` 一個地方、分「明亮版」「深色版」兩組；
 * 他在左側選單底下切換（存 localStorage `adm-theme`，預設明亮——他說黑的太暗）。
 *
 * 所以這裡的 token 放進 inline style 或 CSS 都會跟著主題變，各頁不用再管現在是哪一版。
 * 要調顏色：改 adminShell.module.css 的變數，**不要**在這裡或各頁寫死色碼。
 * ⚠️ 跟前台亮色 card/_cis.ts 分開（那是給客戶看的名片；這是你自己用的後台）。
 */
export const CIS = {
  bg: "var(--adm-bg)",
  bgSoft: "var(--adm-bg-soft)",
  card: "var(--adm-card)",
  cardHover: "var(--adm-card-hover)",
  cardBorder: "var(--adm-card-border)",
  divider: "var(--adm-divider)",
  text: "var(--adm-text)",
  textSub: "var(--adm-text-sub)",
  textMute: "var(--adm-text-mute)",
  /** 主色（太平洋紅；深色版用提亮版、明亮版用正紅）。名字叫 blue 是歷史包袱，各頁都在用，不改名 */
  blue: "var(--adm-brand)",
  blueDeep: "var(--adm-brand-deep)",
  blueSoft: "var(--adm-brand-soft)",
  /** 強調色（深色版是淺粉、明亮版是深紅），用在要跳出來的字 */
  yellow: "var(--adm-accent)",
  font: "'Noto Sans TC','PingFang TC','Microsoft JhengHei',-apple-system,sans-serif",
  radius: 14,
  radiusSm: 10,
} as const;

// 狀態 chip 5 色 (success/warn/danger/info/neutral)，一樣跟著主題走
export const CHIP = {
  success: { bg: "rgba(var(--adm-success-rgb), 0.14)", color: "var(--adm-success)", border: "rgba(var(--adm-success-rgb), 0.35)" },
  warn: { bg: "rgba(var(--adm-warn-rgb), 0.14)", color: "var(--adm-warn)", border: "rgba(var(--adm-warn-rgb), 0.35)" },
  danger: { bg: "rgba(var(--adm-danger-rgb), 0.14)", color: "var(--adm-danger)", border: "rgba(var(--adm-danger-rgb), 0.35)" },
  info: { bg: "rgba(var(--adm-brand-rgb), 0.12)", color: "var(--adm-brand-soft)", border: "rgba(var(--adm-brand-rgb), 0.35)" },
  neutral: { bg: "rgba(var(--adm-ink-rgb), 0.06)", color: "var(--adm-neutral)", border: "rgba(var(--adm-ink-rgb), 0.14)" },
} as const;

export type ChipTone = keyof typeof CHIP;

// 常用 inline style 片段 (給各頁複用,確保一致)
export const cisCard: React.CSSProperties = {
  background: CIS.card,
  border: `1px solid ${CIS.cardBorder}`,
  borderRadius: CIS.radius,
};

export const cisSectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: CIS.textMute,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: 10,
};
