"use server";
/**
 * LINE 客服機器人後台的動作 —— 目前只有「接手／放回給機器人」。
 *
 * 跟精選好案那幾個 action 一樣：先擋權限再做事。
 * server action 可以被直接 POST，「畫面上沒有按鈕」不等於「外面的人叫不到」。
 */
import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { getLineBotToken, pushMessage } from "@/lib/line-bot/client";
import { markHandled, saveMessage, setMuted } from "@/lib/line-bot/store";

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

/**
 * 從後台直接回訊息給客戶。
 *
 * 幾個刻意的設計：
 *
 * 🔴 **送出成功才寫進對話記錄。** 先寫再送的話，LINE 那邊失敗你會看到一則
 *    「你已經回過了」的假紀錄，然後就不會再回一次 —— 客戶等到天荒地老。
 *
 * 🔴 **送出後自動接手這位客戶**（muted=true）。不然哪天機器人開回來，
 *    它會跳進你正在親自處理的對話裡插話。要放回去按畫面上的按鈕，一鍵。
 *
 * ⚠️ 這裡只能用 push（吃免費額度），不能用 reply —— replyToken 約 1 分鐘就過期，
 *    你在後台看到訊息時早就沒了。額度看 getMessageQuota()。
 */
export async function sendLineReplyAction(lineUserId: string, text: string): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "沒有權限" };
  if (!lineUserId) return { ok: false, error: "缺少 lineUserId" };

  const message = text.trim();
  if (!message) return { ok: false, error: "訊息是空的" };
  if (message.length > 4800) return { ok: false, error: "訊息太長了（上限 4800 字），分兩則送" };

  // 沒 token 就明講。不然 pushMessage 會靜默回 false，你只會看到「送出失敗」不知道為什麼。
  if (!getLineBotToken()) {
    return { ok: false, error: "沒有設定 LINE_BOT_ACCESS_TOKEN，送不出去" };
  }

  const sent = await pushMessage(lineUserId, message);
  if (!sent) {
    return {
      ok: false,
      error: "LINE 那邊沒收下（多半是免費訊息額度用完了，或 token 失效）。訊息沒有送出，也沒有記錄。",
    };
  }

  try {
    await saveMessage(lineUserId, "assistant", message, "human");
    await setMuted(lineUserId, true);
    // 從後台回了就等於處理完，順手把收件匣的待回標記清掉。
    // 不清的話你會回完還看到紅點，然後就學會無視它。
    await markHandled(lineUserId, true);
  } catch (e) {
    // 訊息「已經送到客戶手上了」，這裡失敗只是記錄沒寫成功。
    // 絕對不能回 ok:false —— 那會讓你以為沒送出去而再送一次，客戶收到兩則一樣的。
    console.error("[line-bot] 訊息已送出但記錄失敗:", e);
    revalidatePath("/admin/line");
    return { ok: true, error: "訊息已送出，但對話記錄沒寫進去（重新整理可能看不到這則）" };
  }

  revalidatePath("/admin/line");
  revalidatePath("/admin/inbox");
  return { ok: true };
}

/**
 * 「標記已回」／「標回未回」—— 給在手機 LINE App 回過的情況用。
 *
 * 存在的理由：LINE 的 webhook 只收得到**客戶傳進來**的訊息，系統擁有者在手機上
 * 回的完全看不到。所以「待回」的數字一定會偏高，必須給人一個手動清掉的方法，
 * 否則那個數字很快就沒人信、變成純裝飾。
 *
 * 清掉之後客戶再傳新訊息會自動重新亮起來（比對 handled_at 與最後一則的時間）。
 */
export async function markLineHandledAction(formData: FormData): Promise<void> {
  if (!(await isCurrentUserAdmin())) return;

  const lineUserId = String(formData.get("lineUserId") || "");
  const next = String(formData.get("next") || "") === "1";
  if (!lineUserId) return;

  await markHandled(lineUserId, next);
  revalidatePath("/admin/line");
  revalidatePath("/admin/inbox");
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
