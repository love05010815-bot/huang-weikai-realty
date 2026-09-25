/**
 * /match 表單的選項。內容怎麼組在 lib/match/meta.ts（後台代客建檔的表單也用同一份）。
 * 公開端點，不含任何個資。
 */
import { NextResponse } from "next/server";
import { buildMatchMeta } from "@/lib/match/meta";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await buildMatchMeta());
}
