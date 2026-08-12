/**
 * 太平洋房屋 CIS — 前台亮色版（/card 名片頁 / 預約表單 / 成功頁，給客戶看）
 * 套用太平洋房屋品牌色：紅 #E00000 + 深棕 #231815 + 粉 #EE828A，穩重專業。
 * ⚠️ 跟後台深色 cis.ts 分開（那是給系統擁有者久盯的深色；這是給客戶的亮色名片）。
 */
export const RCIS = {
  sky: "#E00000", // 太平洋紅（主色）
  skyDeep: "#231815", // 深棕，漸層深色端
  skySoft: "#F5C0C4", // 淺粉底
  orange: "#EE828A", // 粉（CTA / 強調）
  orangeDeep: "#E00000",
  orangeSoft: "#FBE4E6",
  ink: "#231815", // 深字（主文字）
  inkSoft: "#4A3B37", // 次深字
  muted: "#6A6A6A", // 弱字
  bg: "#FFFFFF",
  bgSoft: "#FBF4F4",
  border: "#EEE0E0",
  line: "#F0E6E6",
  green: "#2BB673", // 成功 / 確認
  font: "'Noto Sans TC','PingFang TC','Microsoft JhengHei',-apple-system,BlinkMacSystemFont,sans-serif",
  radius: 16,
  radiusSm: 10,
  shadow: "0 4px 20px rgba(35,24,21,0.08)",
  shadowLg: "0 12px 44px rgba(35,24,21,0.14)",
} as const;

// 業績溫度色（後台 + 通知共用判讀）
export const HEAT_TONE: Record<string, { label: string; emoji: string; color: string }> = {
  high: { label: "高溫", emoji: "🔥", color: "#E0950A" },
  mid: { label: "中溫", emoji: "🟡", color: "#4EC4DC" },
  low: { label: "低溫", emoji: "⚪", color: "#7A8896" },
};
