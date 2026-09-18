"use client";

/**
 * /news 的清單主體：分類切換 ＋ 頭條 ＋ 卡片列。
 *
 * 分類切換做在瀏覽器端（不是換網址重新整理）—— 文章數量是幾十篇的量級，
 * 一次送完再前端過濾比每次往返快得多，客戶點起來也不會閃一下白畫面。
 *
 * 排序由資料層決定（置頂優先、再依發佈時間新到舊），這裡**不重排**，
 * 只負責過濾與畫面。
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { POST_CATEGORIES, POST_CATEGORY_META, type PostCategory, type PublicPostCard } from "@/lib/posts";
import styles from "./news.module.css";

type Filter = PostCategory | "all";

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
  // 還沒配圖：畫一張有標題的底板。開天窗比沒有圖更糟。
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
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const out: Record<Filter, number> = { all: posts.length, news: 0, knowledge: 0 };
    for (const p of posts) out[p.category] += 1;
    return out;
  }, [posts]);

  const shown = useMemo(
    () => (filter === "all" ? posts : posts.filter((p) => p.category === filter)),
    [posts, filter],
  );

  // 第一篇當頭條（置頂的自然會排在第一），其餘走卡片列
  const [lead, ...rest] = shown;

  return (
    <>
      <div className={styles.filters}>
        {(["all", ...POST_CATEGORIES] as Filter[]).map((key) => (
          <button
            key={key}
            type="button"
            className={`${styles.filterBtn} ${filter === key ? styles.filterOn : ""}`}
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
          >
            {key === "all" ? "全部" : POST_CATEGORY_META[key].label}
            <span className={styles.filterCount}>{counts[key]}</span>
          </button>
        ))}
      </div>

      {!lead ? (
        <p className={styles.empty}>
          這個分類還沒有文章。
          <br />
          先看看<Link href="/videos">影音專區</Link>，或直接
          <Link href="/card/booking">線上預約</Link>跟我聊聊。
        </p>
      ) : (
        <>
          <article className={styles.feature}>
            <Cover post={lead} />
            <div className={styles.featureBody}>
              <Chips post={lead} />
              <h2 className={styles.featureTitle}>
                <Link href={`/news/${lead.slug}`}>{lead.title}</Link>
              </h2>
              <p className={styles.featureSummary}>{lead.summary}</p>
              <Link href={`/news/${lead.slug}`} className={styles.more}>
                閱讀全文 →
              </Link>
            </div>
          </article>

          {rest.length > 0 ? (
            <div className={styles.grid}>
              {rest.map((post) => (
                <article key={post.id} className={styles.card}>
                  <Cover post={post} />
                  <div className={styles.cardBody}>
                    <Chips post={post} />
                    <h3 className={styles.cardTitle}>
                      <Link href={`/news/${post.slug}`}>{post.title}</Link>
                    </h3>
                    <p className={styles.cardSummary}>{post.summary}</p>
                    <Link href={`/news/${post.slug}`} className={styles.more}>
                      閱讀全文 →
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
