"use server";
/**
 * YouTube 留言收件匣的動作：回留言、解除綁定。
 *
 * 跟其他 action 一樣先擋權限再做事 —— server action 可以被直接 POST，
 * 「畫面上沒有按鈕」不等於「外面的人叫不到」。
 */
import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { replyToComment, unbindYoutube } from "@/lib/youtube";

type Result = { ok: boolean; error?: string };

/** YouTube 單則留言上限 10000 字，但實務上回這麼長沒意義，切在 4000 就好。 */
const MAX_REPLY = 4000;

/**
 * 回覆一則 YouTube 留言。
 *
 * ⚠️ 這是**公開**的回覆 —— 全世界都看得到，跟 LINE 的一對一私訊不同。
 *    所以送出前畫面上會再提醒一次，這裡不做二次確認（確認在 UI）。
 */
export async function replyYoutubeCommentAction(
  parentId: string,
  text: string,
): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "沒有權限" };
  if (!parentId) return { ok: false, error: "缺少留言 id" };

  const message = text.trim();
  if (!message) return { ok: false, error: "回覆是空的" };
  if (message.length > MAX_REPLY) {
    return { ok: false, error: `太長了（上限 ${MAX_REPLY} 字）` };
  }

  const r = await replyToComment(parentId, message);
  if (!r.ok) return r;

  // 回覆完重讀一次 —— 收件匣的「已回覆」是從 YouTube 實際的回覆算出來的，
  // 不重讀的話你會看到自己剛回的那則還標著「待回覆」。
  revalidatePath("/admin/inbox");
  return { ok: true };
}

/** 解除 YouTube 綁定。只刪 youtube_* 三個 key，不碰日曆的授權。 */
export async function unbindYoutubeAction(): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "沒有權限" };
  try {
    await unbindYoutube();
    revalidatePath("/admin/inbox");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
