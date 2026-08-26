/**
 * 📥 收件匣的匯總層 —— 把各平台的留言抓回來、轉成同一個形狀、混在一起排序。
 *
 * 這一層存在的理由：使用者要的是「所有留言回到同一個後台」。
 * 三個平台各自一個區塊，只是把三個 App 搬到同一頁而已 —— 客戶昨天在 IG 問的，
 * 還是得自己去翻。合成一份依時間排序的清單，才是真的合起來了。
 *
 * 🔴 一個平台掛掉不能拖垮其他平台。所以用 allSettled，
 *    某一家 API 出事就只有那一段顯示錯誤，其餘照常。
 */
import {
  sortByNewest,
  type InboxComment,
  type InboxPlatform,
  type PlatformFetch,
} from "@/lib/inbox-types";
import { fetchFacebookComments, fetchInstagramComments } from "@/lib/meta";
import { fetchLineComments } from "@/lib/line-bot/inbox";
import { getBoundChannel, isYoutubeBound, listChannelComments } from "@/lib/youtube";

/** YouTube 的資料轉成收件匣的共同形狀。 */
async function fetchYoutube(): Promise<PlatformFetch> {
  const base: PlatformFetch = {
    platform: "youtube",
    bound: false,
    comments: [],
    error: null,
    accountName: null,
  };

  if (!(await isYoutubeBound())) return base;
  base.bound = true;

  const channel = await getBoundChannel();
  base.accountName = channel?.title ?? null;

  const result = await listChannelComments(50);
  if (!result.ok) {
    base.error = result.error;
    return base;
  }

  base.comments = result.comments.map<InboxComment>((c) => ({
    platform: "youtube",
    id: c.id,
    author: c.author,
    authorImage: c.authorImage,
    text: c.text,
    publishedAt: c.publishedAt,
    permalink: c.videoId
      ? `https://www.youtube.com/watch?v=${c.videoId}&lc=${c.id}`
      : null,
    context: null, // 影片標題要多打一次 API，留言本身已經看得懂，先不換那個配額
    answeredByOwner: c.answeredByOwner,
    replies: c.replies.map((r) => ({
      author: r.author,
      text: r.text,
      publishedAt: r.publishedAt,
      byOwner: r.byOwner,
    })),
  }));

  return base;
}

export type InboxSnapshot = {
  /** 各平台的狀態（綁了沒、抓到幾則、錯在哪） */
  sources: PlatformFetch[];
  /** 全部平台混在一起、依時間新到舊 */
  all: InboxComment[];
  /** 還沒回的（就是你真正要處理的那些） */
  waiting: InboxComment[];
  /** 有沒有任何一個平台綁定了 —— 都沒綁的話畫面要講「先去綁」而不是「沒有留言」 */
  anyBound: boolean;
};

/** 抓齊所有平台。任何一家失敗都不會讓整頁掛掉。 */
export async function loadInbox(): Promise<InboxSnapshot> {
  const settled = await Promise.allSettled([
    fetchYoutube(),
    fetchFacebookComments(),
    fetchInstagramComments(),
  ]);

  const order: InboxPlatform[] = ["youtube", "facebook", "instagram"];
  const sources: PlatformFetch[] = settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    // 連 fetch 函式本身都爆了（理論上不該發生，因為裡面都 try 過）。
    // 還是要接住 —— 一個平台的意外不該讓你連其他平台的留言都看不到。
    console.error(`[inbox] ${order[i]} 抓取整個失敗:`, r.reason);
    return {
      platform: order[i],
      bound: false,
      comments: [],
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      accountName: null,
    };
  });

  // 🔴 LINE 刻意**排在後面依序跑**，不併進上面那個 allSettled。
  //
  //    上面三家各自也要讀資料庫（拿權杖與綁定狀態），而這個專案的連線池
  //    只有 3 條（src/lib/db.ts）。再塞第四個併行的查詢就是自己跟自己搶，
  //    撞到 P2024 時**四個平台會一起變空**，畫面上跟「真的沒留言」長得一模一樣。
  //
  //    LINE 讀的是自家資料庫、很快，多等這一下換來的是不會整頁誤判。
  const lineResult = await fetchLineComments().catch((e) => {
    console.error("[inbox] LINE 抓取整個失敗:", e);
    return {
      platform: "line" as const,
      bound: false,
      comments: [],
      error: e instanceof Error ? e.message : String(e),
      accountName: null,
    };
  });
  sources.push(lineResult);

  const all = sortByNewest(sources.flatMap((s) => s.comments));

  return {
    sources,
    all,
    waiting: all.filter((c) => !c.answeredByOwner),
    anyBound: sources.some((s) => s.bound),
  };
}
