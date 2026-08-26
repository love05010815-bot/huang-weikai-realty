"use client";

/**
 * 🎬 影音專區的主體：左邊清單、右邊側欄。
 *
 * ## 版面
 *
 *   ┌──────────────────────────────┬───────────────┐
 *   │ （點了影片才出現的大播放器）      │ 影片類別        │
 *   │                              │ 熱門影片        │
 *   │ 影片清單（縮圖＋標題＋說明＋日期）  │ 最新影片        │
 *   └──────────────────────────────┴───────────────┘
 *
 * ## 為什麼播放器放在最上面而不是每張卡各放一個
 *
 * 每張卡各放一個播放器的話，畫面上會同時有好幾個 iframe／video 元素，
 * 而且點第二支的時候第一支還在播。**集中成一個「正在播放」的大播放器**，
 * 點誰就換誰，一次只有一個在跑 —— 這也是截圖裡那個網站的做法。
 *
 * ## ⚠️ 一支都沒點之前，不下載任何影片
 *
 * 清單上只有縮圖（一張圖）。播放器是點了才生出來的：
 *   ・YouTube → 這時候才插 iframe
 *   ・自己上傳 → `<video preload="none">`，按了播放鍵才開始拉
 * 這是流量保護的一部分，**不要為了「讓它自動播」把播放器改成一開始就渲染**。
 * 脈絡見 `src/lib/videos.ts` 檔頭。
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CATEGORY_META,
  VIDEO_CATEGORIES,
  type PublicVideo,
  type VideoCategory,
} from "@/lib/videos";
import styles from "./videos.module.css";

type Filter = "all" | VideoCategory;

/** 側欄「熱門影片」「最新影片」各列幾支 */
const SIDE_LIST_COUNT = 5;

function formatViews(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 萬`;
  return String(n);
}

/** 記一次觀看。用 sendBeacon —— 點播放之後頁面可能馬上被切走，一般 fetch 會來不及送 */
function recordView(id: string) {
  const payload = JSON.stringify({ id });
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      if (navigator.sendBeacon("/api/videos/view", new Blob([payload], { type: "application/json" }))) return;
    }
    void fetch("/api/videos/view", {
      method: "POST",
      body: payload,
      keepalive: true,
      headers: { "Content-Type": "application/json" },
    }).catch(() => {});
  } catch {
    // 統計而已，壞了就算了
  }
}

export default function VideoLibrary({
  videos,
  views,
}: {
  videos: PublicVideo[];
  views: Record<string, number>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [playingId, setPlayingId] = useState<string | null>(null);
  // 同一支影片在同一次瀏覽裡只算一次觀看，來回切不要灌數字
  const [counted, setCounted] = useState<Set<string>>(new Set());

  const viewOf = (v: PublicVideo) => views[v.id] ?? 0;

  const shown = useMemo(
    () => (filter === "all" ? videos : videos.filter((v) => v.category === filter)),
    [videos, filter],
  );

  const hottest = useMemo(
    () => [...videos].sort((a, b) => viewOf(b) - viewOf(a)).filter((v) => viewOf(v) > 0).slice(0, SIDE_LIST_COUNT),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [videos, views],
  );

  const newest = useMemo(
    () => [...videos].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, SIDE_LIST_COUNT),
    [videos],
  );

  const playing = playingId ? videos.find((v) => v.id === playingId) ?? null : null;

  function play(v: PublicVideo) {
    setPlayingId(v.id);
    if (!counted.has(v.id)) {
      recordView(v.id);
      setCounted((prev) => new Set(prev).add(v.id));
    }
    // 播放器在頁面最上面，點下面的影片要把畫面帶上去，不然會以為沒反應
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        document.getElementById("player")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  const counts: Record<Filter, number> = {
    all: videos.length,
    knowledge: videos.filter((v) => v.category === "knowledge").length,
    tour: videos.filter((v) => v.category === "tour").length,
  };

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        {/* ---- 正在播放 ---- */}
        {playing ? (
          <div id="player" className={styles.playerBlock}>
            <div className={styles.playerFrame}>
              {playing.source === "upload" ? (
                <video
                  key={playing.id}
                  className={styles.playerMedia}
                  src={playing.url}
                  poster={playing.thumbnail ?? undefined}
                  controls
                  autoPlay
                  playsInline
                />
              ) : playing.videoId ? (
                <iframe
                  key={playing.id}
                  className={styles.playerMedia}
                  src={`https://www.youtube-nocookie.com/embed/${playing.videoId}?autoplay=1&rel=0`}
                  title={playing.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                // 嵌不進來的來源（FB／IG）：不能放播放器，給一個連出去的區塊
                <a className={styles.playerExternal} href={playing.url} target="_blank" rel="noopener noreferrer">
                  這支影片放在其他平台，點這裡開新分頁觀看 ↗
                </a>
              )}
            </div>
            <h2 className={styles.playerTitle}>{playing.title}</h2>
            <div className={styles.playerMeta}>
              {playing.pinned ? <span className={styles.pinTag}>📌 置頂</span> : null}
              <span className={styles.tag}>{CATEGORY_META[playing.category].label}</span>
              <span>🕘 {playing.publishedAt}</span>
              <span>👁 {formatViews(viewOf(playing) + (counted.has(playing.id) ? 1 : 0))}</span>
            </div>
            {playing.summary ? <p className={styles.playerSummary}>{playing.summary}</p> : null}
            <button type="button" className={styles.closePlayer} onClick={() => setPlayingId(null)}>
              關閉播放器
            </button>
          </div>
        ) : null}

        {/* ---- 影片清單 ---- */}
        {shown.length === 0 ? (
          <p className={styles.empty}>
            這個分類還沒有影片。看看
            <button type="button" className={styles.linkBtn} onClick={() => setFilter("all")}>
              全部影片
            </button>
            ，或
            <Link href="/card/booking">直接約時間聊聊</Link>。
          </p>
        ) : (
          <ul className={styles.list}>
            {shown.map((v, i) => (
              <li key={v.id} className={styles.row}>
                <button
                  type="button"
                  className={styles.rowThumb}
                  onClick={() => play(v)}
                  aria-label={`播放：${v.title}`}
                >
                  {v.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className={styles.rowThumbImg}
                      src={v.thumbnail}
                      alt=""
                      width={480}
                      height={360}
                      loading={i < 3 ? "eager" : "lazy"}
                    />
                  ) : (
                    <span className={styles.rowThumbEmpty} aria-hidden="true">
                      🎬
                    </span>
                  )}
                  <span className={styles.playBadge} aria-hidden="true" />
                </button>

                <div className={styles.rowBody}>
                  <div className={styles.rowTop}>
                    {/* ⚠️ 置頂一定要標出來 —— 不標的話，一支舊影片出現在新的上面，
                        看起來就像日期排序壞掉了。 */}
                    {v.pinned ? <span className={styles.pinTag}>📌 置頂</span> : null}
                    <span className={styles.tag}>{CATEGORY_META[v.category].label}</span>
                  </div>
                  <h3 className={styles.rowTitle}>
                    <button type="button" className={styles.rowTitleBtn} onClick={() => play(v)}>
                      {v.title}
                    </button>
                  </h3>
                  {v.summary ? <p className={styles.rowSummary}>{v.summary}</p> : null}
                  <div className={styles.rowMeta}>
                    <span>🕘 {v.publishedAt}</span>
                    <span>👁 {formatViews(viewOf(v))}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---- 側欄 ---- */}
      <aside className={styles.side}>
        <section className={styles.sideBlock}>
          <h2 className={styles.sideTitle}>📁 影片類別</h2>
          <ul className={styles.sideNav}>
            {(["all", ...VIDEO_CATEGORIES] as Filter[]).map((key) => (
              <li key={key}>
                <button
                  type="button"
                  className={`${styles.sideNavBtn}${filter === key ? ` ${styles.sideNavOn}` : ""}`}
                  onClick={() => setFilter(key)}
                >
                  <span>{key === "all" ? "全部影片" : CATEGORY_META[key as VideoCategory].label}</span>
                  <span className={styles.sideCount}>{counts[key]}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* 都沒人看過的時候整區不出現 —— 掛一個空的「熱門影片」比沒有還糟 */}
        {hottest.length > 0 ? (
          <section className={styles.sideBlock}>
            <h2 className={styles.sideTitle}>🔥 熱門影片</h2>
            <ul className={styles.sideList}>
              {hottest.map((v) => (
                <li key={v.id}>
                  <button type="button" className={styles.sideItem} onClick={() => play(v)}>
                    <span className={styles.sideItemTitle}>{v.title}</span>
                    <span className={styles.sideItemMeta}>👁 {formatViews(viewOf(v))}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className={styles.sideBlock}>
          <h2 className={styles.sideTitle}>🆕 最新影片</h2>
          <ul className={styles.sideList}>
            {newest.map((v) => (
              <li key={v.id}>
                <button type="button" className={styles.sideItem} onClick={() => play(v)}>
                  <span className={styles.sideItemTitle}>{v.title}</span>
                  <span className={styles.sideItemMeta}>🕘 {v.publishedAt}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.sideBlock}>
          <h2 className={styles.sideTitle}>💬 想直接問？</h2>
          <p className={styles.sideCta}>影片講不完的、或想針對自己的狀況問清楚的，直接約個時間。</p>
          <Link className={styles.sideCtaBtn} href="/card/booking">
            線上預約諮詢
          </Link>
        </section>
      </aside>
    </div>
  );
}
