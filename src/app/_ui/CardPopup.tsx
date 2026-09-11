"use client";
/**
 * 📇 首頁的「彈跳名片」
 *
 * 2026-09-11 系統擁有者指定（參考同業蘇揚哲的網站）：
 *   客戶一打開首頁 → 跳出小視窗顯示他的名片 → 5 秒後自動收起到頁面右上角，
 *   變成一顆「收下名片」的小按鈕，跟著頁面捲動（position: fixed）；點小按鈕可再打開。
 *
 * 行為細節：
 *   ・只有首頁放（page.tsx），每次整頁載入都會跳（沒有「看過就不再跳」的記憶，他要的是一打開就看到）。
 *     ⚠️ 若之後嫌煩要改成「一個瀏覽階段只跳一次」，用 sessionStorage 擋在 useEffect 那裡就好。
 *   ・倒數只在**自動跳出的那一次**跑；客戶自己按小按鈕打開的，不會再自動收（是他要看的）。
 *   ・點名片本體可暫停／繼續倒數（參考站的「點名片可暫停」）。
 *   ・×、點名片外面、Esc 都是收起（收成右上角的小按鈕，不是消失）。
 *   ・打開時鎖住頁面捲動；收起後還原。
 *   ・名片圖是他給的實體名片掃描檔 public/card/business-card-2026-09.jpg（1078×653）。
 *     換圖用新檔名（同名蓋檔會被瀏覽器快取繼續顯示舊圖）。
 *
 * 版面：
 *   ・對話框最寬 560px，手機 92vw；小按鈕固定在 header 下面靠右（top 用 CSS 變數 --card-chip-top，
 *     header 高度變了只改那一個數字）。
 *   ・z-index：遮罩 300（要蓋過 header 的 100 與右下角浮動 LINE 的 200），小按鈕 150（蓋內容、不蓋遮罩）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { OWNER, SOCIAL } from "@/config/owner";
import styles from "./CardPopup.module.css";

/** 自動跳出後幾秒收起（系統擁有者指定 5 秒） */
const AUTO_CLOSE_SECONDS = 5;
/** 頁面載入後延遲多久跳出（讓首屏先畫完，客戶看得出是「跳出來」而不是本來就在） */
const OPEN_DELAY_MS = 500;
/** 收起動畫（縮到右上角）的長度，要跟 CSS 的 shrink 動畫一致 */
const SHRINK_MS = 380;

const CARD_SRC = "/card/business-card-2026-09.jpg";
const CARD_ALT =
  `${OWNER.name}的名片：${OWNER.company} 海線幸福房仲團隊 副店長，2023–2025 連續三年仟萬經紀人員；` +
  `手機 ${OWNER.phone}、LINE ID show787865；梧棲新市鎮旗艦加盟店 (04)2657-2100，台中市梧棲區四維中路338號`;

type Phase = "hidden" | "open" | "closing" | "chip";

export default function CardPopup() {
  const [phase, setPhase] = useState<Phase>("hidden");
  /** 這次打開要不要倒數（只有自動跳出的那次要） */
  const [auto, setAuto] = useState(true);
  const [paused, setPaused] = useState(false);
  const [left, setLeft] = useState(AUTO_CLOSE_SECONDS);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const isOpen = phase === "open" || phase === "closing";

  /** 收起：先跑縮到右上角的動畫，再換成小按鈕 */
  const collapse = useCallback(() => {
    setPhase((p) => (p === "open" ? "closing" : p));
  }, []);

  // 載入後延遲跳出
  useEffect(() => {
    const t = setTimeout(() => setPhase("open"), OPEN_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  // closing → chip
  useEffect(() => {
    if (phase !== "closing") return;
    const t = setTimeout(() => setPhase("chip"), SHRINK_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // 倒數（只在自動跳出、沒暫停時走）
  useEffect(() => {
    if (phase !== "open" || !auto || paused) return;
    if (left <= 0) {
      collapse();
      return;
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, auto, paused, left, collapse]);

  // 打開時鎖住頁面捲動、Esc 收起、焦點放到 ×
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") collapse();
    };
    document.addEventListener("keydown", onKey);
    closeBtnRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, collapse]);

  /** 客戶自己按小按鈕打開：不倒數 */
  const reopen = () => {
    setAuto(false);
    setPaused(false);
    setPhase("open");
  };

  const hint = !auto
    ? "點右上角 ×、名片外面或按 Esc 收起"
    : paused
      ? "已暫停・再點一下名片繼續倒數"
      : `${left} 秒後收起・點名片可暫停`;

  return (
    <>
      {phase === "chip" && (
        <button type="button" className={styles.chip} onClick={reopen} aria-label={`打開${OWNER.name}的名片`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.chipThumb} src={CARD_SRC} alt="" width={1078} height={653} />
          {/* 長短兩句都渲染、CSS 切換：手機的小按鈕要 ≤ 85px 寬，不然會壓到置中的 banner 標題「台中海線的」 */}
          <span className={`${styles.chipText} ${styles.chipTextLong}`}>收下名片</span>
          <span className={`${styles.chipText} ${styles.chipTextShort}`}>名片</span>
        </button>
      )}

      {isOpen && (
        <div
          className={`${styles.backdrop} ${phase === "closing" ? styles.backdropOut : ""}`}
          onClick={collapse}
          role="presentation"
        >
          <div
            className={`${styles.dialog} ${phase === "closing" ? styles.dialogShrink : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={`${OWNER.name}的名片`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.head}>
              <span className={styles.title}>我的名片，先收著。</span>
              <button ref={closeBtnRef} type="button" className={styles.close} onClick={collapse} aria-label="收起名片">
                ×
              </button>
            </div>

            <button
              type="button"
              className={styles.cardBtn}
              onClick={() => auto && setPaused((p) => !p)}
              aria-pressed={auto ? paused : undefined}
              title={auto ? (paused ? "再點一下繼續倒數" : "點一下暫停倒數") : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.cardImg} src={CARD_SRC} alt={CARD_ALT} width={1078} height={653} />
            </button>

            <div className={styles.foot}>
              <span className={styles.hint} aria-live="polite">
                {hint}
              </span>
              <div className={styles.actions}>
                <a className={styles.lineBtn} href={SOCIAL.line} target="_blank" rel="noopener noreferrer">
                  加 LINE
                </a>
                <a className={styles.telBtn} href={`tel:${OWNER.phoneRaw}`}>
                  撥打電話
                </a>
              </div>
            </div>
            <div className={styles.legal}>
              {/* OWNER.title 本來就含公司名（太平洋房屋 梧棲新市鎮旗艦店 副店長），前面別再放 company，會重複 */}
              <span>
                {OWNER.name}｜{OWNER.title}
              </span>
              <Link className={styles.more} href="/card">
                完整名片頁 →
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
