/**
 * 「這個客戶要找你本人」的即時通知
 *
 * 只在客戶**明確要求真人**時送（說了「找真人」「客訴」「投訴」「律師」這類字眼）。
 * 刻意不在「AI 答不出來」時送 —— 那多半是系統問題（沒金鑰、被限流），
 * 每次都寄信只會變成沒人看的雜訊，真正的急事反而被淹掉。
 *
 * 兩條管道都試，各自獨立失敗：
 *   - Email：Brevo 已接好且驗證過，設定完成就會真的寄到你信箱
 *   - LINE admin 群：要另外設 ABIN_LINE_* 那組才會送，沒設會自己跳過不報錯
 */
import { OWNER, SITE_URL } from "@/config/owner";
import { escapeHtml, sendMail } from "@/lib/mail";
import { notifyAbinAdminGroup } from "@/lib/line-notify";

function adminEmail(): string {
  return process.env.APPOINTMENT_ADMIN_EMAIL || OWNER.email;
}

/** 訊息太長就切短 —— 通知是要你「知道有事」，全文到後台看。 */
function clip(text: string, max = 300): string {
  const flat = text.trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * 客戶要找真人 → 通知本人。
 * 失敗不 throw：通知沒送出去，也絕不能影響客戶已經收到的那則回覆。
 */
export async function notifyHandoffRequest(params: {
  displayName: string | null;
  lineUserId: string;
  message: string;
}): Promise<void> {
  const name = params.displayName || "（未取得名稱）";
  const msg = clip(params.message);
  const backlink = `${SITE_URL}/admin/line?u=${encodeURIComponent(params.lineUserId)}`;

  // ── LINE admin 群（沒設 ABIN_LINE_* 就會自己跳過）
  try {
    await notifyAbinAdminGroup(
      `🙋 LINE 客戶要找你本人\n\n客戶：${name}\n訊息：${msg}\n\n後台：${backlink}`,
    );
  } catch (e) {
    console.error("[line-bot] handoff 推 LINE 群失敗:", e);
  }

  // ── Email
  try {
    await sendMail({
      to: adminEmail(),
      subject: `🙋 LINE 客戶要找你本人｜${name}`,
      fromName: `${OWNER.alias}的 LINE 助理`,
      text:
        `客戶 ${name} 在 LINE 上要求由你本人回覆。\n\n` +
        `他說：${msg}\n\n` +
        `機器人已經回他「馬上請瑋凱聯繫您」並附上電話 ${OWNER.phone}。\n` +
        `到後台看完整對話：${backlink}\n`,
      html: `
        <div style="font-family:'Noto Sans TC',-apple-system,sans-serif;max-width:520px;line-height:1.8;color:#1f2937">
          <h2 style="margin:0 0 4px;font-size:19px">🙋 有客戶要找你本人</h2>
          <p style="margin:0 0 16px;color:#6b7280;font-size:14px">
            這則不是一般詢問 —— 客戶明確要求真人，建議優先處理。
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:14.5px">
            <tr>
              <td style="padding:8px 0;color:#6b7280;width:70px;vertical-align:top">客戶</td>
              <td style="padding:8px 0;font-weight:700">${escapeHtml(name)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#6b7280;vertical-align:top">他說</td>
              <td style="padding:8px 0;white-space:pre-wrap">${escapeHtml(msg)}</td>
            </tr>
          </table>
          <p style="margin:14px 0 18px;padding:10px 14px;background:#f3f4f6;border-radius:8px;font-size:13.5px;color:#4b5563">
            機器人已回覆他「馬上請${escapeHtml(OWNER.alias)}聯繫您」，並給了電話 ${escapeHtml(OWNER.phone)}。
          </p>
          <a href="${backlink}"
             style="display:inline-block;padding:11px 22px;background:#E00000;color:#fff;
                    border-radius:9px;text-decoration:none;font-weight:700;font-size:14.5px">
            看完整對話
          </a>
        </div>
      `,
    });
  } catch (e) {
    console.error("[line-bot] handoff 寄信失敗:", e);
  }
}
