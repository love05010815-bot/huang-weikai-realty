/**
 * /admin/content —— 待產文案
 *
 * 「房產新聞」按「拿去做」排進來的題，知識文章與短影音各一條線、各自一筆。
 * 寫稿有兩條路，都存進 `news_draft`、共用同一套字數檢查：
 *   免費（主要）：「複製指令」→ 貼進他自己的 ChatGPT → 「貼回結果」存檔。不用金鑰。
 *   付費（次要）：「自動派工」直接呼叫 OpenAI API，要帳戶有額度。
 * 做完按「完成」，不做了按「退回」。
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
import { copywriterModel, isCopywriterConfigured } from "@/lib/copywriter";
import {
  countNewsTasks,
  listNewsDraftsForTasks,
  listNewsTasks,
  type NewsDraftRecord,
  type NewsTaskCounts,
  type NewsTaskRecord,
} from "@/lib/news";
import AddNewsByUrl from "./AddNewsByUrl";
import ContentQueue from "./ContentQueue";
import styles from "@/app/admin/listings/listings-admin.module.css";

export const dynamic = "force-dynamic";
/** 「派工寫稿」是 server action，跑在這一頁的函式裡；等 OpenAI 最多 55 秒。 */
export const maxDuration = 60;

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
  const drafts: Record<string, NewsDraftRecord[]> = {};
  let loadError: string | null = null;
  try {
    [tasks, counts] = await Promise.all([listNewsTasks({ limit: 500 }), countNewsTasks()]);
    for (const d of await listNewsDraftsForTasks(tasks.map((t) => t.id))) (drafts[d.taskId] ??= []).push(d);
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
              寫稿按「複製指令」貼進你自己的 ChatGPT，寫完再貼回來存檔：知識文章給六個平台各一版、
              短影音給三個版本（15 字標題、黃金三秒鉤子、1 分鐘口播稿），字數後台會自己數。
              做完按「完成」，不做了按「退回」。做好的文章放到前台給客戶看是再下一步，還沒做。
            </p>
          </div>
        </div>

        {loadError && (
          <div className={styles.notice} style={{ borderColor: "rgba(244,63,94,0.4)", color: "#fb7185" }}>
            讀不到資料庫：{loadError}
          </div>
        )}

        <AddNewsByUrl />

        <ContentQueue tasks={tasks} counts={counts} drafts={drafts} configured={isCopywriterConfigured()} model={copywriterModel()} focus={focus} />
      </div>
    </main>
  );
}
