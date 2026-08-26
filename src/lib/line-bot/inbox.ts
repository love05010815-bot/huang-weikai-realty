/**
 * LINE → 留言收件匣的轉接層。
 *
 * 把 LINE 的一對一私訊轉成收件匣的共同形狀，跟 YouTube／FB／IG 混在同一份清單。
 *
 * 🔴 **一位客戶一列，不是一則訊息一列。**
 *    LINE 是對話不是留言板 —— 41 則訊息如果攤成 41 列，會把其他平台的留言整個淹掉，
 *    而且同一個人問的三句話會散在清單各處。所以每位客戶只取「他最後問的那一句」，
 *    要看完整對話點進 /admin/line。
 *
 * 🔴 **「已回」對 LINE 的意思跟其他平台不同。**
 *    其他三家可以從實際的回覆內容算出真相；LINE 不行 ——
 *    webhook **收不到系統擁有者從手機回出去的訊息**。所以這裡的 answeredByOwner 是
 *    「後台回過」或「被人手動標記過」，並且把 needsManualClear 打開讓畫面補一顆按鈕。
 */
import { db } from "@/lib/db";
import type { InboxComment, PlatformFetch } from "@/lib/inbox-types";
import { getLineBotToken } from "@/lib/line-bot/client";

type Row = {
  line_user_id: string;
  display_name: string | null;
  handled_at: Date | null;
  q_text: string | null;
  q_at: Date | null;
  q_type: string | null;
  q_media: string | null;
  a_text: string | null;
  a_at: Date | null;
  a_by: string | null;
};

export async function fetchLineComments(limit = 50): Promise<PlatformFetch> {
  const base: PlatformFetch = {
    platform: "line",
    bound: false,
    comments: [],
    error: null,
    accountName: null,
  };

  // 沒有金鑰 = 還沒接，跟「接了但抓失敗」是兩件事，畫面上講的話不一樣。
  if (!getLineBotToken()) return base;
  base.bound = true;

  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));

  try {
    // 刻意壓成**一句 SQL**：連線池只有 3 條，一個人一次查詢會把其他平台一起拖進
    // P2024 超時，畫面上看起來就像「所有平台都沒留言」。
    //
    // 每位客戶取兩樣東西：他最後問的那一句（role='user'）、我方最後回的那一句
    // （role='assistant'）。誰比較新決定這串算不算已回。
    const rows = await db.$queryRawUnsafe<Row[]>(
      `SELECT u.line_user_id, u.display_name, u.handled_at,
         (SELECT m.content    FROM line_bot_message m
           WHERE m.line_user_id = u.line_user_id AND m.role = 'user'
           ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS q_text,
         (SELECT m.created_at FROM line_bot_message m
           WHERE m.line_user_id = u.line_user_id AND m.role = 'user'
           ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS q_at,
         (SELECT m.msg_type   FROM line_bot_message m
           WHERE m.line_user_id = u.line_user_id AND m.role = 'user'
           ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS q_type,
         (SELECT m.media_id   FROM line_bot_message m
           WHERE m.line_user_id = u.line_user_id AND m.role = 'user'
           ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS q_media,
         (SELECT m.content    FROM line_bot_message m
           WHERE m.line_user_id = u.line_user_id AND m.role = 'assistant'
           ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS a_text,
         (SELECT m.created_at FROM line_bot_message m
           WHERE m.line_user_id = u.line_user_id AND m.role = 'assistant'
           ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS a_at,
         (SELECT m.sent_by    FROM line_bot_message m
           WHERE m.line_user_id = u.line_user_id AND m.role = 'assistant'
           ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS a_by
       FROM line_bot_user u
       ORDER BY q_at DESC
       LIMIT ${safeLimit}`,
    );

    const out: InboxComment[] = [];

    for (const r of rows) {
      // 只加過好友、從沒說過話的人不算留言，不要佔清單。
      if (!r.q_at || !r.q_text) continue;

      const qAt = new Date(r.q_at).getTime();
      const aAt = r.a_at ? new Date(r.a_at).getTime() : 0;
      const handledAt = r.handled_at ? new Date(r.handled_at).getTime() : 0;

      // 回在問之後 = 真的回過了；被手動標記過也算。
      const repliedAfter = aAt > qAt;
      const answered = repliedAfter || handledAt >= qAt;

      out.push({
        platform: "line",
        // 🔴 這裡放的是 **lineUserId 不是訊息 id** —— LINE 沒有「回某一則」這種事，
        //    回覆是推播給那個人。replyInboxCommentAction 收到 line 時就是這樣用的。
        id: r.line_user_id,
        author: r.display_name || "（未取得名稱）",
        authorImage: null,
        text: r.q_text,
        publishedAt: new Date(r.q_at).toISOString(),
        // LINE 沒有可以公開連過去的網址，改成連到後台的完整對話。
        permalink: null,
        context: null,
        answeredByOwner: answered,
        replies: repliedAfter && r.a_text
          ? [
              {
                author: r.a_by === "human" ? "你回的" : "機器人",
                text: r.a_text,
                publishedAt: new Date(r.a_at as Date).toISOString(),
                byOwner: r.a_by === "human",
              },
            ]
          : [],
        needsManualClear: true,
        // 只有真的抓得到內容的四種才給網址。貼圖與位置沒有內容可抓，
        // content 那句「［貼圖］」就是全部的資訊了。
        media:
          r.q_media &&
          (r.q_type === "image" || r.q_type === "video" || r.q_type === "audio" || r.q_type === "file")
            ? { kind: r.q_type, url: `/api/admin/line/media/${encodeURIComponent(r.q_media)}` }
            : null,
      });
    }

    base.comments = out;
    return base;
  } catch (e) {
    console.error("[inbox] 抓 LINE 私訊失敗:", e);
    base.error = e instanceof Error ? e.message : String(e);
    return base;
  }
}
