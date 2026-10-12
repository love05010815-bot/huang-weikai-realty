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
export const PROPERTY_STATUSES = ["listing", "sold", "rented", "self_use", "expired", "other"] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export const PROPERTY_STATUS_LABEL: Record<PropertyStatus, string> = {
  listing: "委託中",
  sold: "已售出",
  rented: "已出租",
  self_use: "屋主自用",
  expired: "委託到期",
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
