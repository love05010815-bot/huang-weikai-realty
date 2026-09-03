"use server";
/**
 * 影音後台的五個動作：存、上下架、換順序、刪除。
 *
 * 每一個都先擋權限再做事 —— server action 是可以被直接 POST 的，
 * 「畫面上沒有按鈕」不等於「外面的人叫不到」。
 *
 * 改完一律 revalidate 首頁、/videos 與後台自己，所以按下去對外頁面立刻就變。
 */
import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import {
  createVideo,
  deleteVideo,
  discardVideoBlobs,
  setVideoPinned,
  setVideoStatus,
  updateVideo,
  validateVideo,
  type VideoInput,
  type VideoStatus,
} from "@/lib/videos";

type Result = { ok: boolean; error?: string };

/** 對外頁面 ＋ 後台自己，三個路徑一起刷新 */
function revalidateAll(): void {
  revalidatePath("/");
  revalidatePath("/videos");
  revalidatePath("/admin/videos");
}

export async function saveVideoAction(
  id: string | null,
  input: VideoInput,
): Promise<Result & { id?: string }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };

  const checked = validateVideo(input);
  if (!checked.ok) return { ok: false, error: checked.error };

  try {
    if (id) {
      await updateVideo(id, checked.value);
    } else {
      const newId = await createVideo(checked.value);
      revalidateAll();
      return { ok: true, id: newId };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidateAll();
  return { ok: true };
}

/**
 * 使用者放棄了「已經傳上 Blob、但還沒存檔」的檔案（按取消／換來源／重選檔）。
 * 前端只會送這次表單裡自己傳上去的網址；既有已存檔的影片絕對不會經過這裡。
 * 不 revalidate —— 對外頁面沒有任何東西指著這些檔。
 */
export async function discardUploadedBlobsAction(urls: string[]): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  if (!Array.isArray(urls) || urls.length === 0) return { ok: true };
  try {
    await discardVideoBlobs(urls.filter((u): u is string => typeof u === "string"));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true };
}

export async function setVideoStatusAction(id: string, status: VideoStatus): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    await setVideoStatus(id, status);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidateAll();
  return { ok: true };
}

export async function setVideoPinnedAction(id: string, pinned: boolean): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    await setVideoPinned(id, pinned);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidateAll();
  return { ok: true };
}

/**
 * 刪除。
 *
 * ⚠️ 影片跟物件不一樣 —— 物件成交要「下架」不能刪（賣掉的還掛著是廣告不實，
 * 但整筆刪掉就查不到賣過什麼）。影片沒有這個問題，不想放就刪掉沒關係。
 * 想留著以後再放的話用「隱藏」。
 */
export async function deleteVideoAction(id: string): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    await deleteVideo(id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidateAll();
  return { ok: true };
}
