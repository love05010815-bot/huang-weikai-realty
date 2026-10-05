/**
 * 預約看屋：建立一筆 match_viewing（可以一次包含好幾間），回「導到官方 LINE」需要的連結
 *
 * 流程的關鍵在回應裡的 line.oaMessageUrl：它會開官方帳號聊天室並預填「預約確認 BK-XXXXXX」，
 * 買方按送出 → /api/line/webhook 收到 → 綁定 userId → 回確認卡（見 lib/match/webhook.ts）。
 *
 * 建立當下就先通知你（LINE 推播＋Email＋admin 群），標「尚未綁定 LINE」——
 * 買方就算最後沒去 LINE 送那一句，你也知道有人要看屋、有電話可以打。
 *
 * 防機器人：表單有一個看不見的 website 欄位（honeypot）。有填就假裝成功，不存、不通知。
 *
 * 2026-09-18：買方可以一次勾好幾間，**整批只產生一個預約編號**（他說「客戶選八間，
 * 不要跳八個訊息八個代號」）。送出時已經賣掉或下架的那幾間會被剔除，剩下的照樣成立 ——
 * 為了一間不見就把整筆退回去，對買方來說更莫名其妙。
 */
import { NextRequest, NextResponse } from "next/server";
import { colleagueContact, getColleague } from "@/lib/match/colleagues";
import { addFriendUrl, colleagueViewingNotifyText, notifyOwnerNewViewing, oaMessageUrl, pushMessages, text } from "@/lib/match/line";
import { qrDataUrl } from "@/lib/match/qr";
import { createViewing, getListings, upsertBuyer } from "@/lib/match/store";
import { verifyBuyerToken } from "@/lib/match/token";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const clean = (v: unknown, max: number): string => String(v ?? "").trim().slice(0, max);
/** 一筆預約最多幾間。看屋一天跑不完十間以上，多半是誤觸或機器人 */
const MAX_LISTINGS = 10;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "資料格式錯誤" }, { status: 400 });
  }

  if (clean(body.website, 200)) {
    // honeypot 被填 = 機器人。回一個長得像成功的東西讓它走開。
    return NextResponse.json({ viewing: { code: "BK-000000" }, line: {} }, { status: 201 });
  }

  // listingIds 是現在的形狀；listingId 是舊的單筆形狀（LINE 卡片的舊連結可能還在用）
  const wanted = [
    ...new Set(
      (Array.isArray(body.listingIds) ? body.listingIds : [body.listingId])
        .map((v) => clean(v, 64))
        .filter(Boolean),
    ),
  ].slice(0, MAX_LISTINGS);
  const name = clean(body.name, 40);
  const phone = clean(body.phone, 40).replace(/[^\d+]/g, "");
  const preferredAt = clean(body.preferredAt, 80);
  const note = clean(body.note, 500);
  // 識別碼（從官方帳號連結帶進來的）優先於瀏覽器記的編號，理由同 /api/match/search
  const tokenBuyerId = verifyBuyerToken(typeof body.token === "string" ? body.token : null);
  const buyerId = tokenBuyerId ?? (typeof body.buyerId === "string" && UUID_RE.test(body.buyerId) ? body.buyerId : null);

  if (!name) return NextResponse.json({ error: "請填寫姓名" }, { status: 400 });
  if (phone.replace(/\D/g, "").length < 8) return NextResponse.json({ error: "請填寫正確的聯絡電話" }, { status: 400 });

  if (!wanted.length) return NextResponse.json({ error: "請先選擇要看的物件" }, { status: 400 });

  try {
    const found = await getListings(wanted);
    const listings = found.filter((l) => l.status === "available");
    if (!listings.length) return NextResponse.json({ error: "物件不存在或已下架" }, { status: 400 });
    const dropped = wanted.length - listings.length;

    const buyer = await upsertBuyer({ id: buyerId, name, phone });
    const viewing = await createViewing({
      listingIds: listings.map((l) => l.id),
      buyerId: buyer.id,
      name,
      phone,
      preferredAt,
      note,
    });

    // 通知失敗不能讓買方看到錯誤 —— 預約已經成立了
    // buyer.preference 是他在 /api/match/search 留下的購屋條件（upsertBuyer 不會覆蓋掉舊的），
    // 跟著通知一起送給他本人，省得為了看客戶要什麼再開一次後台。
    // 同事的客人（2026-10-05 同事版）：不通知本人（名單各管各的），同事在自己的「預約」頁看得到；
    // 之後要做「有新預約 LINE 通知同事」再接這裡。同事停用了會回 null → 當本人的客人處理，至少有人接。
    const owner = buyer.colleagueId ? await getColleague(buyer.colleagueId) : null;
    const colleague = owner && owner.active ? colleagueContact(owner) : null;
    if (owner && colleague) {
      // 同事綁了 LINE 就推給他（計費一則）；沒綁只留 console，他在自己的「預約」頁看得到
      if (owner.lineUserId) {
        try {
          const ok = await pushMessages(owner.lineUserId, [text(colleagueViewingNotifyText(viewing, listings, buyer.preference))]);
          console.log(`[match/viewing] ${viewing.code} 推給同事「${owner.name}」${ok ? "成功" : "失敗（LINE 沒收）"}`);
        } catch (e) {
          console.error(`[match/viewing] ${viewing.code} 推給同事失敗:`, e);
        }
      } else {
        console.log(`[match/viewing] ${viewing.code} 是同事「${owner.name}」的客人（還沒綁 LINE），不通知本人`);
      }
    } else {
      try {
        await notifyOwnerNewViewing(viewing, listings, null, buyer.preference);
      } catch (e) {
        console.error("[match/viewing] 通知失敗:", e);
      }
    }

    const confirmText = `預約確認 ${viewing.code}`;
    return NextResponse.json(
      {
        viewing: { code: viewing.code, preferredAt: viewing.preferredAt, name: viewing.name, phone: viewing.phone },
        buyerId: buyer.id,
        listings: listings.map((l) => ({ id: l.id, title: l.title, city: l.city, district: l.district, address: l.address, price: l.price })),
        dropped,
        // 同事的客人：不導官方帳號，畫面改顯示同事的聯絡方式（line 給 null）；本人的客人照舊
        colleague,
        line: colleague
          ? null
          : {
              confirmText,
              oaMessageUrl: oaMessageUrl(confirmText),
              addFriendUrl: addFriendUrl(),
              // 桌機按那顆按鈕會被 LINE 導到官網首頁（深層連結只在手機有效），所以一併給 QR
              qrDataUrl: qrDataUrl(oaMessageUrl(confirmText)),
            },
      },
      { status: 201 },
    );
  } catch (e) {
    console.error("[match/viewing] 建立預約失敗:", e);
    return NextResponse.json({ error: "目前無法送出預約，請稍後再試或直接來電" }, { status: 503 });
  }
}
