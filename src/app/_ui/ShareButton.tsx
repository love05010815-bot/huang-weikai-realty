"use client";
/**
 * 📤 「分享給朋友」—— 精選好案與物件快搜的每一戶都有（2026-10-20 系統擁有者：
 * 「客人進到這個網站、看到這個物件，就可以分享給他的親朋好友」）。
 *
 * 手機：叫出系統的分享面板（LINE、Messenger、簡訊…都在裡面），這是 navigator.share。
 * 電腦（沒有分享面板）：把「一句話＋連結」複製到剪貼簿，按鈕旁邊寫「已複製」；連剪貼簿都不給就把連結印出來讓他自己選。
 * 分享的是**我們自己網站**的連結（path），不是太平洋官網 —— 朋友點進來看到的還是這裡。
 *
 * 樣式由呼叫端給 className（卡片上就長得跟旁邊那顆一樣），這裡只處理行為。
 */
import { useState } from "react";

export default function ShareButton({
  path,
  title,
  text,
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
  className?: string;
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

  return (
    <>
      <button type="button" className={className} style={style} onClick={share} aria-label={`分享「${title}」給朋友`} {...rest}>
        {label}
      </button>
      {msg && (
        <span role="status" style={{ display: "block", fontSize: 12.5, lineHeight: 1.5, color: "var(--muted, #5B6B73)", wordBreak: "break-all", marginTop: 4 }}>
          {msg}
        </span>
      )}
    </>
  );
}
