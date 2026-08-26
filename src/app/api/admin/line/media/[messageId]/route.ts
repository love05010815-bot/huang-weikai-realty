/**
 * 把客戶用 LINE 傳來的照片／影片／檔案，代理回後台顯示。
 *
 * 為什麼是「代理」而不是「下載存起來」：
 *
 *   🔒 **隱私。** 客戶傳來的東西可能是身分證、權狀、對帳單。存進 Vercel Blob 會拿到
 *      一個**公開網址**（雖然猜不到，但不需登入就能開）。代理的話每一次讀取都要
 *      先過 isCurrentUserAdmin()，沒登入拿不到任何東西。
 *
 *   💰 **額度。** Blob 是全站共用的，精選好案的照片跟影片都在同一個 store。
 *      客戶傳圖是**不受控的輸入**（任何人都能連傳 50 張），Hobby 方案超量會讓
 *      整個 Blob 停用 30 天 —— 那會連官網的物件照片一起消失。
 *
 * ⚠️ **代價：LINE 只保留內容一段時間**（官方文件沒寫明多久），過期就抓不到了。
 *    所以這裡會把 404／410 翻成看得懂的話，而不是丟一張破圖給你猜。
 *    真的需要永久保存，那要另外決定存哪裡，並且先想清楚上面那兩件事。
 */
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { getLineBotToken } from "@/lib/line-bot/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_API = "https://api-data.line.me/v2/bot/message";

/** 只讓數字通過。messageId 會被接進網址，擋掉 ../ 之類的花樣。 */
const ID_OK = /^[0-9]{1,32}$/;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  // 🚨 先擋權限再做事。這支會吐出客戶的私人照片，沒有比這更該擋的。
  if (!(await isCurrentUserAdmin())) {
    return new Response("forbidden", { status: 403 });
  }

  const { messageId } = await params;
  if (!ID_OK.test(messageId)) {
    return new Response("bad id", { status: 400 });
  }

  const token = getLineBotToken();
  if (!token) {
    return new Response("LINE 沒有設定存取權杖", { status: 503 });
  }

  let res: Response;
  try {
    res = await fetch(`${CONTENT_API}/${messageId}/content`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch (e) {
    console.error("[line-media] 連不上 LINE:", e);
    return new Response("連不上 LINE", { status: 502 });
  }

  if (!res.ok || !res.body) {
    // 404／410 = LINE 已經把內容刪掉了。這是預期內的結果，不是壞掉，
    // 所以用 410 Gone 回，畫面那邊才分得出「過期」與「真的出錯」。
    if (res.status === 404 || res.status === 410) {
      return new Response("LINE 已不再保留這則訊息的內容", { status: 410 });
    }

    // ⚠️ 一定要把 LINE 的回應**原文**印出來。只記狀態碼的話，401 可能是
    //    「權杖無效」「權杖過期」「這個 channel 沒開這項功能」—— 三種修法完全不同，
    //    光看數字只能亂猜。LINE 的錯誤訊息本身寫得很清楚，不要把它丟掉。
    const body = await res.text().catch(() => "");
    console.error(`[line-media] LINE 回 ${res.status}：${body.slice(0, 300)}`);
    return new Response(`LINE 回 ${res.status}`, {
      status: 502,
      // 這支路由已經擋過權限，把原因帶回畫面（只有登入的你看得到）
      headers: { "X-Line-Error": encodeURIComponent(body.slice(0, 200)) },
    });
  }

  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("content-type") || "application/octet-stream",
      // private：可以在瀏覽器快取（同一張圖不用一直跟 LINE 要），
      // 但**不准 CDN 或任何中間層存**——這是客戶的私人內容。
      "Cache-Control": "private, max-age=3600",
      // 這是客戶傳來的檔案，不是我們產的內容，一律不准當成 HTML 執行
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
