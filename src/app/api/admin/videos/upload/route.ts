/**
 * 後台上傳影片檔（與封面圖）到 Vercel Blob。
 *
 * ## 為什麼不能像照片那樣直接 POST 給這支路由
 *
 * Vercel 的 serverless function **request body 上限是 4.5MB**。照片壓過之後
 * 幾百 KB 沒問題，影片動輒幾十上百 MB，一定會被擋掉 ——
 * 而且錯誤訊息是 413，看不出是這個原因。
 *
 * 所以影片走「client upload」：檔案**從瀏覽器直接傳到 Vercel Blob**，
 * 完全不經過這支路由。這支只做兩件事：
 *   1. 驗身分，然後發一張短期的上傳權杖（`onBeforeGenerateToken`）
 *   2. 上傳完成後收 Vercel 打回來的通知（`onUploadCompleted`）
 *
 * ⚠️ **`onBeforeGenerateToken` 裡一定要擋權限。** 不擋的話這支路由等於
 *    「任何人都可以往你的 Blob 丟檔案」，而且會直接吃掉 Hobby 方案的額度。
 */
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { ALLOWED_VIDEO_TYPES, MAX_VIDEO_UPLOAD_BYTES } from "@/lib/videos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 封面圖也走同一條路（上傳時在瀏覽器端用 canvas 截的，是一張 JPEG） */
const ALLOWED_POSTER_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // 🔴 這一行是這支路由唯一的門。拿掉就等於開放上傳。
        if (!(await isCurrentUserAdmin())) throw new Error("權限不足");

        // 前端會用 clientPayload 告訴我們這次傳的是影片還是封面圖。
        // 兩者能接受的格式與大小差很多，不要用同一套規則。
        const isPoster = clientPayload === "poster";

        return {
          allowedContentTypes: isPoster ? ALLOWED_POSTER_TYPES : [...ALLOWED_VIDEO_TYPES],
          // 檔名加亂數尾巴：不同影片同名（很多人的檔案都叫 video.mp4）不會互蓋
          addRandomSuffix: true,
          // ⚠️ 這裡才是真正的大小上限。前端那一道只是先講清楚，
          //    繞過前端直接呼叫 API 的話擋在這裡。
          maximumSizeInBytes: isPoster ? 2 * 1024 * 1024 : MAX_VIDEO_UPLOAD_BYTES,
          tokenPayload: JSON.stringify({ kind: isPoster ? "poster" : "video" }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // 這裡不寫資料庫 —— 影片是「上傳完成後，使用者還要填標題、選分類才存檔」，
        // 這個時間點還不知道要存成哪一筆。真正寫入在 saveVideoAction。
        console.log("[videos/upload] 上傳完成:", blob.pathname, blob.url);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    // 回 400 不回 500 —— Vercel 那邊看到非 200 會重試 5 次，
    // 但權限不足這種錯誤重試幾次都一樣。
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
