/**
 * 收件匣的共同語言 —— 各平台的留言長得都不一樣，這裡統一成同一個形狀。
 *
 * 為什麼要這一層：使用者要的是「**所有**留言都回到同一個後台」。
 * 如果 YouTube 一個區塊、FB 一個區塊、IG 一個區塊，那只是把三個 App
 * 搬到同一頁，並沒有真的合起來 —— 客戶昨天在 IG 問的問題，還是要自己去翻。
 * 統一成同一個型別，才能混在一起依時間排序、一眼看完待回覆的。
 *
 * ⚠️ 這支檔案刻意不 import 任何東西：server 端的抓取與 client 端的回覆框都要用。
 */

export type InboxPlatform = "youtube" | "facebook" | "instagram" | "line";

export const PLATFORM_LABEL: Record<InboxPlatform, string> = {
  youtube: "YouTube",
  facebook: "Facebook",
  instagram: "Instagram",
  line: "LINE",
};

/** 各平台的代表色，用來在混合列表裡一眼分辨 */
export const PLATFORM_COLOR: Record<InboxPlatform, string> = {
  youtube: "#ff4e45",
  facebook: "#4a90e2",
  instagram: "#e17bb0",
  line: "#06c755",
};

/**
 * 一對一私訊的平台。目前只有 LINE。
 *
 * 為什麼要標出來：其他三家的留言與回覆都是**公開**的，LINE 是**私訊**。
 * 混在同一份清單裡看起來一樣，但回下去的後果不一樣 ——
 * 回覆框要換句話講，而且 LINE 的推播會吃每月免費額度。
 */
export function isPrivatePlatform(p: InboxPlatform): boolean {
  return p === "line";
}

export type InboxReply = {
  author: string;
  text: string;
  publishedAt: string;
  /** 這則回覆是你（帳號擁有者）發的 */
  byOwner: boolean;
};

export type InboxComment = {
  platform: InboxPlatform;
  /** 回覆時要傳回去的 id（各平台語意不同，但都是「回這串」用的那個） */
  id: string;
  author: string;
  authorImage: string | null;
  text: string;
  /** ISO 字串。排序與顯示都用它 */
  publishedAt: string;
  /** 點過去看原文。拿不到就 null，畫面上不顯示連結 */
  permalink: string | null;
  /** 這則留言掛在哪（影片標題／貼文開頭），讓你知道客戶在講哪一件事 */
  context: string | null;
  /**
   * 你已經回過這串了。
   *
   * 🔴 一律從「實際的回覆內容」算出來，不用資料庫旗標 ——
   *    這樣你在各平台 App 裡回的也算數，不會出現「後台說沒回、其實回過了」。
   */
  answeredByOwner: boolean;
  replies: InboxReply[];
  /**
   * LINE 專用：這串還在等你回，而且要靠人手動標記才清得掉。
   *
   * 存在的理由：LINE 的 webhook **收不到你從手機回出去的訊息**，所以
   * answeredByOwner 對 LINE 來說是「有沒有被標記處理過」，不是真的「回了沒」。
   * 畫面上要多一顆「已回」給人手動清，其他三家不需要（那三家算得出真相）。
   */
  needsManualClear?: boolean;
  /**
   * 這則留言本身是一張照片／一個檔案，不是純文字（目前只有 LINE 會有）。
   *
   * url 是**後台自己的代理網址**，不是平台的原始網址 —— 客戶傳來的東西可能是
   * 身分證或權狀，一定要經過登入才讀得到（見 /api/admin/line/media/[messageId]）。
   */
  media?: { kind: "image" | "video" | "audio" | "file"; url: string } | null;
};

/** 某個平台的抓取結果。失敗要講原因，不能靜靜回空陣列裝作沒留言。 */
export type PlatformFetch = {
  platform: InboxPlatform;
  /** 沒綁定 = 還沒接，跟「接了但抓失敗」要分開，畫面上講的話不一樣 */
  bound: boolean;
  comments: InboxComment[];
  error: string | null;
  /** 綁到哪個帳號／頻道／粉專，顯示用 */
  accountName: string | null;
};

/** 依時間新到舊。跨平台混排時用這個。 */
export function sortByNewest(comments: InboxComment[]): InboxComment[] {
  return [...comments].sort((a, b) => {
    const ta = Date.parse(a.publishedAt) || 0;
    const tb = Date.parse(b.publishedAt) || 0;
    return tb - ta;
  });
}
