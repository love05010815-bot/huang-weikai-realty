/**
 * 後台 CIS 設計 token — 深色質感 (給系統擁有者久盯不刺眼)
 * 主色套用太平洋房屋紅 #E00000，在深底上用提亮版本確保可讀性。
 * ⚠️ 跟前台亮色 card/_cis.ts 分開（那是給客戶看的名片；這是你自己用的後台）。
 */
export const CIS = {
  bg: "#1a1614", // 深棕黑底 (非純黑)
  bgSoft: "#231d1a", // 區塊次底
  card: "rgba(255,255,255,0.03)", // 卡片
  cardHover: "rgba(255,255,255,0.05)",
  cardBorder: "rgba(255,255,255,0.08)", // 卡片邊框
  divider: "rgba(255,255,255,0.06)",
  text: "#f8f4f3", // 主文字
  textSub: "#d0c6c4", // 次文字
  textMute: "#a69a97", // 弱文字
  blue: "#F26666", // 太平洋紅（深底提亮版，維持對比）
  blueDeep: "#E00000",
  blueSoft: "#EE828A",
  yellow: "#F5C0C4", // 太平洋淺粉（強調）
  font: "'Noto Sans TC','PingFang TC','Microsoft JhengHei',-apple-system,sans-serif",
  radius: 14,
  radiusSm: 10,
} as const;

// 狀態 chip 4 色 (success/warn/danger/info/neutral)
export const CHIP = {
  success: { bg: "rgba(34,197,94,0.15)", color: "#4ade80", border: "rgba(34,197,94,0.35)" },
  warn: { bg: "rgba(245,158,11,0.15)", color: "#fbbf24", border: "rgba(245,158,11,0.35)" },
  danger: { bg: "rgba(244,63,94,0.15)", color: "#fb7185", border: "rgba(244,63,94,0.35)" },
  info: { bg: "rgba(238,130,138,0.16)", color: "#EE828A", border: "rgba(238,130,138,0.4)" },
  neutral: { bg: "rgba(255,255,255,0.06)", color: "#9aa0a6", border: "rgba(255,255,255,0.14)" },
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
