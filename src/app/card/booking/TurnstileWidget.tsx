"use client";

/**
 * Cloudflare Turnstile 人機驗證 widget。
 *
 * 🔴 為什麼一定要有這個檔案：
 *    伺服器端的 verifyAppointmentTurnstile 邏輯是「沒設密鑰就放行、有設密鑰但收不到
 *    token 就擋下」。模板只寫了伺服器端那一半，前端完全沒有產生 token 的元件——
 *    也就是說只要把 TURNSTILE_SECRET_KEY 填進環境變數，每一筆預約都會被擋掉。
 *
 * 設計原則：沒設 NEXT_PUBLIC_TURNSTILE_SITE_KEY 時完全不渲染、不載入任何腳本，
 * 行為跟沒有這個元件時一模一樣，所以先上線也不會影響現況。
 */
import { useEffect, useId, useRef } from "react";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      theme?: "light" | "dark" | "auto";
      language?: string;
    },
  ) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

/** 腳本只載入一次，重複掛載元件不會重複插 <script>。 */
function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("turnstile_script_failed")));
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("turnstile_script_failed"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

export default function TurnstileWidget({
  onToken,
  resetSignal = 0,
}: {
  /** 拿到 token 時回傳；過期或出錯時回傳空字串，讓表單知道要重新驗證。 */
  onToken: (token: string) => void;
  /**
   * 這個數字一變就重新驗證。
   * Turnstile 的 token 是一次性的：只要送出失敗過一次（時段被搶走、網路斷線…），
   * 舊 token 就作廢了，不重置的話客戶會永遠卡在「請先完成人機驗證」。
   */
  resetSignal?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const domId = useId();

  // 用 ref 保存 callback，避免 onToken 每次 render 換 reference 就重畫 widget。
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        if (widgetIdRef.current) return; // React 18 StrictMode 會跑兩次，別畫兩個
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(""),
          "error-callback": () => onTokenRef.current(""),
          theme: "light",
          language: "zh-TW",
        });
      })
      .catch((error) => {
        console.error("[turnstile] 載入失敗:", error);
        onTokenRef.current("");
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // widget 已被移除就算了，不值得為此炸掉整個表單
        }
        widgetIdRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!resetSignal || !widgetIdRef.current || !window.turnstile) return;
    try {
      window.turnstile.reset(widgetIdRef.current);
      onTokenRef.current("");
    } catch (error) {
      console.error("[turnstile] reset 失敗:", error);
    }
  }, [resetSignal]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={containerRef} id={`turnstile-${domId}`} style={{ marginTop: 14 }} />;
}
