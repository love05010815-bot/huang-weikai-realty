"use server";
/**
 * 收件匣的統一回覆入口 —— 一個 action 按平台分派。
 *
 * 為什麼不是三個 action：回覆框只該知道「回這則留言」，不該知道自己在跟
 * YouTube 還是 Meta 講話。哪天多接一個平台，畫面一行都不用改。
 *
 * 🚨 先擋權限再做事。server action 可以被直接 POST，
 *    「畫面上沒有按鈕」不等於「外面的人叫不到」。
 */
import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import type { InboxPlatform } from "@/lib/inbox-types";
import { replyMetaComment, unbindMeta } from "@/lib/meta";
import { sendLineReplyAction } from "@/lib/actions/line-bot";
import { replyToComment as replyYoutube } from "@/lib/youtube";

type Result = { ok: boolean; error?: string };

const MAX_REPLY = 4000;

/**
 * 回覆一則留言。
 *
 * ⚠️ YouTube／FB／IG 的回覆**都是公開的**；**LINE 是一對一私訊**，
 *    而且走推播、會吃每月免費訊息額度。畫面上兩者的說明不一樣，
 *    這裡不再做二次確認。
 */
export async function replyInboxCommentAction(
  platform: InboxPlatform,
  commentId: string,
  text: string,
): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "沒有權限" };
  if (!commentId) return { ok: false, error: "缺少留言 id" };

  const message = text.trim();
  if (!message) return { ok: false, error: "回覆是空的" };
  if (message.length > MAX_REPLY) return { ok: false, error: `太長了（上限 ${MAX_REPLY} 字）` };

  let r: Result;
  switch (platform) {
    case "youtube":
      r = await replyYoutube(commentId, message);
      break;
    case "facebook":
    case "instagram":
      r = await replyMetaComment(commentId, message);
      break;
    case "line":
      // ⚠️ LINE 的 commentId 放的是 **lineUserId**（見 line-bot/inbox.ts）——
      //    LINE 沒有「回某一則訊息」這種事，回覆是推播給那個人。
      //    sendLineReplyAction 內部會：送出成功才寫記錄、自動接手、標記已回。
      r = await sendLineReplyAction(commentId, message);
      break;
    default:
      // 型別上到不了，但真的到了要講清楚而不是靜靜成功
      return { ok: false, error: `不認得的平台：${platform}` };
  }

  if (!r.ok) return r;

  // 「已回覆」是從各平台實際的回覆算出來的，不重讀的話你會看到
  // 自己剛回的那則還標著「待回覆」。
  revalidatePath("/admin/inbox");
  return { ok: true };
}

/** 解除 Meta（FB＋IG）綁定。只刪 meta_* 五個 key，不碰 YouTube 與日曆。 */
export async function unbindMetaAction(): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "沒有權限" };
  try {
    await unbindMeta();
    revalidatePath("/admin/inbox");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
