/**
 * /news/[slug] —— 一篇房市新知
 *
 * 這頁存在的理由跟單一物件頁（/listings/[slug]）同一個：**要傳給客戶**。
 * LINE、FB 的連結預覽會吃這頁的 og:title 與 og:image，
 * 所以每篇都有自己的標題、摘要與封面圖，不是整個網站共用一張。
 *
 * ⚠️ 草稿（status=draft）在這裡是 404 —— `getPublicPost()` 只回已發佈的。
 *    「畫面上找不到入口」不等於「外面的人打不開」，過濾一定要在資料層。
 *
 * ⚠️ slug 發佈後不要改。客戶已經傳出去的連結會死掉，Google 也要重收一次。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OWNER, SITE_URL, SOCIAL } from "@/config/owner";
import { getPublicPost, getPublicPosts, POST_CATEGORY_META } from "@/lib/posts";
import { postExcerpt, postReadMinutes } from "@/lib/posts-text";
import SiteNav from "@/app/_ui/SiteNav";
import SiteFooter from "@/app/_ui/SiteFooter";
import SocialLinks from "@/app/_ui/SocialLinks";
import PostBody from "@/app/_ui/PostBody";
import styles from "@/app/home.module.css";
import nw from "../news.module.css";

/** 跟 /news 一樣：後台存檔會主動 revalidate，這個秒數只是保險 */
export const revalidate = 300;

type Params = { slug: string };

/** 相對路徑的封面圖要補上網域 —— og:image 吃相對路徑會抓不到 */
function absoluteCover(url: string): string {
  if (!url) return `${SITE_URL}${OWNER.photoUrl}`;
  return /^https?:\/\//i.test(url) ? url : `${SITE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** `2026-09-18 09:30:00` → `2026/09/18` */
function niceDate(stamp: string): string {
  if (!stamp || stamp.length < 10) return "";
  return stamp.slice(0, 10).replace(/-/g, "/");
}

/** `2026-09-18 09:30:00` → `2026-09-18T09:30:00+08:00`（結構化資料與 <time> 用） */
function isoStamp(stamp: string): string {
  if (!stamp || stamp.length < 19) return "";
  return `${stamp.slice(0, 10)}T${stamp.slice(11, 19)}+08:00`;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublicPost(slug);
  const siteName = `${OWNER.name}｜台中海線房仲`;

  if (!post) {
    return { title: `找不到這篇文章｜${OWNER.name}`, robots: { index: false, follow: true } };
  }

  const cat = POST_CATEGORY_META[post.category].label;
  const title = `${post.title}｜${cat}｜台中海線房仲${OWNER.name}`;
  const description = post.summary.trim() || postExcerpt(post.body, 110);
  const url = `${SITE_URL}/news/${post.slug}`;
  const cover = absoluteCover(post.coverUrl);

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    keywords: [cat, "台中海線房市", "沙鹿", "梧棲", "清水", "龍井", OWNER.name],
    robots: { index: true, follow: true },
    alternates: { canonical: `/news/${post.slug}` },
    openGraph: {
      type: "article",
      url,
      title,
      description,
      siteName,
      publishedTime: isoStamp(post.publishedAt) || undefined,
      images: [{ url: cover, alt: post.title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [cover] },
  };
}

export default async function NewsPostPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const post = await getPublicPost(slug);
  if (!post) notFound();

  // 底下的「其他文章」。⚠️ 刻意「一個做完再做下一個」，不要用 Promise.all ——
  // 那會同時抓兩條資料庫連線，這個專案的 pool 只有 3 條（P2024）。
  const others = (await getPublicPosts(8)).filter((p) => p.slug !== post.slug).slice(0, 3);

  const meta = POST_CATEGORY_META[post.category];
  const summary = post.summary.trim();

  /** 給 Google 的結構化資料。文章型別讓搜尋結果比較容易長出日期與作者。 */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title.slice(0, 110),
    description: summary || postExcerpt(post.body, 110),
    datePublished: isoStamp(post.publishedAt) || undefined,
    dateModified: isoStamp(post.updatedAt || post.publishedAt) || undefined,
    author: { "@type": "Person", name: OWNER.name },
    publisher: { "@type": "Organization", name: "凱心成家", url: SITE_URL },
    mainEntityOfPage: `${SITE_URL}/news/${post.slug}`,
    ...(post.coverUrl ? { image: [absoluteCover(post.coverUrl)] } : {}),
  };

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

      <SocialLinks variant="float" />

      <main>
        <section className={styles.section}>
          <div className={styles.container}>
            <article className={nw.article}>
              <div className={nw.articleHead}>
                <div className={nw.chipRow}>
                  <span className={`${nw.chip} ${post.category === "knowledge" ? nw.chipKnowledge : ""}`}>
                    {meta.label}
                  </span>
                  <span className={nw.date}>{niceDate(post.publishedAt)}</span>
                  <span className={nw.date}>約 {postReadMinutes(post.body)} 分鐘讀完</span>
                </div>
                <h1 className={nw.articleTitle}>{post.title}</h1>
                <p className={nw.articleMeta}>
                  <span>
                    {OWNER.company}　{OWNER.name}
                  </span>
                </p>
              </div>

              {post.coverUrl ? (
                <div className={nw.articleCover}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={post.coverUrl} alt={post.title} />
                </div>
              ) : null}

              {summary ? <p className={nw.articleLead}>{summary}</p> : null}

              <PostBody body={post.body} className={nw.body} />

              {post.sourceUrl ? (
                <p className={nw.source}>
                  資料來源：
                  <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
                    {post.sourceName || post.sourceUrl}
                  </a>
                  <br />
                  本文為個人整理與說明，內容以原始來源與主管機關公告為準。
                </p>
              ) : null}

              <p className={nw.note}>
                ⚠️ 本文為<strong>一般性資訊整理，不構成個案的稅務、法律或投資建議</strong>。
                政策、利率與各銀行授信條件會隨時調整，實際核貸成數與條件仍以主管機關公告及各銀行審核結果為準；
                個案情況請以專業人員評估為準。
              </p>

              <div className={nw.cta}>
                <p className={nw.ctaTitle}>這篇跟你的情況有關嗎？</p>
                <p className={nw.ctaText}>
                  買第二戶、想換屋、不確定自己貸得到幾成 —— 這些算一次就知道。
                  <br />
                  我人在海線，沙鹿、梧棲、清水、龍井都熟，可以直接問。
                </p>
                <div className={nw.ctaBtns}>
                  <Link className={nw.ctaBtn} href="/card/booking">
                    線上預約諮詢
                  </Link>
                  <a className={`${nw.ctaBtn} ${nw.ctaBtnLine}`} href={SOCIAL.line} target="_blank" rel="noopener noreferrer">
                    加 LINE 問我
                  </a>
                </div>
              </div>

              {others.length > 0 ? (
                <>
                  <h2 className={nw.alsoTitle}>其他文章</h2>
                  <div className={nw.grid}>
                    {others.map((o) => (
                      <article key={o.id} className={nw.card}>
                        <div className={nw.cardBody}>
                          <div className={nw.chipRow}>
                            <span className={`${nw.chip} ${o.category === "knowledge" ? nw.chipKnowledge : ""}`}>
                              {POST_CATEGORY_META[o.category].label}
                            </span>
                            <span className={nw.date}>{niceDate(o.publishedAt)}</span>
                          </div>
                          <h3 className={nw.cardTitle}>
                            <Link href={`/news/${o.slug}`}>{o.title}</Link>
                          </h3>
                          <p className={nw.cardSummary}>{o.summary}</p>
                          <Link href={`/news/${o.slug}`} className={nw.more}>
                            閱讀全文 →
                          </Link>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              ) : null}

              <Link href="/news" className={nw.backLink}>
                ← 回房市新知
              </Link>
            </article>
          </div>
        </section>
      </main>

      <SiteFooter />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </div>
  );
}
