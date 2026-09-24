"use client";
/**
 * 🎑 首頁的「中秋祝福影片」彈窗
 *
 * 2026-09-24 系統擁有者指定：跳出方式比照彈跳名片（CardPopup.tsx）——一打開首頁就跳出影片，
 * 客戶可以自己關閉，或影片播放完自動關閉。限時區塊，時間判斷在 page.tsx 的 isMidAutumnWindow()，
 * 算完當 `active` 傳進來，這支元件不重算時間（訪客端的時鐘不可信）。
 *
 * 行為細節（跟 CardPopup 對齊的部分）：
 *   ・只有首頁放（page.tsx）。同一次瀏覽只跳一次：sessionStorage 記一筆，同分頁換頁再回首頁、
 *     或重新整理都不再跳；分頁關掉才重置。
 *   ・×、點影片外面、Esc、影片播完（onEnded）都會關閉。
 *   ・打開時鎖住頁面捲動；關閉後還原。
 *   ・**刻意延後到彈跳名片那一套跑完才跳**（名片 500ms 開＋5000ms 倒數＋380ms 收合 ≈ 5.9s），
 *     兩個自動彈窗不會疊在一起搶畫面。
 *   ・有語音，所以不強制靜音自動播放（靜音播放等於沒講話，失去意義）——嘗試正常音量自動播放，
 *     多數瀏覽器第一次會擋，擋下來就留原生控制列讓訪客自己按，不是壞掉。
 *
 * 跟 CardPopup 不同、刻意簡化的地方：沒有「收起變小按鈕」——使用者只要求「關閉」或「播完自動關閉」，
 * 沒有要保留重新打開的入口，關掉就是關掉了。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { OWNER } from "@/config/owner";
import styles from "./MidAutumnVideoPopup.module.css";

/** 頁面載入後延遲多久跳出：晚於彈跳名片整套跑完（500+5000+380ms），兩個彈窗才不會疊在一起 */
const OPEN_DELAY_MS = 6200;

/** sessionStorage 的鍵：這次瀏覽已經跳過影片了。想讓大家再看一次就換版號 */
const SEEN_KEY = "mid-autumn-video-popup-seen-v1";

export default function MidAutumnVideoPopup({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // 載入後延遲跳出 —— 這次瀏覽已經跳過的話就不再跳
  useEffect(() => {
    if (!active) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* 無痕／封鎖儲存：當作沒看過，照跳 */
    }
    if (seen) return;
    const t = setTimeout(() => {
      setOpen(true);
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* 存不進去就每次都跳，沒別的壞處 */
      }
    }, OPEN_DELAY_MS);
    return () => clearTimeout(t);
  }, [active]);

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

  if (!active || !open) return null;

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
