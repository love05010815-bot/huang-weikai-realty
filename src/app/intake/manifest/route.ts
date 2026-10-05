/**
 * /intake/manifest?key=… —— 代客建檔的 web app manifest（每一條連結一份，因為 start_url 要帶金鑰）。
 *
 * 為什麼要有：iPhone 的手機通知（Web Push）只給「加到主畫面的 web app」，有 manifest（display: standalone）
 * Safari 才確定把它當 web app；Android Chrome 加到主畫面時也會照這裡的名稱、圖示、start_url 做。
 * 圖示：本人的連結是凱心成家商標，同事的是他給的「買方／梧棲新市鎮店」插畫（跟 page.tsx 的 apple-touch-icon 一致）。
 * 金鑰不對就 404，什麼都不透露（跟頁面本身一樣）。
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveIntakeActor } from "@/lib/match/intake-key";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? "";
  let colleague = false;
  try {
    const actor = key ? await resolveIntakeActor(key) : null;
    if (!actor) return new NextResponse("not found", { status: 404 });
    colleague = actor.kind === "colleague";
  } catch {
    return new NextResponse("unavailable", { status: 503 });
  }
  const start = `/intake?key=${encodeURIComponent(key)}`;
  const manifest = {
    id: start,
    name: "買方建檔",
    short_name: "買方建檔",
    start_url: start,
    scope: "/intake",
    display: "standalone",
    background_color: "#f4f6f7",
    theme_color: "#2fa894",
    icons: colleague
      ? [{ src: "/intake-colleague-icon.png", sizes: "512x512", type: "image/png", purpose: "any" }]
      : [{ src: "/kaixing-mark.png", sizes: "256x256", type: "image/png", purpose: "any" }],
  };
  return NextResponse.json(manifest, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" } });
}
