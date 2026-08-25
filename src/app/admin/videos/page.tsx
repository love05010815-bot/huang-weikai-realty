/**
 * /admin/videos —— 影音後台
 *
 * 這一頁改的東西會立刻反映到首頁的影音區塊與 /videos（server action 會 revalidate），
 * **不用重新部署**。
 *
 * 跟精選好案不同的是：影片沒有照片要上傳，貼一條網址就好。
 * YouTube 的網址系統會自己抓出影片 ID，縮圖與播放器都自動有。
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { adminEmails } from "@/auth";
import { CIS } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import AdminGateNotice from "@/app/admin/appointments/AdminGateNotice";
import { CATEGORY_META, listAllVideos, type VideoRecord } from "@/lib/videos";
import VideosManager from "./VideosManager";
import styles from "@/app/admin/listings/listings-admin.module.css";

export const dynamic = "force-dynamic";

export default async function VideosAdminPage() {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    return <AdminGateNotice kind="no_provider" />;
  }
  if (adminEmails().length === 0) return <AdminGateNotice kind="no_whitelist" />;
  const { email } = await getAdminCheckArgs();
  if (!email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/admin/videos")}`);
  if (!(await isCurrentUserAdmin())) return <AdminGateNotice kind="not_allowed" email={email} />;

  // 資料庫連不上不要丟 500 白畫面 —— 講清楚是資料庫的問題，你才知道要去看哪裡。
  let rows: VideoRecord[] = [];
  let loadError: string | null = null;
  try {
    rows = await listAllVideos();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  const activeCount = rows.filter((r) => r.status === "active").length;
  const knowledgeCount = rows.filter((r) => r.status === "active" && r.category === "knowledge").length;
  const tourCount = rows.filter((r) => r.status === "active" && r.category === "tour").length;
  // 認不出 YouTube ID 的：卡片不能內嵌播放，只能連出去。不是錯誤，但值得知道有幾支。
  const externalCount = rows.filter((r) => r.status === "active" && !r.videoId).length;

  return (
    <main className={styles.page} style={{ background: CIS.bg, color: CIS.text, fontFamily: CIS.font }}>
      <div className={styles.shell}>
        <div className={styles.titleRow}>
          <div>
            <h1 className={styles.title}>
              <Icon name="video" size={25} />
              影音
            </h1>
            <p className={styles.subtitle} style={{ color: CIS.textMute }}>
              改完立刻生效，不用部署。首頁只取每一類最前面 2 支，用箭頭調順序就是在調首頁放哪幾支。
            </p>
          </div>
          <Link
            className={styles.btn}
            style={{ borderColor: CIS.cardBorder, color: CIS.textSub }}
            href="/videos"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="externalLink" size={15} />
            看對外的樣子
          </Link>
        </div>

        {loadError ? (
          <div
            className={styles.notice}
            style={{ background: "rgba(244,63,94,.1)", borderColor: "rgba(244,63,94,.35)", color: "#fb7185" }}
          >
            <b>讀不到資料庫，這一頁現在是空的（不是影片被刪光了）。</b>
            <br />
            {loadError}
          </div>
        ) : null}

        <div className={styles.summaryRow}>
          {[
            ["上架中", activeCount, "#4ade80"],
            [CATEGORY_META.knowledge.label, knowledgeCount, CIS.textSub],
            [CATEGORY_META.tour.label, tourCount, CIS.textSub],
            ["只能連出去", externalCount, externalCount > 0 ? "#fbbf24" : CIS.textMute],
          ].map(([label, value, color]) => (
            <div
              key={String(label)}
              className={styles.summary}
              style={{ background: CIS.card, borderColor: CIS.cardBorder }}
            >
              <div className={styles.summaryLabel} style={{ color: CIS.textMute }}>
                {label}
              </div>
              <div className={styles.summaryValue} style={{ color: String(color) }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        <div
          className={styles.notice}
          style={{ background: "rgba(148,163,184,.08)", borderColor: CIS.cardBorder, color: CIS.textSub }}
        >
          <b>貼 YouTube 網址就好，縮圖跟播放器會自動有。</b>
          watch、youtu.be、Shorts 三種寫法都認得。
          FB 或 IG 的影片也可以貼，只是嵌不進來，卡片會變成「點了開新分頁」。
        </div>

        <VideosManager initial={rows} />
      </div>
    </main>
  );
}
