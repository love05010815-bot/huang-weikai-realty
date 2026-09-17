"use server";
/**
 * 建案地圖物件後台的五個動作：存、上下架、換順序、刪除。
 *
 * 每一個都先擋權限再做事 —— server action 可以被直接 POST，
 * 「畫面上沒有按鈕」不等於「外面的人叫不到」。
 *
 * 改完 revalidate `/map` 與後台自己，所以按下去對外頁面立刻就變。
 * ⚠️ 不要 revalidate `/` 或 `/listings` —— 那兩頁吃的是「精選好案」，
 *    跟這裡是兩套資料，白刷一次只是浪費。
 */
import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { PROJECTS } from "@/data/port-projects";
import { buildPoints, fetchCatalog } from "@/lib/houseol-catalog";
import { getHouseolAddressMap } from "@/lib/houseol-address";
import { matchProjects, pickAuto, type ProjectSuggestion } from "@/lib/project-match";
import {
  createMapListing,
  deleteMapListing,
  moveMapListing,
  setMapListingStatus,
  updateMapListing,
  validateMapListing,
  type MapListingInput,
  type MapListingStatus,
} from "@/lib/map-listings";

type Result = { ok: boolean; error?: string };

function revalidateAll(): void {
  revalidatePath("/map");
  revalidatePath("/admin/map-listings");
}

function describeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function saveMapListingAction(
  id: string | null,
  input: MapListingInput,
): Promise<Result & { id?: string }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };

  const checked = validateMapListing(input);
  if (!checked.ok) return { ok: false, error: checked.error };

  try {
    if (id) {
      await updateMapListing(id, checked.value);
    } else {
      const newId = await createMapListing(checked.value);
      revalidateAll();
      return { ok: true, id: newId };
    }
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }

  revalidateAll();
  return { ok: true, id };
}

export async function setMapListingStatusAction(id: string, status: MapListingStatus): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    await setMapListingStatus(id, status === "sold" ? "sold" : "active");
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  revalidateAll();
  return { ok: true };
}

export async function moveMapListingAction(id: string, direction: "up" | "down"): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    await moveMapListing(id, direction === "up" ? "up" : "down");
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  revalidateAll();
  return { ok: true };
}

export async function deleteMapListingAction(id: string): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    await deleteMapListing(id);
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
  revalidateAll();
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────────
   🏠 貼愛屋連結就帶入（2026-09-16）

   他原本要先在「愛屋庫存」搜尋（那份是書籤小工具抓的快照，要手動更新），
   再自己從 519 個建案裡挑一個。現在改成貼一條愛屋連結：這裡去讀電子型錄，
   標題／地址／格局／特色一次帶進來，順便用社區名猜建案。

   🔴 猜建案只有「社區名跟建案名一模一樣」才會自動選起來，其餘都只給候選讓他點 ——
      掛錯建案客戶會在地圖上看到別棟的房子，而且不會報錯。規則在 lib/project-match.ts。
   ──────────────────────────────────────────────────────────────── */

export type HouseolReadResult =
  | { ok: false; error: string }
  | {
      ok: true;
      caseId: string;
      title: string;
      address: string;
      /** 地址是哪裡來的：資料庫的完整門牌，還是型錄上只到路名的 */
      addressSource: "門牌" | "型錄";
      pointsText: string;
      linkHref: string;
      community: string;
      /** 型錄上的照片網址，客戶端一張一張打去 /api/admin/map-listings/houseol-photo */
      photos: string[];
      suggestions: ProjectSuggestion[];
      /** 有值＝夠確定，畫面直接幫他選起來 */
      autoProjectId: string | null;
      /** 型錄上沒讀到的欄位，畫面提醒他自己補 */
      missing: string[];
    };

export async function readHouseolAction(input: string): Promise<HouseolReadResult> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };

  const read = await fetchCatalog(input);
  if (!read.ok) return { ok: false, error: read.error };
  const l = read.listing;

  // 完整門牌只在資料庫裡（型錄把號碼藏起來只到路名），有就用好的那個
  let address = l.address;
  let addressSource: "門牌" | "型錄" = "型錄";
  try {
    const full = (await getHouseolAddressMap()).get(l.caseId);
    if (full) {
      address = full;
      addressSource = "門牌";
    }
  } catch {
    // 地址表讀不到就用型錄上的，不要讓整個帶入失敗
  }

  const projects = PROJECTS.map((p) => ({
    id: p.id,
    name: p.name,
    alias: p.alias,
    aliases: p.aliases,
    builder: p.builder,
    area: p.area,
    street: p.street,
  }));
  // 分數太低的是雜訊（「富宇大悦」配到「富宇大地」那種），寧可讓他自己搜
  const suggestions = matchProjects({ community: l.community, title: l.title, address }, projects).filter(
    (s) => s.score >= 50,
  );

  const missing: string[] = [];
  if (!l.title) missing.push("標題");
  if (!l.community) missing.push("社區名（所以猜不出建案）");
  if (l.rooms === null) missing.push("格局");
  if (l.ping === null) missing.push("坪數");

  return {
    ok: true,
    caseId: l.caseId,
    title: l.title,
    address,
    addressSource,
    pointsText: buildPoints(l).join("\n"),
    linkHref: l.catalogUrl,
    community: l.community,
    photos: l.photos,
    suggestions,
    autoProjectId: pickAuto(suggestions),
    missing,
  };
}

/*
 * 🔴 「把型錄照片抓進來」不在這裡 —— 它在 API 路由
 *    src/app/api/admin/map-listings/houseol-photo/route.ts。
 *    原因：sharp 的原生檔只帶得進 API 路由那支函式，寫成 server action 線上會噴
 *    libvips-cpp.so 找不到（2026-09-17 實際踩到）。細節寫在那支 route 的檔頭。
 */
