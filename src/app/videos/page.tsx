/**
 * /videos —— 影音專區（獨立分頁）
 *
 * 2026-08-25 系統擁有者拍板：**影音不放在首頁下滑區塊，做成獨立分頁**，
 * 跟「重劃區建案」(`/map`) 一樣從導覽列直接進來。
 *
 * 版面是「左邊清單、右邊側欄（影片類別／熱門影片／最新影片）」，
 * 點清單裡的影片會在上方開一個大播放器。主體在 `VideoLibrary.tsx`。
 *
 * 這頁的商業目的：讓客戶在還沒敢打電話之前，先看到「這個人講的東西有料」。
 *
 * ⚠️ 沒有影片時整頁還是要能打得開（顯示引導文案），
 *    不要因為資料庫是空的就 404 或白畫面。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { OWNER, SITE_URL } from "@/config/owner";
import { getPublicVideos } from "@/lib/videos";
import { getVideoViewCounts } from "@/lib/video-views";
import styles from "@/app/home.module.css";
import SiteNav from "@/app/_ui/SiteNav";
import vid from "./videos.module.css";
import VideoLibrary from "./VideoLibrary";

export const metadata: Metadata = {
  title: "影音專區｜台中海線房仲黃瑋凱｜房產知識、生活知識與房屋開箱",
  description:
    "台中海線房仲黃瑋凱自製影音。房產知識講買賣觀念、稅費與貸款；生活知識談居家維護與周邊生活機能；房屋開箱帶你實際走一遍屋內。沙鹿、梧棲、清水、龍井。",
  alternates: { canonical: `${SITE_URL}/videos` },
  openGraph: {
    title: "影音專區｜台中海線房仲黃瑋凱",
    description: "房產知識、生活知識與房屋開箱，看完再決定。",
    url: `${SITE_URL}/videos`,
    type: "website",
  },
};

/**
 * 影片在資料庫裡，但這頁仍然是「靜態產生 ＋ 定時重生」。
 * 後台存檔時 server action 會 revalidatePath("/videos")，所以改完立刻生效。
 * ⚠️ 觀看次數不會即時反映（它不觸發 revalidate），最多差 5 分鐘 —— 這是刻意的，
 *    每有人按一次播放就重建整頁太浪費。
 */
export const revalidate = 300;

export default async function VideosPage() {
  const videos = await getPublicVideos();
  // ⚠️ 刻意「一個做完再做下一個」，不要用 Promise.all ——
  //    那會同時抓兩條資料庫連線，這個專案的 pool 只有 3 條（P2024）。
  const views = await getVideoViewCounts();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.navWrap}>
          <Link href="/" className={styles.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.brandLogo} src="/kaixing-mark.png" alt="凱心成家" width={40} height={40} />
            <span>
              凱心成家
              <small className={styles.brandSub}>{OWNER.company} 台中海線房仲</small>
            </span>
          </Link>
          <div className={styles.navCta}>
            <Link className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`} href="/card/booking">
              線上預約
            </Link>
          </div>
          <SiteNav variant="sub" />
        </div>
      </header>

      <main>
        <section className={styles.section}>
          <div className={`${styles.container} ${styles.center}`}>
            <span className={styles.eyebrow}>VIDEOS</span>
            <h1 className={styles.sectionTitle}>影音專區</h1>
            <p className={styles.sectionDesc}>
              我自己拍、自己講的。買房這件事講一次聽不懂很正常，影片可以重看，
              也可以先看完再決定要不要找我聊。
            </p>
          </div>

          <div className={styles.container}>
            {videos.length === 0 ? (
              <p className={vid.empty}>
                影片正在陸續整理上架。想先聊聊的話，歡迎
                <Link href="/card/booking">線上預約</Link>，或直接加我 LINE。
              </p>
            ) : (
              <VideoLibrary videos={videos} views={views} />
            )}

            <p className={vid.note}>
              ⚠️ 影片內容為<strong>一般性說明，不構成個案的稅務、法律或投資建議</strong>。
              稅率與法規會調整，實際情況請以主管機關函釋與個案認定為準；
              屋況與產權以現場勘查及不動產說明書所載為準。
            </p>
            <Link href="/" className={vid.backLink}>
              ← 回首頁
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
