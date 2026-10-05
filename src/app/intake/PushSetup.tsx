"use client";
/**
 * 同事的手機通知（Web Push）—— 2026-10-05 他說「同事的客戶預約通知改手機通知，不綁我的官方 line 了」。
 * 客人預約成立時伺服器直接推到這支手機，內容不經官方帳號、不經本人（lib/match/push.ts）。
 *
 * 流程：註冊 /sw.js（scope 只有 /intake）→ 看這支手機訂過沒 → 沒訂就給「開啟手機通知」那顆按鈕
 *       → 按了才要權限（瀏覽器規定一定要在按鈕裡要）→ 訂閱 → 把訂閱資料交給伺服器存。
 * iPhone 的規矩（iOS 16.4 起）：Safari 裡直接開**沒有**這個功能，一定要「加到主畫面」、從主畫面的圖示開；
 * 所以 iPhone 沒裝到主畫面時這裡只講怎麼裝。Android Chrome 沒這限制。
 */
import { useEffect, useRef, useState } from "react";
import { intakeSubscribePushAction, intakeTestPushAction, intakeUnsubscribePushAction } from "@/lib/actions/intake";

type Styles = { readonly [key: string]: string };
type State = "checking" | "unsupported" | "need-install" | "denied" | "off" | "on";

/** VAPID 公鑰（base64url）→ ArrayBuffer，給 pushManager.subscribe 用 */
function keyToBuffer(base64url: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

const isIOS = (): boolean => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = (): boolean =>
  (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

export default function PushSetup({ intakeKey, publicKey, styles }: { intakeKey: string; publicKey: string; styles: Styles }) {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const reg = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!publicKey) {
        setState("unsupported");
        setMsg("通知服務暫時沒準備好，等一下再開一次這頁。");
        return;
      }
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(isIOS() && !isStandalone() ? "need-install" : "unsupported");
        return;
      }
      try {
        const r = await navigator.serviceWorker.register("/sw.js", { scope: "/intake" });
        reg.current = r;
        const sub = await r.pushManager.getSubscription();
        if (cancelled) return;
        if (sub) {
          // 伺服器那邊可能沒有這一筆（例如資料清過），順手再登記一次，失敗也不吵
          void intakeSubscribePushAction(intakeKey, sub.toJSON(), navigator.userAgent).catch(() => {});
          setState("on");
        } else if (Notification.permission === "denied") {
          setState("denied");
        } else {
          setState("off");
        }
      } catch (e) {
        if (cancelled) return;
        setState("unsupported");
        setMsg(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [intakeKey, publicKey]);

  async function enable() {
    const r = reg.current;
    if (!r) return;
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        setMsg(perm === "denied" ? "你按了不允許。要改的話到手機的設定裡打開這個 App 的通知。" : "沒有允許通知，所以沒開。");
        return;
      }
      const sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBuffer(publicKey) });
      const res = await intakeSubscribePushAction(intakeKey, sub.toJSON(), navigator.userAgent);
      if (!res.ok) {
        await sub.unsubscribe().catch(() => {});
        setMsg(res.error);
        return;
      }
      setState("on");
      setMsg("開好了。按「傳一則測試通知」看看手機有沒有跳出來。");
    } catch (e) {
      setMsg(`開不起來：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    const r = reg.current;
    if (!r) return;
    setBusy(true);
    setMsg(null);
    try {
      const sub = await r.pushManager.getSubscription();
      if (sub) {
        await intakeUnsubscribePushAction(intakeKey, sub.endpoint).catch(() => {});
        await sub.unsubscribe();
      }
      setState("off");
      setMsg("這支手機不會再收到通知了。");
    } catch (e) {
      setMsg(`關不掉：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    const res = await intakeTestPushAction(intakeKey);
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    setMsg(res.sent > 0 ? `已送出 ${res.sent} 則，幾秒內會跳出來。${res.removed ? `（有 ${res.removed} 支手機已失效，已移除）` : ""}` : "沒有可以送的手機，先按「開啟手機通知」。");
  }

  return (
    <div className={styles.card}>
      <p className={styles.sectionTitle}>新預約的手機通知</p>
      {msg && <p className={styles.msg}>{msg}</p>}
      {state === "checking" && <p className={styles.muted}>檢查中…</p>}
      {state === "need-install" && (
        <p className={styles.muted}>
          iPhone 要先把這一頁「加到主畫面」，再從主畫面的圖示打開，才能開通知：
          <br />
          Safari 下面的「分享」→「加入主畫面」→ 回到主畫面點「買方建檔」→ 再回到這裡按「開啟手機通知」。
          <br />
          （iOS 16.4 以上才有這個功能）
        </p>
      )}
      {state === "unsupported" && <p className={styles.muted}>這個瀏覽器不支援手機通知。手機請用 Safari（iPhone）或 Chrome（Android）打開。</p>}
      {state === "denied" && <p className={styles.muted}>通知被關掉了。到手機的「設定 → 通知」找「買方建檔」打開，再回來重新整理這一頁。</p>}
      {state === "off" && (
        <>
          <p className={styles.muted}>開了之後，你的客人一按「預約看屋」，這支手機就會跳出通知（不經過官方帳號、也不經過別人）。</p>
          <div className={styles.actions}>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={enable} disabled={busy}>
              {busy ? "開啟中…" : "開啟手機通知"}
            </button>
          </div>
        </>
      )}
      {state === "on" && (
        <>
          <p className={styles.muted}>✅ 這支手機會收到新預約通知。</p>
          <div className={styles.actions}>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={test} disabled={busy}>
              {busy ? "送出中…" : "傳一則測試通知"}
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={disable} disabled={busy}>
              關閉通知
            </button>
          </div>
        </>
      )}
    </div>
  );
}
