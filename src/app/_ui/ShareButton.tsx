"use client";
/**
 * 📤 「分享」—— 精選好案與物件快搜的每一戶都有（2026-10-20 系統擁有者：
 * 「客人進到這個網站、看到這個物件，就可以分享給他的親朋好友」；同日改成
 * 「分享的功能坐在圖片右上方以圖示呈現」—— 所以預設是疊在照片右上角的圓形圖示，跟左上角的 ❤️ 收藏同一款）。
 *
 * 手機：叫出系統的分享面板（LINE、Messenger、簡訊…都在裡面），這是 navigator.share。
 * 電腦（沒有分享面板）：把「一句話＋連結」複製到剪貼簿，圖示下面浮一個「連結已複製」；連剪貼簿都不給就把連結印出來讓他自己選。
 * 分享的是**我們自己網站**的連結（path），不是太平洋官網 —— 朋友點進來看到的還是這裡。
 *
 * variant="icon"（預設）：36px 圓鈕＋分享圖示，位置由呼叫端的 className 決定（.onPhotoRight 在 ShareButton.module.css）。
 * variant="text"：純文字按鈕，樣式全由呼叫端的 className 給，這裡只處理行為。
 */
import { useState } from "react";
import styles from "./ShareButton.module.css";

export default function ShareButton({
  path,
  title,
  text,
  variant = "icon",
  className,
  label = "分享給朋友",
  style,
  ...rest
}: {
  /** 站內路徑（例如 /listings/xxx 或 /match?book=S123），分享時接上目前的網域 */
  path: string;
  title: string;
  /** 分享面板／複製時帶的一句話（案名、區域、售價） */
  text: string;
  variant?: "icon" | "text";
  className?: string;
  /** 文字版的字；圖示版只用在 aria-label */
  label?: string;
  style?: React.CSSProperties;
} & Record<`data-${string}`, string | undefined>) {
  const [msg, setMsg] = useState<string | null>(null);

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    const payload = { title, text, url };
    try {
      if (typeof navigator.share === "function" && (typeof navigator.canShare !== "function" || navigator.canShare(payload))) {
        await navigator.share(payload);
        return;
      }
    } catch (e) {
      // 他自己按取消，不用再做別的
      if (e instanceof Error && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setMsg("連結已複製，貼給朋友就好");
    } catch {
      setMsg(url);
    }
    window.setTimeout(() => setMsg(null), 4000);
  }

  if (variant === "text") {
    return (
      <>
        <button type="button" className={className} style={style} onClick={share} aria-label={`分享「${title}」給朋友`} {...rest}>
          {label}
        </button>
        {msg && (
          <span role="status" className={styles.textMsg}>
            {msg}
          </span>
        )}
      </>
    );
  }

  return (
    <span className={className ? `${styles.wrap} ${className}` : styles.wrap} style={style}>
      <button type="button" className={styles.icon} onClick={share} aria-label={`分享「${title}」給朋友`} title="分享給朋友" {...rest}>
        {/* 三個點連起來的「分享」符號（Android／網頁通用款） */}
        <svg className={styles.svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
          <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
        </svg>
      </button>
      {msg && (
        <span role="status" className={styles.toast}>
          {msg}
        </span>
      )}
    </span>
  );
}
