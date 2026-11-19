"use server";
/**
 * 影片觀看數（/admin/inbox/videos）的動作：丟掉 30 分鐘快取、重新向各平台抓。
 * 跟其他 action 一樣先擋權限 —— server action 可以被直接 POST。
 */
import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { VIDEO_STATS_TAG } from "@/lib/video-stats";

export async function refreshVideoStatsAction(): Promise<void> {
  if (!(await isCurrentUserAdmin())) return;
  // 第二個參數照這個專案既有的寫法（api/lvr/daily：revalidateTag("lvr", "max")）
  revalidateTag(VIDEO_STATS_TAG, "max");
  redirect("/admin/inbox/videos");
}
