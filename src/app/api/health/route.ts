/**
 * 保溫用的健康檢查。
 *
 * 目的不是監控，是「別讓客戶等 30 秒」：Vercel 函式閒置會冷啟動，
 * TiDB Cloud Starter（免費方案）閒置會直接休眠，兩個加起來讓閒置後的
 * 第一位客戶要等 25–35 秒才送得出預約。
 *
 * 由 .github/workflows/keep-warm.yml 定期呼叫，順手把函式與資料庫都叫醒。
 * 刻意做得極輕（一個 SELECT 1），不查任何預約資料、不回傳任何個資。
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  let dbOk = false;
  try {
    await db.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (error) {
    // 只記在伺服器端，不把資料庫錯誤細節回給呼叫者。
    console.error("[health] DB 檢查失敗:", error);
  }
  return NextResponse.json(
    { ok: dbOk, db: dbOk ? "up" : "down", ms: Date.now() - startedAt },
    { status: dbOk ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
