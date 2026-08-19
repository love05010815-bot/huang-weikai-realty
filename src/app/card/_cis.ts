/**
 * 凱心成家 CIS — 前台亮色版（/card 名片頁 / 預約表單 / 成功頁，給客戶看）
 * 套用凱心成家 logo 色系：深藍 #01354D + 深藍黑 #122A38 + 米色 #DAB38A。
 * 2026-08-19 從太平洋房屋的紅粉系換過來，與首頁 home.module.css 同一套。
 *
 * ⚠️ green（成功）與 HEAT_TONE（業績溫度）是語意色，不要跟著品牌色換 ——
 *    它們的用途是讓人一眼判讀狀態，變成品牌色就失去意義了。
 * ⚠️ 跟後台深色 cis.ts 分開（那是給系統擁有者久盯的深色；這是給客戶的亮色名片）。
 */
export const RCIS = {
  sky: "#01354D", // 凱心深藍（主色）
  skyDeep: "#122A38", // 深藍黑，漸層深色端
  skySoft: "#EFDCC4", // 淺米底
  orange: "#DAB38A", // 米色（CTA / 強調）
  orangeDeep: "#01354D",
  orangeSoft: "#F7EEE2",
  ink: "#122A38", // 深字（主文字）
  inkSoft: "#33454F", // 次深字
  muted: "#5C6A73", // 弱字
  bg: "#FFFFFF",
  bgSoft: "#F5F1EA",
  border: "#DCE4E9",
  line: "#E6ECF0",
  green: "#2BB673", // 成功 / 確認
  font: "'Noto Sans TC','PingFang TC','Microsoft JhengHei',-apple-system,BlinkMacSystemFont,sans-serif",
  radius: 16,
  radiusSm: 10,
  shadow: "0 4px 20px rgba(18,42,56,0.08)",
  shadowLg: "0 12px 44px rgba(18,42,56,0.14)",
} as const;

// 業績溫度色（後台 + 通知共用判讀）
export const HEAT_TONE: Record<string, { label: string; emoji: string; color: string }> = {
  high: { label: "高溫", emoji: "🔥", color: "#E0950A" },
  mid: { label: "中溫", emoji: "🟡", color: "#4EC4DC" },
  low: { label: "低溫", emoji: "⚪", color: "#7A8896" },
};
