/**
 * /api/threads/delete —— Meta 的「刪除資料回呼」
 *
 * POST：他在脆那邊要求刪除資料時 Meta 會打這一支。照規定要①真的刪、②回一個
 *       「查得到進度」的網址與確認碼。我們存的東西只有 token 與帳號名稱，
 *       當下就刪乾淨了，所以那個網址一律顯示「已完成」。
 * GET ：上面回的那個查詢網址。給人看的，不帶任何帳號資訊。
 *
 * 🔴 **這支沒有登入牆**（來敲的是 Meta 的伺服器），`signed_request` 的簽章就是唯一的門。
 * ⚠️ 這個網址也是 Meta 那一頁的**必填欄位**，沒填「重新導向回呼網址」那一頁存不起來。
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { forgetThreadsUser, verifyThreadsSignedRequest } from "@/lib/threads";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.APPOINTMENT_BASE_URL || "https://weikaihouse.com";

export async function POST(req: NextRequest) {
  let signed = "";
  try {
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
    console.error("[threads] 刪除資料回呼驗簽失敗:", v.error);
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
  }

  const r = await forgetThreadsUser(v.userId);
  // 確認碼只是給人對照用的字串，不代表任何權限，所以隨機產生就好
  const code = randomBytes(8).toString("hex");
  console.log("[threads] 刪除資料回呼:", r.cleared ? "已清掉綁定" : `沒有動作（${r.reason}）`, code);

  // Meta 規定要回這兩個欄位：一個查進度的網址，一個確認碼
  return NextResponse.json({
    url: `${BASE_URL}/api/threads/delete?code=${code}`,
    confirmation_code: code,
  });
}

/** 上面那個查詢網址。純說明頁，不查也不顯示任何帳號資料。 */
export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get("code") || "").replace(/[^a-f0-9]/gi, "").slice(0, 32);
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Threads 資料刪除狀態</title>
<style>body{font-family:system-ui,"Noto Sans TC",sans-serif;max-width:640px;margin:48px auto;padding:0 20px;line-height:1.9;color:#22323f}
code{background:#f1f5f9;padding:2px 6px;border-radius:4px}</style></head><body>
<h1>資料已刪除</h1>
<p>這個網站因為串接 Threads 留言而保存的資料（授權權杖與帳號名稱）已經刪除完成，沒有保留副本。</p>
${code ? `<p>確認碼：<code>${code}</code></p>` : ""}
<p>有問題請聯絡 <a href="https://weikaihouse.com">weikaihouse.com</a>。</p>
</body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
