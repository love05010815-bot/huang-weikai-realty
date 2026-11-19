/**
 * 📊 影片觀看數的共同語言 —— 五個平台的影片統一成同一個形狀，才能排在一起比。
 *
 * 2026-11-19 系統擁有者：「串接五平台的影片瀏覽人次，想知道哪部影片最多人看，
 * 可以跟後台的留言收件夾做在一起」。畫面在 /admin/inbox/videos，抓取在 lib/video-stats.ts。
 *
 * 這支檔案刻意不 import 任何東西（跟 inbox-types.ts 一樣）：純型別＋純函式，
 * `npm run check:video-stats` 可以不連網路、不連資料庫直接驗。
 *
 * 🔴 各平台「觀看」的定義不一樣（YouTube 一般影片要看一段時間才算、Shorts 與 Reels 幾乎一滑到就算），
 *    加總只能當「大概哪支比較紅」，不能拿去對外宣稱「共 N 人看過」。畫面上有寫。
 */

export type VideoPlatform = "youtube" | "facebook" | "instagram" | "threads" | "tiktok";

export const VIDEO_PLATFORMS: readonly VideoPlatform[] = ["youtube", "facebook", "instagram", "threads", "tiktok"];

export const VIDEO_PLATFORM_LABEL: Record<VideoPlatform, string> = {
  youtube: "YouTube",
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  tiktok: "TikTok",
};

export type VideoStat = {
  platform: VideoPlatform;
  id: string;
  /** 影片標題或貼文內文（原文，可能很長、可能有換行） */
  title: string;
  /** ISO 字串 */
  publishedAt: string;
  permalink: string | null;
  /** null = 這個平台目前拿不到觀看數（缺權限），不是 0。畫面上要顯示「—」不是 0 */
  views: number | null;
  likes: number | null;
  comments: number | null;
};

/** 某個平台的抓取結果。失敗要講原因，不能靜靜回空陣列裝作沒影片。 */
export type PlatformVideoFetch = {
  platform: VideoPlatform;
  /** 沒綁定 = 還沒接，跟「接了但抓失敗」要分開 */
  bound: boolean;
  accountName: string | null;
  videos: VideoStat[];
  error: string | null;
  /** 影片抓到了、但觀看數拿不到的原因（通常是少一個權限）。有值時 videos 的 views 都是 null */
  viewsMissing: string | null;
};

/**
 * 同一支影片在各平台的標題／內文開頭 → 拿來比對的鍵。
 *
 * 他的發片習慣是同一支影片同一天丟五個平台，開頭那句一樣、後面各平台不同
 * （YouTube 標題後面接 #標籤，FB／IG 後面接內文）。所以只取「第一行、第一個 # 之前」，
 * 拿掉表情符號、標點、空白，留前 10 個字。
 *   「⚠️ 毒駕新制上路這3種人注意！ #毒駕」      → 毒駕新制上路這3種人
 *   「⚠️ 毒駕新制上路這3種人注意！\n🚨重大消息…」→ 毒駕新制上路這3種人
 *
 * 不到 4 個字回 null（太短會把不相干的影片併在一起，寧可不併）。
 *
 * 他早期的影片整句都是 #標籤（「#沙鹿大樓價買翻修美透天」「#清水 #微風一品3 #買房賣房」），
 * # 之前是空的。這種退一步用「整行拿掉 #」當鍵，但要 6 個字以上才算 ——
 * 「#房仲 #台中」這種通用標籤湊出來的四個字會把不相干的影片併在一起。
 * （實測 2026-11-19：674 支裡有 105 支是這種，不處理的話全部各自一列。）
 */
export function titleKey(title: string): string | null {
  const firstLine = (title || "").split(/\r?\n/).find((l) => l.trim()) || "";
  const letters = (text: string) =>
    Array.from(text)
      .filter((ch) => /[\p{L}\p{N}]/u.test(ch))
      .join("")
      .toLowerCase();
  const core = letters(firstLine.split("#")[0]);
  if (core.length >= 4) return core.slice(0, 10);
  const whole = letters(firstLine);
  return whole.length >= 6 ? whole.slice(0, 10) : null;
}

/** 顯示用的短標題：第一行、# 之前 */
export function displayTitle(title: string, max = 40): string {
  const firstLine = (title || "").split(/\r?\n/).find((l) => l.trim()) || "";
  const t = firstLine.split("#")[0].replace(/\s+/g, " ").trim() || firstLine.trim() || "（沒有標題）";
  const chars = Array.from(t);
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : t;
}

export type VideoGroup = {
  key: string;
  title: string;
  /** 這一組裡最早的發佈時間 */
  publishedAt: string;
  /** 各平台觀看數加總（拿不到的平台不算進來） */
  totalViews: number;
  /** 有幾個平台拿得到觀看數 */
  countedPlatforms: number;
  items: VideoStat[];
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * 把各平台的影片併成「同一支影片一組」。
 *
 * 併的條件三個都要成立：標題鍵一樣、發佈時間差在 windowDays 天內、那一組還沒有同平台的影片。
 * 第三條是為了「同一句開頭隔天又發一支」的情況 —— 同平台出現兩次就當成兩支，不硬併。
 * 標題鍵是 null 的自己一組。
 */
export function groupVideos(videos: VideoStat[], windowDays = 3): VideoGroup[] {
  const sorted = [...videos].sort(
    (a, b) => (Date.parse(a.publishedAt) || 0) - (Date.parse(b.publishedAt) || 0),
  );
  const groups: VideoGroup[] = [];
  const byKey = new Map<string, VideoGroup[]>();

  for (const v of sorted) {
    const key = titleKey(v.title);
    const t = Date.parse(v.publishedAt) || 0;
    let target: VideoGroup | undefined;
    if (key) {
      target = (byKey.get(key) || []).find(
        (g) =>
          Math.abs(t - (Date.parse(g.publishedAt) || 0)) <= windowDays * DAY &&
          !g.items.some((it) => it.platform === v.platform),
      );
    }
    if (!target) {
      target = {
        key: key ?? `${v.platform}:${v.id}`,
        title: displayTitle(v.title),
        publishedAt: v.publishedAt,
        totalViews: 0,
        countedPlatforms: 0,
        items: [],
      };
      groups.push(target);
      if (key) byKey.set(key, [...(byKey.get(key) || []), target]);
    }
    target.items.push(v);
    if (v.views !== null) {
      target.totalViews += v.views;
      target.countedPlatforms += 1;
    }
  }

  return groups.sort(
    (a, b) => b.totalViews - a.totalViews || (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0),
  );
}

/** 只留最近 N 天發佈的。days 是 null 就不濾 */
export function withinDays(videos: VideoStat[], days: number | null, now = Date.now()): VideoStat[] {
  if (!days) return videos;
  return videos.filter((v) => now - (Date.parse(v.publishedAt) || 0) <= days * DAY);
}
