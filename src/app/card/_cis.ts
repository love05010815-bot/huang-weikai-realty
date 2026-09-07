/**
 * 凱心成家 CIS — 前台亮色版（/card 名片頁 / 預約表單 / 成功頁，給客戶看）
 * 2026-09-07 起套馬卡龍「薄荷 × 蜜桃」（藍綠 #2FA894 ＋ 蜜桃 #F4A876，見 home.module.css 檔頭）；之前是 logo 的深藍＋米色。
 * 2026-08-19 從太平洋房屋的紅粉系換過來，與首頁 home.module.css 同一套。
 *
 * ⚠️ green（成功）與 HEAT_TONE（業績溫度）是語意色，不要跟著品牌色換 ——
 *    它們的用途是讓人一眼判讀狀態，變成品牌色就失去意義了。
 * ⚠️ 跟後台深色 cis.ts 分開（那是給系統擁有者久盯的深色；這是給客戶的亮色名片）。
 */
/* 2026-09-07 跟前台一起換成馬卡龍「薄荷 × 蜜桃」（見 home.module.css 檔頭）。
   欄位名稱（sky／orange）是舊色系留下來的，改名要動十幾個檔，先留著；值已經是新色。 */
export const RCIS = {
  sky: "#2FA894", // 主色：藍綠
  skyDeep: "#227F71", // 主色深一階
  skySoft: "#E6F5F0", // 薄荷奶油底
  orange: "#F4A876", // 蜜桃（CTA / 強調）
  orangeDeep: "#2FA894",
  orangeSoft: "#FDE7D6",
  ink: "#22323F", // 深字（主文字）
  inkSoft: "#334652", // 次深字
  muted: "#5B6B73", // 弱字
  bg: "#FFFFFF",
  bgSoft: "#F1F6F4",
  border: "#D9E2E6",
  line: "#E4ECEA",
  green: "#2BB673", // 成功 / 確認
  font: "'Noto Sans TC','PingFang TC','Microsoft JhengHei',-apple-system,BlinkMacSystemFont,sans-serif",
  radius: 16,
  radiusSm: 10,
  shadow: "0 4px 20px rgba(34,50,63,0.08)",
  shadowLg: "0 12px 44px rgba(34,50,63,0.14)",
} as const;

// 業績溫度色（後台 + 通知共用判讀）
export const HEAT_TONE: Record<string, { label: string; emoji: string; color: string }> = {
  high: { label: "高溫", emoji: "🔥", color: "#E0950A" },
  mid: { label: "中溫", emoji: "🟡", color: "#4EC4DC" },
  low: { label: "低溫", emoji: "⚪", color: "#7A8896" },
};
