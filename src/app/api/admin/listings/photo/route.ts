/**
 * 後台上傳精選好案照片。
 *
 * 收 multipart 表單、壓成 WebP、丟進 Vercel Blob，回可以直接顯示的網址。
 * 實際的壓縮與上傳在 @/lib/listing-photos，這一層只做擋權限、收檔案、湊回應。
 *
 * 一次可以傳多張（後台的檔案選擇器允許複選）。**一張失敗不會拖垮其他張** ——
 * 選了八張其中一張是 HEIC 壞檔，另外七張還是要上得去，
 * 不然使用者得自己一張一張試哪張有問題。
 */
import { NextRequest, NextResponse } from "next/server";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { MAX_UPLOAD_BYTES, uploadListingPhoto } from "@/lib/listing-photos";

export const dynamic = "force-dynamic";
// sharp 是原生模組，跑不了 edge runtime
export const runtime = "nodejs";

/** 一次最多幾張。跟前台的 MAX_PHOTOS 無關，這是單次請求的保護。 */
const MAX_FILES_PER_REQUEST = 10;

type Uploaded = { name: string; url: string; bytes: number; width: number; height: number };
type Failed = { name: string; error: string };

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: "權限不足" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "讀不到上傳的檔案" }, { status: 400 });
  }

  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "沒有選到檔案" }, { status: 400 });
  }
  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      { error: `一次最多 ${MAX_FILES_PER_REQUEST} 張，這次選了 ${files.length} 張` },
      { status: 400 },
    );
  }

  const uploaded: Uploaded[] = [];
  const failed: Failed[] = [];

  // 逐張跑而不是 Promise.all：手機直出的圖一張可能十幾 MB，
  // 同時解八張 sharp 會把 serverless 的記憶體吃爆，寧可慢一點也要穩。
  for (const file of files) {
    const name = file.name || "未命名";
    try {
      const result = await uploadListingPhoto(file);
      uploaded.push({ name, ...result });
    } catch (e) {
      failed.push({ name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ uploaded, failed, maxBytes: MAX_UPLOAD_BYTES });
}
