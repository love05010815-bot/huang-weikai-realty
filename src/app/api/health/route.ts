/**
 * 保溫用的健康檢查。
 *
 * 目的不是監控，是「別讓客戶等 30 秒」：Vercel 函式閒置會冷啟動，
 * TiDB Cloud Starter（免費方案）閒置會直接休眠，兩個加起來讓閒置後的
 * 第一位客戶要等 25–35 秒才送得出預約。
 *
 * 由 .github/workflows/keep-warm.yml 定期呼叫，順手把函式與資料庫都叫醒。
 * 刻意做得極輕（一個 SELECT 1），不查任何預約資料、不回傳任何個資。
 *
 * 加 `?img=1` 會多檢查一項「後台上傳照片用的 sharp 載不載得起來」。
 * 預設不檢查 —— sharp 是原生模組，載入要時間，保溫排程每 5–10 分鐘打一次，
 * 沒必要每次都付這個成本。
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * sharp 能不能用。
 *
 * 這一項存在的理由：2026-08-21 上線時它在 linux 載不起來（缺 libvips 的 .so），
 * 後台上傳整個壞掉，而從外面完全看不出來 —— 上傳 API 要登入才打得到，
 * 沒登入永遠只會拿到 403，看不到底下是好是壞。
 */
async function checkImageProcessing(): Promise<{ ok: boolean; detail: string }> {
  try {
    const sharp = (await import("sharp")).default;
    // 真的跑一次編碼，不是只確認 import 成功 —— 載得進來但 .so 缺檔的情況
    // 正是上次踩到的坑，那要動到才會炸。
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#000" },
    })
      .webp()
      .toBuffer();
    return { ok: png.byteLength > 0, detail: `webp ${png.byteLength}B` };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[health] sharp 檢查失敗:", error);
    // 只回第一行，不要把整串堆疊丟給外面
    return { ok: false, detail: detail.split("\n")[0].slice(0, 160) };
  }
}

export async function GET(req: Request) {
  const startedAt = Date.now();
  let dbOk = false;
  try {
    await db.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (error) {
    // 只記在伺服器端，不把資料庫錯誤細節回給呼叫者。
    console.error("[health] DB 檢查失敗:", error);
  }

  const wantImg = new URL(req.url).searchParams.get("img") === "1";
  const img = wantImg ? await checkImageProcessing() : null;

  const ok = dbOk && (img ? img.ok : true);
  return NextResponse.json(
    {
      ok,
      db: dbOk ? "up" : "down",
      ...(img ? { img: img.ok ? "up" : "down", imgDetail: img.detail } : {}),
      ms: Date.now() - startedAt,
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
