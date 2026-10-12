/**
 * 委託合約到期提醒的觸發點（每天一次）。
 *
 * 跟 /api/news/daily 同一套：端點公開，但做的事本身是冪等的——沒有該推的合約就什麼都不做，
 * 推過的不會再推（看 owner_property.contract_reminded_for）。誰來打都一樣。
 * 觸發：vercel.json 的 cron（01:30 UTC ＝ 台北 09:30）。
 *
 * 已登入後台才有的參數：
 *   `?dry=1`   只算、只回訊息預覽，不推、不標記（測試用）
 *   `?today=YYYY-MM-DD`  假裝今天是那天（配 dry=1 用）
 */
import { NextRequest, NextResponse } from "next/server";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { runContractReminders } from "@/lib/owners-contract-reminder";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const wantDry = sp.get("dry") === "1";
  const todayParam = (sp.get("today") || "").trim();
  const admin = wantDry || todayParam ? await isCurrentUserAdmin() : false;
  if ((wantDry || todayParam) && !admin) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  }
  if (todayParam && !/^\d{4}-\d{2}-\d{2}$/.test(todayParam)) {
    return NextResponse.json({ ok: false, reason: "today 格式應為 YYYY-MM-DD" }, { status: 400 });
  }

  try {
    const r = await runContractReminders({ dryRun: admin && wantDry, today: admin && todayParam ? todayParam : undefined });
    // 公開端點不把屋主資料吐出去：預覽內容只有已登入的 dry-run 才回
    const { preview, ...summary } = r;
    return NextResponse.json({ ok: true, ...summary, preview: admin ? preview : null });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: e instanceof Error ? e.message : String(e) });
  }
}
