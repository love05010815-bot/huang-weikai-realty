/**
 * GET /api/favorites?p=<建案id,…>&l=<slug,…> —— 收藏頁用：把客戶瀏覽器裡存的 key 換成「現在」的資料
 *
 * 收藏跟足跡都存在客戶的瀏覽器裡（見 lib/favorites.ts 檔頭），頁面只有 key 跟當時的名稱快照。
 * 打這一支拿最新狀態：建案現在有幾件在售、精選好案現在的售價與封面、**是不是已經下架**。
 * 客戶兩週後回來看收藏，不能看到舊價格、也不能點進一戶早就賣掉的還以為在賣。
 *
 *   ・建案：static 資料 port-projects.ts ＋ map_listing 表數「他在這裡有幾件在售」
 *   ・精選好案：上架中的走 getPublicListings()（含售價、一小時快取）；
 *     不在上架清單裡的再逐戶查 —— 已下架回 status "sold"，整筆被刪掉的不回（頁面顯示快照＋「找不到」）
 *
 * 公開端點、不用登入（客戶在用）。key 格式不對的直接丟掉、不進資料庫（parseKeyList）。
 * 一律 no-store：這是個人清單，而且下架狀態要即時。
 */
import { NextRequest, NextResponse } from "next/server";
import { AREA_LABEL, PROJECTS, STATUS_LABEL } from "@/data/port-projects";
import {
  FAV_MAX,
  parseKeyList,
  type FavoritesPayload,
  type ListingCard,
  type ProjectCard,
} from "@/lib/favorites";
import { getListingBySlug, getPublicListings } from "@/lib/listings";
import { getMapListingsByProject } from "@/lib/map-listings";
import { resolvePhotoSrc } from "@/lib/photo-src";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  // 一個 IP 一分鐘 120 次。收藏頁一次只打一發，正常人撞不到；拿腳本掃 slug 的會
  if (!rateLimit(`favorites:${getClientIp(req)}`, 120, 60_000).allowed) {
    return NextResponse.json({ ok: false, error: "too_many" }, { status: 429, headers: NO_STORE });
  }

  const sp = req.nextUrl.searchParams;
  const ids = parseKeyList(sp.get("p"), "project", FAV_MAX);
  const slugs = parseKeyList(sp.get("l"), "listing", FAV_MAX);

  const projects: Record<string, ProjectCard> = {};
  const listings: Record<string, ListingCard> = {};

  if (ids.length > 0) {
    // 在售物件數查不到（資料庫抽風）就全部當 0 —— 建案本身是 static 的，不能因為這個讓整頁開天窗
    let mine: Map<string, unknown[]> | null = null;
    try {
      mine = await getMapListingsByProject();
    } catch (error) {
      console.error("[favorites] 在售物件數查不到，先當 0:", error);
    }
    for (const id of ids) {
      const p = PROJECTS.find((x) => x.id === id);
      if (!p) continue;
      projects[id] = {
        kind: "project",
        key: id,
        name: p.name,
        builder: p.builder,
        area: AREA_LABEL[p.area],
        status: STATUS_LABEL[p.status],
        completion: p.completion,
        units: p.units ?? null,
        mine: mine?.get(id)?.length ?? 0,
      };
    }
  }

  if (slugs.length > 0) {
    const active = new Map((await getPublicListings()).map((l) => [l.slug, l] as const));
    for (const slug of slugs) {
      const a = active.get(slug);
      if (a) {
        listings[slug] = {
          kind: "listing",
          key: slug,
          area: a.area,
          title: a.title,
          cover: a.photos[0] ? resolvePhotoSrc(a.photos[0]) : null,
          price: a.price ?? null,
          status: "active",
        };
        continue;
      }
      // 不在上架清單：已下架（還留著、要告訴客戶）或整筆被刪（就不回）
      const found = await getListingBySlug(slug, { withPrice: false });
      if (found.listing && found.status === "sold") {
        listings[slug] = {
          kind: "listing",
          key: slug,
          area: found.listing.area,
          title: found.listing.title,
          cover: found.listing.photos[0] ? resolvePhotoSrc(found.listing.photos[0]) : null,
          price: null,
          status: "sold",
        };
      }
    }
  }

  const payload: FavoritesPayload = { ok: true, projects, listings };
  return NextResponse.json(payload, { headers: NO_STORE });
}
