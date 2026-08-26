"use client";

/**
 * 🎬 一張影片卡
 *
 * ## 為什麼是「點了才載播放器」而不是直接嵌入 iframe
 *
 * 一個 YouTube iframe 大約要拉 700KB＋、跑一堆腳本。頁面上放十支影片就是
 * 十份，手機開起來會很慢，而且客戶通常只點其中一支。
 *
 * 所以預設只放**縮圖＋播放鍵**（縮圖是一張圖，YouTube 官方網址直接組得出來），
 * 點下去才把 iframe 換上去並自動播放。這是常見的 lite-embed 做法。
 *
 * ## 認不出 YouTube ID 的影片
 *
 * FB reels、IG 那種嵌不進來，卡片就變成「點了開新分頁」。
 * 這種沒有縮圖可拿，顯示一個底色佔位塊，不要留白或破圖。
 */

import { useState } from "react";
import type { PublicVideo } from "@/lib/videos";
import styles from "./videos.module.css";

export default function VideoCard({ video, eager = false }: { video: PublicVideo; eager?: boolean }) {
  const [playing, setPlaying] = useState(false);

  const body = (
    <>
      <h3 className={styles.cardTitle}>{video.title}</h3>
      {video.summary ? <p className={styles.cardSummary}>{video.summary}</p> : null}
    </>
  );

  // 自己上傳的檔案：用原生 <video>。
  //
  // ⚠️ `preload="none"` 是刻意的，而且**不要改成 metadata 或 auto** ——
  // 這頁上有幾支影片，preload 就會在每個訪客載入頁面時各拉一段下來。
  // Vercel Hobby 方案的流量額度有限，超過會讓整個檔案儲存停用 30 天
  // （連精選好案的照片一起消失）。所以：沒人按播放，就一個 byte 都不下載。
  // 畫面上看得到東西是靠 `poster`（上傳時在瀏覽器端截的那張）。
  if (video.source === "upload") {
    return (
      <article className={styles.card}>
        <div className={styles.thumbWrap}>
          <video
            className={styles.player}
            src={video.url}
            poster={video.thumbnail ?? undefined}
            controls
            preload="none"
            playsInline
            // 沒有 poster 時給個底色，不要變成一塊白的
            style={video.thumbnail ? undefined : { background: "#1a1310" }}
          />
        </div>
        <div className={styles.cardBody}>{body}</div>
      </article>
    );
  }

  // 嵌不進來的（FB／IG 之類）：整張卡就是一個連出去的連結
  if (!video.videoId) {
    return (
      <article className={styles.card}>
        <a
          className={styles.thumbWrap}
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`在新分頁觀看：${video.title}`}
        >
          <span className={styles.thumbFallback} aria-hidden="true">
            🎬
          </span>
          <span className={styles.playBadge} aria-hidden="true" />
        </a>
        <div className={styles.cardBody}>
          {body}
          <a className={styles.cardLink} href={video.url} target="_blank" rel="noopener noreferrer">
            前往觀看 ↗
          </a>
        </div>
      </article>
    );
  }

  return (
    <article className={styles.card}>
      {playing ? (
        <div className={styles.thumbWrap}>
          <iframe
            className={styles.player}
            // autoplay=1 是因為使用者已經按過播放鍵了 —— 那一下就是他的操作，
            // 不是自動播放廣告那種（瀏覽器也認這個手勢，所以不會被擋）
            src={`https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=1&rel=0`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <button
          type="button"
          className={styles.thumbWrap}
          onClick={() => setPlaying(true)}
          aria-label={`播放：${video.title}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.thumb}
            src={video.thumbnail ?? ""}
            alt=""
            width={480}
            height={360}
            loading={eager ? "eager" : "lazy"}
          />
          <span className={styles.playBadge} aria-hidden="true" />
        </button>
      )}
      <div className={styles.cardBody}>
        {body}
        <a className={styles.cardLink} href={video.url} target="_blank" rel="noopener noreferrer">
          在 YouTube 開啟 ↗
        </a>
      </div>
    </article>
  );
}
