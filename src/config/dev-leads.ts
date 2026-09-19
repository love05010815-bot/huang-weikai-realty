/**
 * 🎯 開發物件追蹤 —— 談屋主專任委託的過程紀錄
 *
 * 一筆「物件」（dev_lead）＝ 一個地址或一個 591／樂屋案件，屋主還沒簽給你。
 * 每去談一次就加一筆「追蹤紀錄」（dev_lead_contact）：什麼時候去的、
 * 用什麼方式、屋主怎麼回、下次什麼時候再約。
 *
 * 物件目前的狀態＝**最新一筆紀錄的結果**，不另外存一份 —— 兩個地方各存一份
 * 狀態，遲早會兜不起來（見 lib/dev-leads.ts 檔頭）。還沒有任何紀錄的物件
 * 狀態就是「待開發」，這個狀態不需要存，沒有紀錄就是待開發。
 */

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "following",
  "interested",
  "signed_us",
  "signed_other",
  "rejected",
  "unreachable",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "待開發",
  contacted: "已接洽",
  following: "追蹤中",
  interested: "有意願",
  signed_us: "已簽約（我方）",
  signed_other: "已簽他家",
  rejected: "婉拒",
  unreachable: "聯絡不到",
};

/**
 * 追蹤紀錄要選的「這次結果」—— 不含 new。
 * 填一筆紀錄這件事本身就代表至少已經接洽過，不會是「待開發」。
 */
export const CONTACT_RESULT_OPTIONS: LeadStatus[] = LEAD_STATUSES.filter((s) => s !== "new");

export const CONTACT_METHODS = ["親訪", "電訪", "LINE", "簡訊", "其他"] as const;

export const LEAD_SOURCES = ["591", "樂屋", "路過現場", "屋主自售看板", "親友介紹", "其他"] as const;

/** next_follow_up_at 落在幾天內（含逾期）算「本週待追蹤」 */
export const FOLLOW_UP_SOON_DAYS = 7;
