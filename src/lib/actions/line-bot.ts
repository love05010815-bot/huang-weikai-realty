"use server";
/**
 * LINE 客服機器人後台的動作 —— 目前只有「接手／放回給機器人」。
 *
 * 跟精選好案那幾個 action 一樣：先擋權限再做事。
 * server action 可以被直接 POST，「畫面上沒有按鈕」不等於「外面的人叫不到」。
 */
import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { setMuted } from "@/lib/line-bot/store";

type Result = { ok: boolean; error?: string };

/**
 * 接手（muted=true）＝機器人對這個客戶閉嘴，之後由你本人在 LINE 回。
 * 放回（muted=false）＝機器人恢復自動回覆。
 *
 * 注意：接手後客戶的訊息「還是會被記錄下來」，只是機器人不回。
 * 所以你在這一頁仍然看得到他後來說了什麼。
 */
export async function toggleBotMuted(formData: FormData): Promise<void> {
  if (!(await isCurrentUserAdmin())) return;

  const lineUserId = String(formData.get("lineUserId") || "");
  const next = String(formData.get("next") || "") === "1";
  if (!lineUserId) return;

  await setMuted(lineUserId, next);
  revalidatePath("/admin/line");
}

/** 給未來可能的程式化呼叫留的版本（回傳結果而不是靜默 return）。 */
export async function setBotMuted(lineUserId: string, muted: boolean): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "沒有權限" };
  if (!lineUserId) return { ok: false, error: "缺少 lineUserId" };

  try {
    await setMuted(lineUserId, muted);
    revalidatePath("/admin/line");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
