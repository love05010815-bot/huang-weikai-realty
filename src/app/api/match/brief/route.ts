/**
 * 一位客人的配對結果 —— 給店頭官網那一頁用的唯一一支 API
 *
 * 2026-10-05：同事的客人收到的連結改成店頭官網 /?b=<識別碼>#match（他說「把同事版的物件配對
 * 改這個官網內的配對給客人連結」）。店頭官網是靜態站，所以那一頁的 buyer-match.js 打這一支，
 * 一次把整頁要的東西拿齊：
 *   ① 他自己填過的購屋條件（一句話）
 *   ② 目前配對到的物件（已經排序好）
 *   ③ 該找誰：負責他的那位同事的名字、電話、LINE（同事停用或本人的客人就回本人的）
 *   ④ 預約表單要預填的姓名電話（他自己留的）
 *
 * 配對本體是 buildBuyerBrief —— 跟後台、/intake、weikaihouse.com/match 同一支 rankListings，
 * 所以店頭官網上看到的跟我們這邊看到的一模一樣，不會出現第二套配對規則。
 *
 * 識別碼（lib/match/token.ts，HMAC 簽章、60 天到期）驗不過一律 404、不透露任何東西 ——
 * 跟 /api/match/me 同一個原則。回的也只有「他自己的」：別人的客人、LINE userId、同事的金鑰都不在裡面。
 */
import { NextRequest, NextResponse } from "next/server";
import { BRANCH_SITE, OWNER } from "@/config/owner";
import { contactForOwner } from "@/lib/match/colleagues";
import { corsHeaders } from "@/lib/match/cors";
import { buildBuyerBrief } from "@/lib/match/intake";
import { addFriendUrl } from "@/lib/match/line";
import { getBuyer } from "@/lib/match/store";
import { verifyBuyerToken } from "@/lib/match/token";

export const dynamic = "force-dynamic";

/** 連結失效時給客人看的話。不說「為什麼」，只說找誰 */
const GONE = "這個找房連結已經失效，請直接與為您服務的業務聯絡。";

/** 畫面上要撥號用的純數字 */
const digits = (s: string): string => String(s ?? "").replace(/[^\d+]/g, "");

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export async function GET(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));
  const buyerId = verifyBuyerToken(req.nextUrl.searchParams.get("k"));
  if (!buyerId)
    return NextResponse.json({ error: GONE }, { status: 404, headers: cors });

  try {
    const buyer = await getBuyer(buyerId);
    if (!buyer)
      return NextResponse.json({ error: GONE }, { status: 404, headers: cors });

    // 同事停用（離職）時 contactForOwner 回 null → 當本人的客人處理，至少有人接得到
    const colleague = await contactForOwner(buyer.colleagueId);
    const brief = await buildBuyerBrief(
      buyer,
      24,
      colleague?.name ?? OWNER.alias,
    );

    return NextResponse.json(
      {
        buyer: {
          name: buyer.name || buyer.displayName || "",
          phone: buyer.phone || "",
        },
        summary: brief.summary,
        matched: brief.matched,
        total: brief.total,
        listings: brief.matches,
        contact: colleague
          ? {
              kind: "colleague",
              name: colleague.name,
              phone: colleague.phone,
              phoneRaw: digits(colleague.phone),
              lineUrl: colleague.lineUrl,
            }
          : {
              kind: "owner",
              name: OWNER.alias,
              phone: OWNER.phone,
              phoneRaw: OWNER.phoneRaw,
              lineUrl: addFriendUrl(),
            },
        branch: {
          name: BRANCH_SITE.name,
          phone: BRANCH_SITE.phone,
          phoneRaw: BRANCH_SITE.phoneRaw,
        },
      },
      { headers: cors },
    );
  } catch (e) {
    console.error("[match/brief] 讀取失敗:", e);
    return NextResponse.json(
      { error: "目前無法讀取，請稍後再試" },
      { status: 503, headers: cors },
    );
  }
}
