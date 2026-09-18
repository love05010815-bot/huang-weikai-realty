"use server";
/**
 * 房產消息後台的五個動作：存、發佈／收回、釘選、刪除。
 *
 * 每一個都先擋權限再做事 —— server action 是可以被直接 POST 的，
 * 「畫面上沒有按鈕」不等於「外面的人叫不到」。
 *
 * 改完一律 revalidate 前台的 `/news`、那一篇的內頁、sitemap 與後台自己，
 * 所以按下去客戶那邊立刻就變。
 * ⚠️ sitemap 忘了刷的話，Google 要靠自己爬才會發現新文章，會慢好幾天。
 */
import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import {
  createPost,
  deletePost,
  getPost,
  setPostPinned,
  setPostStatus,
  updatePost,
  validatePost,
  type PostInput,
  type PostStatus,
} from "@/lib/posts";

type Result = { ok: boolean; error?: string };

/** 前台列表 ＋ 那一篇內頁 ＋ sitemap ＋ 後台自己 */
function revalidateAll(slug?: string): void {
  revalidatePath("/news");
  if (slug) revalidatePath(`/news/${slug}`);
  revalidatePath("/sitemap.xml");
  revalidatePath("/admin/posts");
}

export async function savePostAction(
  id: string | null,
  input: PostInput,
): Promise<Result & { id?: string; slug?: string }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };

  const checked = validatePost(input);
  if (!checked.ok) return { ok: false, error: checked.error };

  try {
    if (id) {
      const before = await getPost(id);
      if (!before) return { ok: false, error: "找不到這篇文章（可能已經被刪掉）" };
      await updatePost(id, checked.value);
      revalidateAll(before.slug);
      return { ok: true, id, slug: before.slug };
    }
    const created = await createPost(checked.value);
    revalidateAll(created.slug);
    return { ok: true, ...created };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setPostStatusAction(id: string, status: PostStatus): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    const post = await getPost(id);
    if (!post) return { ok: false, error: "找不到這篇文章" };
    await setPostStatus(id, status);
    revalidateAll(post.slug);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true };
}

export async function setPostPinnedAction(id: string, pinned: boolean): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    const post = await getPost(id);
    if (!post) return { ok: false, error: "找不到這篇文章" };
    await setPostPinned(id, pinned);
    revalidateAll(post.slug);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true };
}

/**
 * 刪掉一篇。⚠️ 只刪這一個 id；封面圖留在 Blob（別篇可能也指著同一張）。
 */
export async function deletePostAction(id: string): Promise<Result> {
  if (!(await isCurrentUserAdmin())) return { ok: false, error: "權限不足" };
  try {
    const post = await getPost(id);
    if (!post) return { ok: true }; // 已經不在了就算成功，不要給他一個不能解決的錯誤
    await deletePost(id);
    revalidateAll(post.slug);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true };
}
