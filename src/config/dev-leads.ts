/**
 * 🎯 開發物件追蹤 —— 談屋主專任委託的過程紀錄
 *
 * 一筆「物件」（dev_lead）＝ 他從各處丟進來的一條連結（591／樂屋／FB…）或一個地址，
 * 屋主還沒簽給你。每去談一次就加一筆「追蹤紀錄」（dev_lead_contact）：什麼時候去的、
 * 用什麼方式、屋主怎麼回、下次什麼時候再約。
 *
 * 2026-10-13 他說原本的做法做錯了，重新講了一次用法：
 *   - 從不同地方丟連結或地址進來，每次查都要能**直接點開連結**
 *   - 要看得到**丟進來的日期**、**第一次聯繫的日期**
 *   - 進度到哪、**找到屋主了沒**
 *   - 連結要**依區域分**，要能用區域搜尋（網址帶 ?area=）
 *
 * 物件目前的狀態＝**最新一筆紀錄的結果**，不另外存一份 —— 兩個地方各存一份
 * 狀態，遲早會兜不起來（見 lib/dev-leads.ts 檔頭）。還沒有任何紀錄的物件
 * 狀態就是「待開發」。「第一次聯繫」同理＝最早一筆紀錄的日期，不另外存。
 * 「找到屋主了沒」是他手動勾的旗標（owner_found），不是從紀錄算的 —— 找到屋主跟
 * 聯繫過幾次沒有必然關係（591 案件可能聯繫了三次對方都是別家仲介）。
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

/** 來源。貼網址時會從網域自動猜（lib/dev-leads-text.ts 的 detectSource） */
export const LEAD_SOURCES = [
  "591",
  "樂屋",
  "愛屋",
  "好房網",
  "信義",
  "永慶",
  "FB",
  "路過現場",
  "屋主自售看板",
  "親友介紹",
  "其他",
] as const;

/**
 * 區域選項。海線各區一個一個列，台中其他區一律歸「其他」；
 * 地址裡認得出區名就自動填（lib/dev-leads-text.ts 的 detectArea），只有連結沒地址的要他自己選。
 */
export const LEAD_AREAS = ["沙鹿區", "梧棲區", "清水區", "龍井區", "大肚區", "大甲區", "大安區", "外埔區", "其他"] as const;

export type LeadArea = (typeof LEAD_AREAS)[number];

/** 區域留空時畫面上的字（資料庫存 NULL，不存這個字） */
export const LEAD_AREA_UNSET_LABEL = "未分區";

/** next_follow_up_at 落在幾天內（含逾期）算「本週待追蹤」 */
export const FOLLOW_UP_SOON_DAYS = 7;
