/**
 * /admin/inbox/videos —— 影片觀看數排行（留言收件匣的第二個分頁）
 *
 * 2026-11-19 系統擁有者：「串接五平台的影片瀏覽人次，想知道哪部影片最多人看，
 * 可以跟後台的留言收件夾做在一起」。
 *
 * 做法：
 *   ・五個平台各自抓影片與觀看數（lib/video-stats.ts），每次進來即時抓、不存資料庫。
 *   ・「全部」分頁把同一支影片在各平台的那幾筆併成一列、觀看數加總再排名
 *     （靠標題開頭＋發佈日相近認同一支，規則在 lib/video-stats-types.ts 的 groupVideos）。
 *   ・點平台分頁就是那個平台自己的排行，不併。
 *   ・?d=30／90 只看最近幾天發的；不帶就是抓得到的全部。
 *
 * 🔴 拿不到觀看數的平台（缺權限）顯示「—」，不是 0，也不算進加總 —— 畫面上會講清楚少了哪幾家。
 * 🔴 各平台「觀看」定義不同，加總只當「哪支比較紅」的參考（頁尾有寫）。
 */
import { redirect } from "next/navigation";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { adminEmails } from "@/auth";
import AdminGateNotice from "@/app/admin/appointments/AdminGateNotice";
import { loadVideoStats } from "@/lib/video-stats";
import { VIDEO_PLATFORMS, type VideoPlatform } from "@/lib/video-stats-types";
import VideosBoard from "./VideosBoard";

export const dynamic = "force-dynamic";
/** 沒快取的那一次要抓十幾次平台 API（Facebook 最慢，約 9 秒），給足時間 */
export const maxDuration = 60;

export default async function InboxVideosPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; d?: string }>;
}) {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    return <AdminGateNotice kind="no_provider" />;
  }
  if (adminEmails().length === 0) return <AdminGateNotice kind="no_whitelist" />;
  const { email } = await getAdminCheckArgs();
  if (!email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/admin/inbox/videos")}`);
  if (!(await isCurrentUserAdmin())) return <AdminGateNotice kind="not_allowed" email={email} />;

  const sp = await searchParams;
  const platform = (VIDEO_PLATFORMS as readonly string[]).includes(sp.p || "") ? (sp.p as VideoPlatform) : null;
  const days = sp.d === "30" ? 30 : sp.d === "90" ? 90 : null;

  // 畫面在 VideosBoard.tsx（純畫面，吃這包 snapshot）
  return <VideosBoard snapshot={await loadVideoStats()} platform={platform} days={days} />;
}
