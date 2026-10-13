/**
 * 📇 屋主建檔 —— 接過的房子、屋主的資料統整在一處，手機也查得到
 *
 * 一筆「屋主」（owner_client）＝ 一個人。底下掛「房子」（owner_property）——
 * 同一個屋主可能給你賣過好幾間，所以房子是掛在人底下，不是一間房一筆人。
 * 另外每個屋主可以記「聯絡紀錄」（owner_contact_log）：哪天聊了什麼。
 *
 * 跟 /admin/leads「開發物件追蹤」的分工：
 *   leads  ＝ 還沒簽給你、正在談的物件（狀態會變、要排追蹤日）
 *   owners ＝ 已經是你客戶的屋主檔（通訊錄＋房子履歷），查資料用
 *
 * 選項改這裡就好，資料層與畫面都從這裡讀。
 */

/** 房子目前的狀態 */
export const PROPERTY_STATUSES = ["listing", "sold", "rented", "self_use", "expired", "delisted", "other"] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export const PROPERTY_STATUS_LABEL: Record<PropertyStatus, string> = {
  listing: "委託中",
  sold: "已售出",
  rented: "已出租",
  self_use: "屋主自用",
  expired: "委託到期",
  delisted: "已下架",
  other: "其他",
};

/** 房子型態 */
export const PROPERTY_KINDS = ["大樓", "華廈", "公寓", "透天", "店面", "辦公", "土地", "廠房", "車位", "其他"] as const;

/** 怎麼認識這位屋主的 */
export const OWNER_SOURCES = ["開發", "親友介紹", "舊客戶", "網路來電", "店頭來客", "社區經營", "其他"] as const;

/** 聯絡方式 */
export const OWNER_CONTACT_METHODS = ["電話", "LINE", "親訪", "店頭", "簡訊", "其他"] as const;

/** 聯絡紀錄要「多久沒聯絡」才算冷掉（清單上提醒用） */
export const STALE_CONTACT_DAYS = 90;

/**
 * 委託合約到期前幾天推 LINE 給專員。
 * 2026-10-12 先做 7 天，2026-10-13 他改口要 10 天 —— 改這個數字就好，
 * 畫面提示、紅色標籤的門檻、提醒查詢的區間都讀這裡。
 */
export const CONTRACT_REMIND_DAYS = 10;

/** 清單上「合約快到期」篩選與統計看的天數（比通知寬，讓他提早看到） */
export const CONTRACT_SOON_DAYS = 30;

/** 合約類型：一般約／專約（2026-10-12 他要的，放在合約編號旁邊） */
export const CONTRACT_TYPES = ["general", "exclusive"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];
export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  general: "一般約",
  exclusive: "專約",
};

/**
 * 「下架」的原因（他列的四種）。needsAmount 的兩種要填成交金額。
 * 下架後房子狀態變成 "delisted"，原因、金額、日期另外存，不覆蓋原本的開價／底價。
 */
export const DELIST_REASONS = [
  { key: "self_sold", label: "自行成交", needsAmount: true },
  { key: "peer_sold", label: "同業成交", needsAmount: true },
  { key: "owner_keep", label: "屋主不賣", needsAmount: false },
  { key: "other", label: "其他原因", needsAmount: false },
] as const;
export type DelistReason = (typeof DELIST_REASONS)[number]["key"];
export const DELIST_REASON_LABEL: Record<DelistReason, string> = Object.fromEntries(
  DELIST_REASONS.map((r) => [r.key, r.label]),
) as Record<DelistReason, string>;

/** 快速搜尋的日期範圍可以套在哪個日期上 */
export const DATE_FILTER_FIELDS = [
  { key: "contractEnd", label: "合約迄日" },
  { key: "contractStart", label: "合約起日" },
  { key: "dealDate", label: "委託／成交日" },
  { key: "delistedAt", label: "下架日" },
  { key: "createdAt", label: "建檔日" },
  { key: "lastContactAt", label: "最近聯絡日" },
] as const;
export type DateFilterField = (typeof DATE_FILTER_FIELDS)[number]["key"];
