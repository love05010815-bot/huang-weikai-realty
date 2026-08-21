"use client";

/**
 * 好案卡片的照片區。
 *
 * 只有一張照片時就是一張普通的圖，不會有任何多餘的介面 ——
 * 放第二張以上才會長出「1/3」計數、圓點、左右箭頭。
 * 這樣物件只有一張照片時，畫面跟原本完全一樣。
 *
 * 捲動用原生的 scroll-snap 做，不是自己算位移：
 * 手機上手指滑動的手感、慣性、回彈都是瀏覽器原生的，自己寫一定比較差。
 * JS 只做兩件事：① 從捲動位置反推現在第幾張（讓圓點跟著亮）
 *              ② 點圓點與箭頭時捲到對應位置。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./listings.module.css";

type Props = {
  photos: string[];
  /** 給讀圖軟體用的描述，通常是「行政區・社區－標題」 */
  alt: string;
  /**
   * 首屏看得到的卡片設 true，封面圖會立刻載入。
   * 其餘一律 lazy —— 九個物件各三張就是 27 張圖，全部搶著載會把首屏拖垮。
   */
  eager?: boolean;
};

export default function PhotoCarousel({ photos, alt, eager = false }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const many = photos.length > 1;

  useEffect(() => {
    const el = trackRef.current;
    if (!el || !many) return;
    // 這裡刻意「不」用 requestAnimationFrame 節流：rAF 在背景分頁會被瀏覽器暫停，
    // 一暫停圓點就不會跟著亮。直接算就好 —— 兩次屬性讀取加一個除法，
    // 而且算出同一個值時 React 會自己跳過重繪，成本可以忽略。
    const onScroll = () => {
      if (!el.clientWidth) return;
      const i = Math.round(el.scrollLeft / el.clientWidth);
      setIndex(Math.min(photos.length - 1, Math.max(0, i)));
    };
    onScroll(); // 進場先對一次，避免瀏覽器還原捲動位置時圓點對不上
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [photos.length, many]);

  const goTo = useCallback((i: number) => {
    const el = trackRef.current;
    if (!el) return;
    // 使用者若在系統裡開了「減少動態效果」，就直接跳過去不要滑 ——
    // 對前庭功能敏感的人來說，會動的畫面是會不舒服的。
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: i * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
  }, []);

  if (photos.length === 0) {
    return (
      <div className={styles.photoPlaceholder} aria-label="照片準備中">
        <span>🏠</span>
        <span>照片準備中</span>
      </div>
    );
  }

  return (
    <div className={styles.gallery}>
      <div className={styles.track} ref={trackRef}>
        {photos.map((file, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={file}
            className={styles.photo}
            src={`/listings/${file}`}
            alt={i === 0 ? alt : `${alt}（照片 ${i + 1}）`}
            width={640}
            height={480}
            /* 只有首屏卡片的封面圖立刻載，其他都等捲到才載 */
            loading={eager && i === 0 ? "eager" : "lazy"}
            /* 桌機拖曳圖片會觸發原生拖放，跟左右捲動打架 */
            draggable={false}
          />
        ))}
      </div>

      {many && (
        <>
          {/* 一眼看得出「這張卡還有別的照片」，不然使用者不會想到要滑 */}
          <div className={styles.counter} aria-hidden="true">
            {index + 1}/{photos.length}
          </div>

          <button
            type="button"
            className={`${styles.arrow} ${styles.arrowPrev}`}
            aria-label="上一張照片"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
          >
            ‹
          </button>
          <button
            type="button"
            className={`${styles.arrow} ${styles.arrowNext}`}
            aria-label="下一張照片"
            onClick={() => goTo(index + 1)}
            disabled={index === photos.length - 1}
          >
            ›
          </button>

          <div className={styles.dots} role="group" aria-label="切換照片">
            {photos.map((file, i) => (
              <button
                key={file}
                type="button"
                className={i === index ? `${styles.dot} ${styles.dotOn}` : styles.dot}
                aria-label={`看第 ${i + 1} 張照片`}
                aria-current={i === index}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
