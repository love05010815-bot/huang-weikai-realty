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
 * 物件來源（2026-10-02 起兩個，見 lib/match/sync.ts 與 lib/match/merge.ts）：
 *   1. 太平洋官網 www.pacific.com.tw 的物件查詢 API —— 海線七家店（PACIFIC_STORES）的物件，主來源。
 *   2. 愛屋店網 www.houseol.com.tw/sell_item?storeid=4817 的公開頁 —— 只補梧棲店「官網沒上架」的那幾筆。
 * 都不用登入、不用書籤小工具；兩個來源輪流、各自每 30 分鐘同步一次。
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
  /** 店網那家店在太平洋官網的店碼（PACIFIC_STORES 的 key）—— 店網補進來的物件掛在這家店底下 */
  houseolPacificStore: "CUK",
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
  /**
   * 同步時比對價格，有異動就通知條件相符的買方（2026-09-18 他要的）。
   * 關掉的話只剩新物件通知。
   */
  notifyPriceChanges: true,
  /**
   * 一次同步偵測到超過這個數量的價格異動，就**不發通知**、只記在同步結果裡。
   *
   * 這是防呆：愛屋改版或解析壞掉時，價格可能整批跑掉，那不是真的降價 ——
   * 沒這道閘門就會一次把幾百則錯誤推播送出去，額度燒光又要跟客戶道歉。
   */
  maxPriceChangesPerSync: 30,
} as const;

/**
 * 太平洋官網要收的店：海線七家（他 2026-10-02 給的名單，店碼是用各店電話從官網資料對出來的）。
 * key 是官網物件資料裡的 storeID。官網把信義房屋、全台太平洋店的物件混在同一個池子裡，
 * 沒列在這裡的一律不收。電話是店的公開電話，物件卡「聯絡」用。
 */
export const PACIFIC_STORES: Record<string, { name: string; phone: string }> = {
  CUK: { name: "梧棲新市鎮旗艦加盟店", phone: "04-26572100" },
  CBF: { name: "台中沙鹿特三加盟店", phone: "04-26354000" },
  CRN: { name: "台中沙鹿旗艦加盟店", phone: "04-26520123" },
  CZH: { name: "清水中山旗艦加盟店", phone: "04-26233000" },
  CBQ: { name: "台中沙鹿中山加盟店", phone: "04-26634100" },
  CBE: { name: "台中沙鹿靜宜加盟店", phone: "04-26361000" },
  CSK: { name: "沙鹿幸福領航加盟店", phone: "04-26325000" },
};

/** 官網查詢用的縣市名（官網寫「臺」；存進資料庫時會轉成「台中市」） */
export const PACIFIC_CITY = "臺中市";

/**
 * 官網一次只能查一個行政區，這八區就是海線七家店物件所在的地方（地圖模式一區一次回整份，八區約 10 秒）。
 * 七家店偶爾有海線以外的物件（西屯、員林…每家十來筆），那些靠店網補、或就不收 —— 全臺中市兩萬筆要抓四分鐘，不划算。
 */
export const PACIFIC_DISTRICTS = ["梧棲區", "沙鹿區", "清水區", "龍井區", "大肚區", "大甲區", "大安區", "外埔區"] as const;

/** 表單「類型」選項。店網與官網的型態都會對應到這幾個（見 houseol-parse.ts 的 TYPE_MAP、pacific-parse.ts 的 PACIFIC_TYPE_MAP） */
export const MATCH_TYPES = ["電梯大樓", "華廈", "公寓", "透天厝", "套房", "土地"] as const;

/**
 * 表單「其他需求」選項。
 *
 * 2026-09-18 他改的：車位拆成平面／機械，並拿掉近公園、學區、含裝潢、可養寵物
 * （物件本來就大多有，勾了等於沒篩）。希望樓層改成獨立的下拉，不再是這裡的標籤。
 *
 * ⚠️ 店網只給一個「車位」標籤，平面／機械是從標題猜的（海線都寫「平車」）——
 *    詳見 lib/match/houseol-parse.ts 與 matcher 的 featureSatisfied()。
 */
export const MATCH_FEATURES = ["平面車位", "機械車位", "電梯", "近捷運"] as const;

/** 預約看屋的狀態與顯示文字（後台下拉、LINE「我的預約」共用） */
export const VIEWING_STATUS: Record<string, string> = {
  pending: "待綁定 LINE",
  linked: "已綁定，待確認",
  confirmed: "已確認",
  done: "已完成看屋",
  cancelled: "已取消",
};
