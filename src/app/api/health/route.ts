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

  const params = new URL(req.url).searchParams;
  const wantImg = params.get("img") === "1";
  const img = wantImg ? await checkImageProcessing() : null;

  /**
   * `?env=1` 回報「各家串接的金鑰有沒有被線上這份部署讀到」。
   *
   * 這一項存在的理由（2026-08-24）：Meta 綁定卡了好幾輪，因為
   * 「環境變數設好了沒」從外面完全看不出來 —— `/api/admin/meta/auth` 會先擋權限
   * 回 403，後台頁面要登入才看得到，等於每次都得請系統擁有者去點一次回報給我。
   *
   * ⚠️ 只回 true/false，**絕對不要回值本身、不要回長度、不要回前綴**。
   *    知道「有沒有設」對外人沒有攻擊價值，知道內容才有。
   *    （同樣的做法 /api/line/webhook 的 GET 已經在用了。）
   */
  const env =
    params.get("env") === "1"
      ? {
          // 分開報告，才知道是「兩個都沒讀到」還是「只缺一個」。
          // metaKeys 是 process.env 裡以 META 開頭的鍵數量 —— 連鍵名都不存在的話，
          // 問題在 Vercel 那邊（沒掛到這個部署）；鍵在但值是空的，問題在值本身。
          metaId: Boolean(process.env.META_APP_ID),
          metaSecret: Boolean(process.env.META_APP_SECRET),
          metaKeys: Object.keys(process.env).filter((k) => k.startsWith("META")).length,
          youtube: Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.AUTH_GOOGLE_ID),
          line: Boolean(process.env.LINE_BOT_CHANNEL_SECRET && process.env.LINE_BOT_ACCESS_TOKEN),
          anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
          blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
        }
      : null;

  /**
   * `?meta=1` 去問 Meta 這個 App 登記了哪些「應用程式網域」。
   *
   * 綁定卡在 "網域未包含在應用程式的網域中" 時，這是唯一能從外面確認
   * 那個欄位到底存進去沒有的方法（Meta 後台那格會「看起來存了其實沒存」）。
   * 回傳只有網域清單與 App 名稱，兩者都會出現在 OAuth 錯誤訊息裡，不是機密。
   */
  const meta =
    params.get("meta") === "1"
      ? await (await import("@/lib/meta")).fetchAppDomains()
      : null;

  const ok = dbOk && (img ? img.ok : true);
  return NextResponse.json(
    {
      ok,
      db: dbOk ? "up" : "down",
      ...(img ? { img: img.ok ? "up" : "down", imgDetail: img.detail } : {}),
      ...(env ? { env } : {}),
      ...(meta ? { meta } : {}),
      ms: Date.now() - startedAt,
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
