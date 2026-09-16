/**
 * 我是誰 —— /match?k=<識別碼> 進來時，把這個買方上次留的條件帶回表單
 *
 * 識別碼是官方帳號發給他本人的連結裡帶的（見 lib/match/token.ts），簽章過、會過期。
 * 驗不過就回 404，不透露任何東西；驗過才回他自己的資料。
 *
 * 回的東西只有他自己填過的（條件、姓名、電話）—— 不回 LINE userId、不回別人的任何資料。
 */
import { NextRequest, NextResponse } from "next/server";
import { getBuyer } from "@/lib/match/store";
import { verifyBuyerToken } from "@/lib/match/token";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const buyerId = verifyBuyerToken(req.nextUrl.searchParams.get("k"));
  if (!buyerId) return NextResponse.json({ error: "連結已失效，請重新從官方帳號進入" }, { status: 404 });

  try {
    const buyer = await getBuyer(buyerId);
    if (!buyer) return NextResponse.json({ error: "連結已失效，請重新從官方帳號進入" }, { status: 404 });
    return NextResponse.json({
      buyerId: buyer.id,
      preference: buyer.preference,
      name: buyer.name,
      phone: buyer.phone,
      notify: buyer.notify,
    });
  } catch (e) {
    console.error("[match/me] 讀取失敗:", e);
    return NextResponse.json({ error: "目前無法讀取，請稍後再試" }, { status: 503 });
  }
}
