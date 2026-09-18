/**
 * /admin/posts —— 房市新知（前台 `/news` 那一頁的文章）
 *
 * 這是「房產新聞 → 待產文案」的最後一段。文章有兩條路進來，都落在 `site_post`：
 *   ① `/admin/content` 改寫好的稿按「放到前台」（會帶 `?focus=<文章 id>` 跳到這裡）
 *   ② 這頁按「寫一篇新的」直接貼
 *
 * 改完立刻生效，不用部署 —— server action 會 revalidate `/news`、那一篇的內頁與 sitemap。
 *
 * 權限跟其他後台頁一樣：三道 gate，再看白名單。
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { adminEmails } from "@/auth";
import { CIS } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import AdminGateNotice from "@/app/admin/appointments/AdminGateNotice";
import { listAllPosts, type PostRecord } from "@/lib/posts";
import PostsManager from "./PostsManager";
import styles from "@/app/admin/listings/listings-admin.module.css";

export const dynamic = "force-dynamic";

export default async function PostsAdminPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    return <AdminGateNotice kind="no_provider" />;
  }
  if (adminEmails().length === 0) return <AdminGateNotice kind="no_whitelist" />;
  const { email } = await getAdminCheckArgs();
  if (!email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/admin/posts")}`);
  if (!(await isCurrentUserAdmin())) return <AdminGateNotice kind="not_allowed" email={email} />;

  const sp = await searchParams;
  const focus = typeof sp.focus === "string" && sp.focus ? sp.focus : null;

  // 資料庫連不上不要丟 500 白畫面 —— 講清楚是資料庫的問題，你才知道要去看哪裡。
  let rows: PostRecord[] = [];
  let loadError: string | null = null;
  try {
    rows = await listAllPosts();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className={styles.page} style={{ background: CIS.bg, color: CIS.text, fontFamily: CIS.font }}>
      <div className={styles.shell}>
        <div className={styles.titleRow}>
          <div>
            <h1 className={styles.title}>
              <Icon name="news" size={25} />
              房市新知
            </h1>
            <p className={styles.subtitle} style={{ color: CIS.textMute }}>
              前台 <Link href="/news" target="_blank" style={{ color: CIS.blueSoft }}>/news</Link>{" "}
              那一頁的文章。存檔後客戶立刻看得到，不用部署。
              從「待產文案」按「放到前台」進來的會先存成草稿，確認過再發佈。
            </p>
          </div>
        </div>

        {loadError ? (
          <div
            className={styles.notice}
            style={{ borderColor: "rgba(244,63,94,.35)", color: "#fb7185", marginBottom: 14 }}
          >
            ⚠️ 讀不到文章（資料庫）：{loadError}
          </div>
        ) : null}

        <PostsManager initial={rows} focus={focus} />
      </div>
    </main>
  );
}
