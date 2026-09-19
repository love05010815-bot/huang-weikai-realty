/**
 * POST /api/threads/deauthorize —— Meta 的「解除安裝（解除授權）回呼」
 *
 * 他在脆那邊把這個 App 的授權移除時，Meta 會打這一支。收到就把存著的 token 清掉，
 * 免得後台一直顯示「已綁定」、卻每次抓留言都失敗。
 *
 * 🔴 **這支沒有登入牆**（來敲的是 Meta 的伺服器，不是人），
 *    `signed_request` 的簽章就是唯一的門，驗不過一律 403。
 * 🚨 回應一律不要帶任何跟帳號有關的內容 —— 這個網址填在 Meta 後台，等於是公開的。
 *
 * ⚠️ 這個網址也是 Meta 那一頁的**必填欄位**，沒填「重新導向回呼網址」那一頁存不起來。
 */
import { NextRequest, NextResponse } from "next/server";
import { forgetThreadsUser, verifyThreadsSignedRequest } from "@/lib/threads";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let signed = "";
  try {
    // Meta 送的是 form-urlencoded；保險起見也接 JSON（他們偶爾會改）
    const type = req.headers.get("content-type") || "";
    if (type.includes("application/json")) {
      signed = String(((await req.json()) as { signed_request?: string }).signed_request || "");
    } else {
      signed = String((await req.formData()).get("signed_request") || "");
    }
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const v = verifyThreadsSignedRequest(signed);
  if (!v.ok) {
    console.error("[threads] 解除授權回呼驗簽失敗:", v.error);
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
  }

  const r = await forgetThreadsUser(v.userId);
  console.log("[threads] 解除授權回呼:", r.cleared ? "已清掉綁定" : `沒有動作（${r.reason}）`);
  return NextResponse.json({ ok: true });
}
