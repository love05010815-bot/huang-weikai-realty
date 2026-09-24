"use client";
/**
 * 🎑 首頁「中秋祝福影片」彈窗本體
 *
 * 這支只管一件事：掛載後延遲一下自動打開、播放、以及 ×／點外面／Esc／播完（onEnded）
 * 四種方式關閉時呼叫 onDone()。要不要顯示、這次瀏覽跳不跳過、跟彈跳名片的先後順序，
 * 都交給呼叫端 _ui/HomePopups.tsx 排——2026-09-24 系統擁有者指定順序「先跳出影片
 * 再跳出名片」，所以名片（CardPopup）要等這支的 onDone 觸發才掛載，時間序不是這支的責任。
 *
 * 視覺語言（遮罩、對話框、關閉鈕動畫）比照既有的 _ui/CardPopup.tsx，但對話框改窄配合
 * 直式 9:16 影片，且刻意不做「收起變小按鈕」——關掉或播完就是關掉了，不留重新打開的入口。
 *
 * 有語音，所以不強制靜音自動播放（靜音播放等於沒講話，失去意義）——嘗試正常音量自動
 * 播放，多數瀏覽器第一次會擋，擋下來就留原生控制列讓訪客自己按，不是壞掉。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { OWNER } from "@/config/owner";
import styles from "./MidAutumnVideoPopup.module.css";

/** 頁面載入後延遲多久跳出，跟彈跳名片原本的開場延遲一致，讓首屏先畫完 */
const OPEN_DELAY_MS = 500;

export default function MidAutumnVideoPopup({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    onDone();
  }, [onDone]);

  useEffect(() => {
    const t = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  // 打開時鎖住頁面捲動、Esc 關閉、焦點放到 ×、嘗試自動播放
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    closeBtnRef.current?.focus({ preventScroll: true });
    // 有聲音的自動播放大多會被瀏覽器擋下來，擋下來就留原生控制列讓訪客自己按，不用特別處理失敗。
    videoRef.current?.play().catch(() => {});
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={close} role="presentation">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={`${OWNER.name}中秋祝福影片`}
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeBtnRef} type="button" className={styles.close} onClick={close} aria-label="關閉">
          ×
        </button>
        <video
          ref={videoRef}
          className={styles.video}
          src="/videos/mid-autumn-2026.mp4"
          poster="/videos/mid-autumn-2026-poster.jpg"
          controls
          playsInline
          preload="auto"
          onEnded={close}
        />
        <p className={styles.caption}>🎑 {OWNER.name}祝您中秋佳節愉快，闔家團圓。</p>
      </div>
    </div>
  );
}
