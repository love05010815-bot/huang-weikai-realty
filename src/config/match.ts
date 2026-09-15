/**
 * 🎯 買方配對 × 預約看屋 —— 這一組功能的設定都在這裡
 *
 * 2026-09-15 從獨立原型（line-house-match）併進官網。整條流程：
 *   1. 買方在 /match 填購屋條件 → 依加權分數配對「愛屋店網同步進來的在售物件」
 *   2. 看中意 → 填姓名／電話／時段 → 產生預約編號 BK-XXXXXX
 *   3. 導到官方 LINE，預填「預約確認 BK-XXXXXX」→ 買方按送出
 *   4. /api/line/webhook 收到 → 綁定 LINE userId → 回確認卡 → 通知你（LINE 推播＋Email＋admin 群）
 *   5. 之後新物件同步進來，自動推播給條件相符、且綁過 LINE 的買方
 *
 * 物件來源：愛屋店網（www.houseol.com.tw/sell_item?storeid=XXXX）的公開頁，
 * 不用登入、不用書籤小工具；每 30 分鐘自動同步（見 lib/match/sync.ts）。
 *
 * ⚠️ 官方帳號目前是「輕用量」方案，每月免費推播只有 200 則。
 *    reply（回覆）不計費，push（主動推播）才計費 —— 所以確認卡用 reply，
 *    新物件通知才用 push，而且每次同步最多推給 maxNotifyBuyersPerSync 位買方。
 */
export const MATCH = {
  /** 愛屋店網 storeid（店網網址 sell_item?storeid=XXXX 的數字） */
  houseolStoreId: "4817",
  /**
   * 本店店碼（物件網址 /sell_item/H229-S.../ 裡的 H229）。
   * 只同步這個店碼的物件，排除體系／聯賣物件；留空字串 = 店網上有的全收。
   */
  houseolStoreCode: "H229",
  /**
   * 幾分鐘同步一次。
   * 觸發來源是 keep-warm 排程每 10 分鐘來敲一次 /api/match/sync，端點自己判斷到時間才真的跑；
   * 後台「立即同步」按鈕不受這個限制。
   */
  syncIntervalMin: 30,
  /** 配對度達到幾分才算「推薦」，也是新物件自動推播的門檻（0–100） */
  threshold: 60,
  /** 官方帳號 ID（含 @）。深層連結用：加好友、開聊天室並預填訊息 */
  lineOaId: "@a8865",
  /**
   * 有新預約時，用官方帳號推播通知的 LINE userId（你的工作帳，從 webhook 紀錄取得）。
   * 留空陣列 = 不推播，只寄信＋推 admin 群。
   */
  agentLineUserIds: ["U066092b770e4093c9bd2ed200c0b1da5"],
  /** 每次同步最多推播給幾位買方（省 200 則／月的額度） */
  maxNotifyBuyersPerSync: 20,
  /** 每位買方一則推播最多帶幾個物件（Flex carousel 上限 10，太多也看不完） */
  maxListingsPerNotify: 5,
} as const;

/** 表單「類型」選項。愛屋店網的型態會對應到這幾個（見 lib/match/houseol-parse.ts 的 TYPE_MAP） */
export const MATCH_TYPES = ["電梯大樓", "華廈", "公寓", "透天厝", "套房", "土地"] as const;

/** 表單「其他需求」選項。店網的特色標籤（近學校→學區…）會對應過來 */
export const MATCH_FEATURES = ["車位", "電梯", "近捷運", "近公園", "學區", "含裝潢", "可養寵物"] as const;

/** 預約看屋的狀態與顯示文字（後台下拉、LINE「我的預約」共用） */
export const VIEWING_STATUS: Record<string, string> = {
  pending: "待綁定 LINE",
  linked: "已綁定，待確認",
  confirmed: "已確認",
  done: "已完成看屋",
  cancelled: "已取消",
};
