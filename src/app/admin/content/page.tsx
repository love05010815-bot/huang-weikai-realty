/**
 * /admin/content —— 待產文案
 *
 * 「房產新聞」按「拿去做」排進來的題，知識文章與短影音各一條線、各自一筆。
 * 改寫、拍片在這一頁進行（全文、複製都在這）；做完按「完成」，不做了按「退回」。
 * **做好的文章放到前台給客戶看，是再下一步，還沒做。**
 *
 * 權限跟其他後台頁一樣：三道 gate，再看白名單。
 */
import { redirect } from "next/navigation";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { adminEmails } from "@/auth";
import { CIS } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import AdminGateNotice from "@/app/admin/appointments/AdminGateNotice";
import { countNewsTasks, listNewsTasks, type NewsTaskCounts, type NewsTaskRecord } from "@/lib/news";
import ContentQueue from "./ContentQueue";
import styles from "@/app/admin/listings/listings-admin.module.css";

export const dynamic = "force-dynamic";

export default async function ContentAdminPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    return <AdminGateNotice kind="no_provider" />;
  }
  if (adminEmails().length === 0) return <AdminGateNotice kind="no_whitelist" />;
  const { email } = await getAdminCheckArgs();
  if (!email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/admin/content")}`);
  if (!(await isCurrentUserAdmin())) return <AdminGateNotice kind="not_allowed" email={email} />;

  const sp = await searchParams;
  const focus = typeof sp.focus === "string" && sp.focus ? sp.focus : null;

  // 資料庫連不上不要丟 500 白畫面 —— 講清楚是資料庫的問題，你才知道要去看哪裡。
  let tasks: NewsTaskRecord[] = [];
  let counts: NewsTaskCounts = { todo: { article: 0, video: 0 }, done: 0 };
  let loadError: string | null = null;
  try {
    [tasks, counts] = await Promise.all([listNewsTasks({ limit: 500 }), countNewsTasks()]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className={styles.page} style={{ background: CIS.bg, color: CIS.text, fontFamily: CIS.font }}>
      <div className={styles.shell}>
        <div className={styles.titleRow}>
          <div>
            <h1 className={styles.title}>
              <Icon name="list" size={25} />
              待產文案
            </h1>
            <p className={styles.subtitle} style={{ color: CIS.textMute }}>
              在「房產新聞」按「拿去做」選的題都在這，<b>知識文章</b>與<b>短影音</b>兩條線各自一筆，跨天不會消失。
              全文與複製在這裡；做完按「完成」，不做了按「退回」。做好的文章放到前台給客戶看是再下一步，還沒做。
            </p>
          </div>
        </div>

        {loadError && (
          <div className={styles.notice} style={{ borderColor: "rgba(244,63,94,0.4)", color: "#fb7185" }}>
            讀不到資料庫：{loadError}
          </div>
        )}

        <ContentQueue tasks={tasks} counts={counts} focus={focus} />
      </div>
    </main>
  );
}
