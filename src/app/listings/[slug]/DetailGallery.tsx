"use client";

/**
 * 單戶物件頁的相簿（2026-10-20 新版單戶頁）：大圖 ＋ 縮圖列 ＋ 點大圖放大（燈箱）。
 *
 * 跟清單卡片的 PhotoCarousel 刻意不同：卡片要的是「滑一下看第二張」，這裡要的是「一張一張仔細看」——
 * 所以大圖固定一張、縮圖點哪張就換哪張、點大圖開全螢幕燈箱（鍵盤 ← → 換張、Esc 關）。
 * 手機在大圖上左右滑也能換張（簡單的 touch 位移判斷，40px 以上才算滑）。
 *
 * 照片來源由頁面決定（後台自己傳的優先、沒有才用官網的），這裡只管顯示。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { resolvePhotoSrc } from "@/lib/photo-src";
import g from "./DetailGallery.module.css";

type Props = {
  photos: string[];
  /** 「行政區・社區－標題」 */
  alt: string;
};

export default function DetailGallery({ photos, alt }: Props) {
  const n = photos.length;
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const thumbsRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);

  // 循環：最後一張再按下一張回到第一張（燈箱裡一直按右鍵不會卡住）
  const go = useCallback((i: number) => setIndex(n > 0 ? ((i % n) + n) % n : 0), [n]);

  // 縮圖列跟著目前那張捲（block:"nearest" 不會把整頁往上拉）
  useEffect(() => {
    const el = thumbsRef.current?.children[index] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [index]);

  // 燈箱開著：鍵盤換張／關閉，並鎖住底下的頁面不要跟著捲
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      else if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, index, go]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchX.current;
    touchX.current = null;
    if (start === null || n < 2) return;
    const dx = (e.changedTouches[0]?.clientX ?? start) - start;
    if (dx <= -40) go(index + 1);
    else if (dx >= 40) go(index - 1);
  };

  if (n === 0) {
    return (
      <div className={g.placeholder} aria-label="照片準備中">
        <span>🏠</span>
        <span>照片準備中</span>
      </div>
    );
  }

  const current = resolvePhotoSrc(photos[index]);
  const currentAlt = index === 0 ? alt : `${alt}（照片 ${index + 1}）`;

  return (
    <div className={g.gallery}>
      <div className={g.stage} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <button type="button" className={g.stageBtn} onClick={() => setOpen(true)} aria-label="放大看這張照片">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={g.stageImg} src={current} alt={currentAlt} width={1200} height={800} loading="eager" draggable={false} />
        </button>
        <span className={g.zoomHint} aria-hidden="true">
          點照片放大
        </span>
        {n > 1 && (
          <>
            <div className={g.counter} aria-live="polite">
              {index + 1} / {n}
            </div>
            <button type="button" className={`${g.arrow} ${g.prev}`} aria-label="上一張照片" onClick={() => go(index - 1)}>
              ‹
            </button>
            <button type="button" className={`${g.arrow} ${g.next}`} aria-label="下一張照片" onClick={() => go(index + 1)}>
              ›
            </button>
          </>
        )}
      </div>

      {n > 1 && (
        <div className={g.thumbs} ref={thumbsRef} role="tablist" aria-label="照片縮圖">
          {photos.map((file, i) => (
            <button
              key={file}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`看第 ${i + 1} 張照片`}
              className={i === index ? `${g.thumb} ${g.thumbOn}` : g.thumb}
              onClick={() => go(i)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolvePhotoSrc(file)} alt="" width={160} height={107} loading="lazy" draggable={false} />
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className={g.lightbox} role="dialog" aria-modal="true" aria-label="照片放大檢視" onClick={() => setOpen(false)}>
          <button type="button" className={g.close} aria-label="關閉" onClick={() => setOpen(false)}>
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={g.lightImg} src={current} alt={currentAlt} onClick={(e) => e.stopPropagation()} draggable={false} />
          {n > 1 && (
            <>
              <button
                type="button"
                className={`${g.lightArrow} ${g.lightPrev}`}
                aria-label="上一張照片"
                onClick={(e) => {
                  e.stopPropagation();
                  go(index - 1);
                }}
              >
                ‹
              </button>
              <button
                type="button"
                className={`${g.lightArrow} ${g.lightNext}`}
                aria-label="下一張照片"
                onClick={(e) => {
                  e.stopPropagation();
                  go(index + 1);
                }}
              >
                ›
              </button>
              <div className={g.lightCounter}>
                {index + 1} / {n}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
