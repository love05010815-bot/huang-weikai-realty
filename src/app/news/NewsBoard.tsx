/**
 * /news 的清單主體：卡片列。
 *
 * 排序由資料層決定（置頂優先、再依發佈時間新到舊），這裡**不重排**，
 * 只負責畫面。呼叫端（page.tsx）已經先擋過 `posts.length === 0`，
 * 這裡不重複判斷空清單。
 *
 * ⚠️ 2026-09-25 拿掉了「第一篇當頭條、其餘走卡片列」那個版本 ——
 *    只有兩三篇文章時，頭條那張是橫的大卡（圖在左、字在右），
 *    底下那張是直的小卡（圖在上、字在下），兩張形狀完全不同，
 *    他一眼就說「排列方式要一致」。現在每一篇都是同一種卡片，
 *    置頂只靠 `Chips` 裡那顆「置頂」標籤標示，不再靠版面大小區分。
 *
 * ⚠️ 2026-09-25 同一次也拿掉了分類篩選（全部／房市快訊／房產知識）分頁——
 *    他說「前台先不用做分類，維持房產消息即可」。`category` 欄位在後台
 *    還在用（Chips 照樣顯示分類 chip、admin 照樣要選），只是前台不做
 *    切換 UI。也因為拿掉了唯一的互動（篩選用的 useState），這個元件
 *    不再需要 "use client"。要恢復篩選：回這個 commit 之前的版本找。
 */

import Link from "next/link";
import { POST_CATEGORY_META, type PublicPostCard } from "@/lib/posts";
import styles from "./news.module.css";

/** `2026-09-18 09:30:00` → `2026/09/18` */
function niceDate(stamp: string): string {
  if (!stamp || stamp.length < 10) return "";
  return stamp.slice(0, 10).replace(/-/g, "/");
}

function Cover({ post }: { post: PublicPostCard }) {
  if (post.coverUrl) {
    return (
      <Link href={`/news/${post.slug}`} className={styles.cover} aria-label={post.title}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.coverImg} src={post.coverUrl} alt={post.title} loading="lazy" />
      </Link>
    );
  }
  // 還沒配圖:畫一張有標題的底板。開天窗比沒有圖更糟。
  return (
    <Link href={`/news/${post.slug}`} className={styles.cover} aria-label={post.title}>
      <span className={styles.coverFallback}>
        <span className={styles.coverFallbackMark}>凱心成家 ｜ {POST_CATEGORY_META[post.category].label}</span>
        <span className={styles.coverFallbackText}>{post.title}</span>
      </span>
    </Link>
  );
}

function Chips({ post }: { post: PublicPostCard }) {
  return (
    <div className={styles.chipRow}>
      <span className={`${styles.chip} ${post.category === "knowledge" ? styles.chipKnowledge : ""}`}>
        {POST_CATEGORY_META[post.category].label}
      </span>
      {post.pinned ? <span className={`${styles.chip} ${styles.chipPin}`}>置頂</span> : null}
      <span className={styles.date}>{niceDate(post.publishedAt)}</span>
    </div>
  );
}

export default function NewsBoard({ posts }: { posts: PublicPostCard[] }) {
  return (
    <div className={styles.grid}>
      {posts.map((post) => (
        <article key={post.id} className={styles.card}>
          <Cover post={post} />
          <div className={styles.cardBody}>
            <Chips post={post} />
            {/* 同一層級的文章清單，全部用 h2 —— 不再有一篇比其他篇「高一階」 */}
            <h2 className={styles.cardTitle}>
              <Link href={`/news/${post.slug}`}>{post.title}</Link>
            </h2>
            <p className={styles.cardSummary}>{post.summary}</p>
            <Link href={`/news/${post.slug}`} className={styles.more}>
              閱讀全文 →
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
