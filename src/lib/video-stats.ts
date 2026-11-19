/**
 * 📊 影片觀看數的匯總層 —— 把五個平台的影片抓回來、轉成同一個形狀。
 *
 * 2026-11-19 系統擁有者：「串接五平台的影片瀏覽人次，想知道哪部影片最多人看，
 * 可以跟後台的留言收件夾做在一起」。畫面在 /admin/inbox/videos。
 *
 * 跟 lib/inbox.ts 同一套規矩：
 *   ・一個平台掛掉不能拖垮其他平台（allSettled＋每家自己 try）
 *   ・YouTube／FB／IG 併行、Threads 排在後面依序跑 —— 連線池只有 3 條，
 *     四家一起讀權杖會撞 P2024，撞到時所有平台一起變空、跟「真的沒影片」長得一樣。
 *   ・不存資料庫，但整包結果放 Next Data Cache 30 分鐘（見 loadVideoStats）——
 *     2026-11-19 實測光 Facebook 244 支影片就要 8.5 秒，每次進頁面都重抓太慢。
 *
 * TikTok 還沒接（見 TIKTOK_NOTE）。五個平台的列都會出現在畫面上，沒接的講清楚為什麼。
 */
import { unstable_cache } from "next/cache";
import { fetchFacebookVideoStats, fetchInstagramVideoStats } from "@/lib/meta";
import { fetchThreadsVideoStats } from "@/lib/threads";
import { fetchYoutubeVideoStats } from "@/lib/youtube";
import type { PlatformVideoFetch, VideoPlatform, VideoStat } from "@/lib/video-stats-types";

/**
 * TikTok 為什麼還沒有數字。
 * 官方只有一條路：到 developers.tiktok.com 註冊開發者、建一個 App、用 Login Kit 授權自己的帳號，
 * 才能用 Display API 讀自己影片的 view_count。網頁不准自動抓（robots.txt 對 AI 是 Disallow，
 * 見 learning_short_video_source_limits），oEmbed 也不給觀看數。
 */
export const TIKTOK_NOTE =
  "TikTok 還沒接。它只開放一條官方路：到 developers.tiktok.com 用你的 TikTok 帳號註冊開發者、建一個 App，授權後才讀得到自己影片的觀看數。這一步要你本人的帳號去申請，申請好跟我說，我再接上來。";

function empty(platform: VideoPlatform, error: string | null): PlatformVideoFetch {
  return { platform, bound: false, accountName: null, videos: [], error, viewsMissing: null };
}

export type VideoStatsSnapshot = {
  /** 五個平台各一筆，順序固定：YouTube、Facebook、Instagram、Threads、TikTok */
  sources: PlatformVideoFetch[];
  /** 全部平台的影片攤平 */
  all: VideoStat[];
  /** 這包數字是什麼時候抓的（ISO）。畫面上要印出來 —— 快取最多 30 分鐘 */
  fetchedAt: string;
};

/** 「重新抓」那顆按鈕 revalidateTag 用的標籤（lib/actions/video-stats.ts） */
export const VIDEO_STATS_TAG = "video-stats";

/** 有平台抓失敗的那一包：照樣給畫面用，但不准進快取 */
class NotCacheable extends Error {
  constructor(readonly snapshot: VideoStatsSnapshot) {
    super("video-stats: 有平台抓取失敗，這一包不進快取");
  }
}

const cachedSnapshot = unstable_cache(
  async () => {
    const snap = await fetchAll();
    // 🔴 只存「每一家都沒出錯」的。把失敗的結果存 30 分鐘 = 平台已經恢復了畫面還在報錯。
    //    unstable_cache 不會存丟出去的錯誤，所以用 throw 把這一包帶出去（見 learning_fetch_no_store_kills_isr）。
    //    「缺權限拿不到觀看數」（viewsMissing）不算失敗 —— 那要他去補權限，重抓也不會好。
    if (snap.sources.some((s) => s.error)) throw new NotCacheable(snap);
    return snap;
  },
  ["video-stats-v1"],
  { revalidate: 1800, tags: [VIDEO_STATS_TAG] },
);

/** 五個平台的影片與觀看數。成功的結果快取 30 分鐘；有平台失敗就每次重抓。 */
export async function loadVideoStats(): Promise<VideoStatsSnapshot> {
  try {
    return await cachedSnapshot();
  } catch (e) {
    if (e instanceof NotCacheable) return e.snapshot;
    throw e;
  }
}

async function fetchAll(): Promise<VideoStatsSnapshot> {
  const first = ["youtube", "facebook", "instagram"] as const;
  const settled = await Promise.allSettled([
    fetchYoutubeVideoStats(),
    fetchFacebookVideoStats(),
    fetchInstagramVideoStats(),
  ]);
  const sources: PlatformVideoFetch[] = settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    console.error(`[video-stats] ${first[i]} 抓取整個失敗:`, r.reason);
    return empty(first[i], r.reason instanceof Error ? r.reason.message : String(r.reason));
  });

  try {
    sources.push(await fetchThreadsVideoStats());
  } catch (e) {
    console.error("[video-stats] threads 抓取整個失敗:", e);
    sources.push(empty("threads", e instanceof Error ? e.message : String(e)));
  }

  sources.push(empty("tiktok", null));

  return { sources, all: sources.flatMap((s) => s.videos), fetchedAt: new Date().toISOString() };
}
