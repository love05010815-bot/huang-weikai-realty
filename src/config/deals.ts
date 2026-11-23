/**
 * 成交紀錄（/admin/deals）的選項。要加／改成交方式只改這裡。
 *
 * 成交方式照他 Excel 的三種：
 *   開發 ＝ 賣方是我的（別人帶買方）
 *   銷售 ＝ 買方是我的（別人的委託）
 *   獨得 ＝ 買賣雙方都是我的
 */
export const DEAL_METHODS = ["dev", "sale", "both"] as const;
export type DealMethod = (typeof DEAL_METHODS)[number];

export const DEAL_METHOD_LABEL: Record<DealMethod, string> = {
  dev: "開發",
  sale: "銷售",
  both: "獨得",
};

/** 達成業績 ＝ 服務費總額 × 分得點數 ÷ 這個數（他的表：59.32 萬 × 3 點 ＝ 17.796 萬） */
export const POINTS_BASE = 10;
