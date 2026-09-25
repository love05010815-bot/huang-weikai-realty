"use client";
/**
 * 「傳給客戶」那一塊 —— 後台買方詳情與手機快速建檔共用。
 *
 * 三條路，貴的放後面：
 *   複製訊息／用 LINE 傳送 —— 免費。訊息裡是客戶專屬的配對連結，點開直接看物件、可直接預約。
 *   只複製連結／看客戶會看到的頁面 —— 給他先檢查用。
 *   從官方帳號推播物件卡 —— **計費一則**，只有綁了 LINE 的買方推得到，按之前 confirm 一次。
 *
 * 「用 LINE 傳送」走 line.me/R/share，**手機才會跳 LINE**，電腦會被導去 LINE 官網（跟 QR 那次同一個原因）。
 * 樣式用 styles 傳進來（後台深色、快速建檔淺色），用到：muted / textarea / actions / btn / btnPrimary / btnLine / btnGhost / msg / error
 */
import { useState } from "react";

type Styles = { readonly [key: string]: string };

export default function ShareToBuyer({
  styles,
  buyerName,
  link,
  message,
  matched,
  canPush,
  onPush,
}: {
  styles: Styles;
  buyerName: string;
  link: string | null;
  message: string;
  matched: number;
  /** 買方有綁 LINE 而且還是好友，才有推播那顆按鈕 */
  canPush: boolean;
  onPush?: () => Promise<{ ok: boolean; error?: string; count?: number }>;
}) {
  const [msg, setMsg] = useState(message);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function copy(textToCopy: string, label: string) {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setFlash(`${label}已複製，貼到 LINE 或簡訊給客戶就好。`);
    } catch {
      setFlash("這個瀏覽器不讓我複製，請長按上面的文字自己複製。");
    }
  }

  async function push() {
    if (!onPush) return;
    if (!window.confirm("會從官方帳號推播一則物件卡給這位買方（用掉 1 則推播額度）。確定？")) return;
    setBusy(true);
    setFlash(null);
    const r = await onPush();
    setBusy(false);
    setFlash(r.ok ? `已從官方帳號推播 ${r.count} 間物件給 ${buyerName}。` : (r.error ?? "推播失敗"));
  }

  if (!link) {
    return <p className={styles.error}>簽章密鑰（APPOINTMENT_TOKEN_SECRET）沒設，產生不了客戶專屬連結。</p>;
  }

  return (
    <>
      {flash && <p className={styles.msg}>{flash}</p>}
      <p className={styles.muted}>客戶點開這個連結就直接看到依他條件配好的物件，可以直接預約看屋；之後改條件也會寫回這一筆。訊息可以先改再傳。</p>
      <textarea className={styles.textarea} value={msg} onChange={(e) => setMsg(e.target.value)} rows={5} />
      <div className={styles.actions}>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => copy(msg, "訊息")}>
          複製訊息
        </button>
        <a className={`${styles.btn} ${styles.btnLine}`} href={`https://line.me/R/share?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer">
          用 LINE 傳送
        </a>
        <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => copy(link, "連結")}>
          只複製連結
        </button>
        <a className={`${styles.btn} ${styles.btnGhost}`} href={link} target="_blank" rel="noopener noreferrer">
          看客戶會看到的頁面
        </a>
      </div>
      {canPush && onPush && (
        <div className={styles.actions}>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={push} disabled={busy || matched === 0}>
            從官方帳號推播物件卡（計費 1 則）
          </button>
        </div>
      )}
    </>
  );
}
