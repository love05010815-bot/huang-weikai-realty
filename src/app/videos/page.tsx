/**
 * /videos —— 影音
 *
 * 兩個分區：知識型、房屋開箱（系統擁有者指定的分法）。
 * 內容在資料庫 `site_video` 表，後台 `/admin/videos` 管。
 *
 * 這頁的商業目的：讓客戶在還沒敢打電話之前，先看到「這個人講的東西有料」。
 * 所以知識型放在上面 —— 開箱是給已經在找房的人看的，知識型是給還在觀望的人看的，
 * 而觀望的人比較多。
 *
 * ⚠️ 沒有影片時整頁還是要能打得開（會顯示引導文案），
 *    不要因為資料庫是空的就 404 或白畫面。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { OWNER, SITE_URL } from "@/config/owner";
import { CATEGORY_META, VIDEO_CATEGORIES, getPublicVideos } from "@/lib/videos";
// 版面骨架（header／section／container／eyebrow／btn）跟 /listings 共用同一份，
// 這樣影音頁跟其他內頁長得一致。⚠️ 改 home.module.css 會同時影響首頁與這幾頁。
import styles from "@/app/home.module.css";
import vid from "./videos.module.css";
import VideoCard from "./VideoCard";

export const metadata: Metadata = {
  title: "影音專區｜台中海線房仲黃瑋凱｜買屋知識與房屋開箱",
  description:
    "台中海線房仲黃瑋凱自製影音。知識型影片講買賣觀念、稅費與貸款；房屋開箱帶你實際走一遍屋內。沙鹿、梧棲、清水、龍井。",
  alternates: { canonical: `${SITE_URL}/videos` },
  openGraph: {
    title: "影音專區｜台中海線房仲黃瑋凱",
    description: "買屋知識與房屋開箱，看完再決定。",
    url: `${SITE_URL}/videos`,
    type: "website",
  },
};

/**
 * 影片在資料庫裡，但這頁仍然是「靜態產生 ＋ 定時重生」。
 * 後台存檔時 server action 會 revalidatePath("/videos")，所以改完立刻生效，
 * 下面這個秒數只是萬一 revalidate 沒跑到的保險。
 */
export const revalidate = 300;

export default async function VideosPage() {
  const videos = await getPublicVideos();

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

          {videos.length === 0 ? (
            <div className={styles.container}>
              <p className={vid.empty}>
                影片正在陸續整理上架。想先聊聊的話，歡迎
                <Link href="/card/booking">線上預約</Link>，或直接加我 LINE。
              </p>
            </div>
          ) : (
            VIDEO_CATEGORIES.map((category) => {
              const list = videos.filter((v) => v.category === category);
              // 那一類還沒有影片就整區不出現 —— 留一個空標題比沒有標題還糟
              if (list.length === 0) return null;
              const meta = CATEGORY_META[category];
              return (
                <div key={category} className={vid.categoryBlock}>
                  <div className={`${styles.container} ${styles.center}`}>
                    <span className={styles.eyebrow}>{meta.eyebrow}</span>
                    <h2 className={vid.categoryTitle}>{meta.label}</h2>
                    <p className={styles.sectionDesc}>{meta.desc}</p>
                  </div>
                  <div className={styles.container}>
                    <div className={vid.grid}>
                      {list.map((video, i) => (
                        <VideoCard key={video.id} video={video} eager={i < 3} />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          <div className={styles.container}>
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
