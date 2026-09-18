/**
 * /news —— 房市新知（房市最新消息 ＋ 房產知識）
 *
 * 2026-09-18 系統擁有者要的：「前台要做一個頁面放房產最新消息及知識，
 * 後台做好文案後可以上傳到前台」。所以這頁**完全吃資料庫**（`site_post`），
 * 內容一律從 `/admin/posts` 進來，這個檔不會有任何一篇文章的文字。
 *
 * 文章從哪來有兩條路，兩條都落在同一張表：
 *   ① `/admin/news`（房產新聞）→「拿去做」→ `/admin/content`（待產文案）
 *      改寫好之後按「放到前台」→ 變成一篇草稿
 *   ② 直接在 `/admin/posts` 按「寫一篇新的」貼上去（他自己在外面寫好的）
 *
 * ⚠️ 一篇文章都沒有的時候整頁還是要打得開（顯示引導文案），
 *    不要因為資料庫是空的就 404 或白畫面。
 *
 * 版面骨架沿用首頁那套（home.module.css 的 .page 定義了配色變數），
 * 這頁自己的樣式在 news.module.css。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { OWNER, SITE_URL } from "@/config/owner";
import { getPublicPosts } from "@/lib/posts";
import styles from "@/app/home.module.css";
import SiteNav from "@/app/_ui/SiteNav";
import SiteFooter from "@/app/_ui/SiteFooter";
import SocialLinks from "@/app/_ui/SocialLinks";
import nw from "./news.module.css";
import NewsBoard from "./NewsBoard";

/**
 * 標題用客戶真的會搜的字：行政區名 ＋「房市」「房貸」這種詞。
 * 規矩見 `feedback_seo_use_search_terms`（正式名稱讓位給行政區名、行政區的下一層不進標題）。
 */
const TITLE = `房市新知｜台中海線房市消息與房產知識｜沙鹿梧棲清水龍井`;
const DESCRIPTION = `台中海線房仲${OWNER.name}整理的房市消息與房產知識：央行政策、房貸成數、稅費與買賣流程，用人話講一遍。沙鹿、梧棲、清水、龍井。`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "台中海線房市",
    "沙鹿房市消息",
    "梧棲房市",
    "清水房價",
    "龍井買房",
    "房貸成數",
    "房產知識",
    OWNER.name,
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: "/news" },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/news`,
    title: TITLE,
    description: DESCRIPTION,
    siteName: `${OWNER.name}｜台中海線房仲`,
  },
};

/**
 * 文章在資料庫裡，但這頁仍然是「靜態產生 ＋ 定時重生」。
 * 後台存檔／發佈時 server action 會 revalidatePath("/news")，所以改完立刻生效，
 * 下面這個秒數只是萬一 revalidate 沒跑到的保險。
 */
export const revalidate = 300;

export default async function NewsPage() {
  const posts = await getPublicPosts();

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
          <SiteNav variant="sub" />
          <div className={styles.navCta}>
            <Link className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`} href="/card/booking">
              線上預約
            </Link>
          </div>
        </div>
      </header>

      {/* 桌機右側固定的社群直排。⚠️ 一定要在 <header> 外面 ——
          header 的 backdrop-filter 會把 position:fixed 的子元素關在 header 裡。 */}
      <SocialLinks variant="float" />

      <main>
        <section className={styles.section}>
          <div className={`${styles.container} ${styles.center}`}>
            <SocialLinks variant="bar" align="center" />
            <span className={styles.eyebrow}>NEWS &amp; KNOW-HOW</span>
            <h1 className={styles.sectionTitle}>房市新知</h1>
            <p className={styles.sectionDesc}>
              政策一變、成數一改，最先受影響的是正在看房的人。
              我把跟買賣真的有關的消息挑出來，用人話寫一遍，順便把該注意的地方講清楚。
            </p>
          </div>

          <div className={styles.container}>
            {posts.length === 0 ? (
              <p className={nw.empty}>
                文章正在陸續整理上架。
                <br />
                想先聊聊的話，歡迎<Link href="/card/booking">線上預約</Link>，或直接加我 LINE。
              </p>
            ) : (
              <NewsBoard posts={posts} />
            )}

            <p className={nw.note}>
              ⚠️ 本頁內容為<strong>一般性資訊整理，不構成個案的稅務、法律或投資建議</strong>。
              政策、利率與各銀行授信條件會隨時調整，實際核貸成數與條件仍以主管機關公告及各銀行審核結果為準；
              個案情況請以專業人員評估為準。
            </p>

            <Link href="/" className={nw.backLink}>
              ← 回首頁
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
