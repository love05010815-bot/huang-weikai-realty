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
import { buildPoints, fetchCatalog, isHouseolPhotoUrl } from "@/lib/houseol-catalog";
import { getHouseolAddressMap } from "@/lib/houseol-address";
import { uploadListingPhoto } from "@/lib/listing-photos";
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
      /** 型錄上的照片網址，客戶端一張一張送回來給 importHouseolPhotoAction */
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

/**
 * 把型錄上的**一張**照片抓下來、壓好、存進 Blob，回可以直接放進表單的網址。
 *
 * 走的是後台上傳照片同一支 `uploadListingPhoto()`（縮到 1600px、壓 WebP、存 Blob），
 * 所以照片跟他自己傳的一模一樣，不是把愛屋的圖直接外連
 * —— 外連的話愛屋換網址或擋熱連結，地圖上的照片就默默變破圖。
 *
 * 🔴 **一次只做一張，迴圈放在瀏覽器端**（2026-09-17 改）。本來是一次做完 8 張，
 *    他按了「沒反應」：實測光是 Blob 上傳一張就 3 秒，8 張串起來會撞到函式的時間上限
 *    被砍掉，而且中途完全沒有進度。現在一張一次（約 1～3 秒），畫面每完成一張就多一張縮圖，
 *    某一張壞掉也只有那一張失敗。
 *
 * 🔴 `url` 是從瀏覽器端傳進來的 —— **一定要擋網域**，不然就是開一個「叫伺服器去打任意網址」的洞。
 */
export async function importHouseolPhotoAction(
  url: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  if (!isHouseolPhotoUrl(url)) return { ok: false, error: "這不是愛屋的圖片網址" };

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { ok: false, error: `愛屋回應 ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    const name = url.split("/").pop() || "houseol.jpg";
    const uploaded = await uploadListingPhoto(
      new File([buf], name, { type: res.headers.get("content-type") ?? "image/jpeg" }),
    );
    return { ok: true, url: uploaded.url };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}
