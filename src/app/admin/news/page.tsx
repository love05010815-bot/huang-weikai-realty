/**
 * /admin/news —— 房產新聞
 *
 * 每天早上 09:00 後系統自動把海線、中部、全台的房地產新聞抓進來（怎麼抓見 `lib/news-fetch.ts`）。
 * 這一頁給你挑：每一則一顆「拿去做」，選「改寫成知識文章」或「翻拍成短影音」，
 * 就排進「待產文案」（/admin/content）並跳過去；全文、複製、完成都在那一頁。
 * **改寫後放到前台給客戶看，是再下一步的功能，還沒做。**
 *
 * 權限跟其他後台頁一樣：三道 gate，再看白名單。
 */
import { redirect } from "next/navigation";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { adminEmails } from "@/auth";
import { CIS } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import AdminGateNotice from "@/app/admin/appointments/AdminGateNotice";
import { NEWS_CONFIG } from "@/config/news";
import { countNewsByRegion, latestNewsRun, listNews, type NewsRecord, type NewsRunRecord } from "@/lib/news";
import NewsManager from "./NewsManager";
import styles from "@/app/admin/listings/listings-admin.module.css";

export const dynamic = "force-dynamic";
/** 「立即抓取」是 server action，跑在這一頁的函式裡；抓取本身最多 48 秒。 */
export const maxDuration = 60;

export default async function NewsAdminPage() {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    return <AdminGateNotice kind="no_provider" />;
  }
  if (adminEmails().length === 0) return <AdminGateNotice kind="no_whitelist" />;
  const { email } = await getAdminCheckArgs();
  if (!email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/admin/news")}`);
  if (!(await isCurrentUserAdmin())) return <AdminGateNotice kind="not_allowed" email={email} />;

  // 資料庫連不上不要丟 500 白畫面 —— 講清楚是資料庫的問題，你才知道要去看哪裡。
  let items: NewsRecord[] = [];
  let counts = { coast: 0, central: 0, national: 0 };
  let latestRun: NewsRunRecord | null = null;
  let loadError: string | null = null;
  try {
    [items, counts, latestRun] = await Promise.all([
      listNews({ days: 7, limit: 500 }),
      countNewsByRegion(),
      latestNewsRun(),
    ]);
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
              房產新聞
            </h1>
            <p className={styles.subtitle} style={{ color: CIS.textMute }}>
              每天早上 {String(NEWS_CONFIG.startHour).padStart(2, "0")}:00 後自動抓進來，排序固定
              <b>海線 → 中部 → 全台</b>；標題或摘要要有房市、建案、租金這類字才會收。
              海線的新聞少，往回看 {NEWS_CONFIG.regionDays.coast} 天。看到想做的，按「拿去做」選
              <b>改寫成知識文章</b>或<b>翻拍成短影音</b>，就會排進左側的「待產文案」。
            </p>
          </div>
        </div>

        {loadError && (
          <div className={styles.notice} style={{ borderColor: "rgba(244,63,94,0.4)", color: "#fb7185" }}>
            讀不到資料庫：{loadError}
          </div>
        )}

        <NewsManager items={items} counts={counts} latestRun={latestRun} />
      </div>
    </main>
  );
}
