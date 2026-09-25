"use client";
/**
 * 買方詳情：這個人是誰、他要什麼、目前有哪幾間符合、怎麼把結果傳給他。
 *
 * 「傳給客戶」有三條路，貴的放後面：
 *   1. 複製訊息／用 LINE 傳送 —— 免費。訊息裡是他專屬的配對連結（帶識別碼），
 *      客戶點開直接看到物件、可以直接預約；之後他改條件也寫回同一筆。
 *   2. 官方帳號推播物件卡 —— **計費一則**，而且只有綁了 LINE 的買方推得到。按之前會再問一次。
 *
 * 編輯是把 BuyerEditor 展開在原地，存好 refresh；刪除只有在名下沒預約時才會成功。
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CHIP, type ChipTone } from "@/app/admin/_components/cis";
import type { ApiPreference, MatchMeta } from "@/app/match/preference-state";
import { deleteBuyerAction, pushMatchesToBuyerAction } from "@/lib/actions/match";
import BuyerEditor from "./BuyerEditor";
import styles from "./buyer-form.module.css";

export type DetailBuyer = {
  id: string;
  name: string;
  phone: string;
  note: string;
  displayName: string | null;
  linked: boolean;
  followed: boolean;
  notify: boolean;
  preference: ApiPreference | null;
  summary: string | null;
  updatedAt: string | null;
};

export type DetailMatch = {
  id: string;
  title: string;
  price: number;
  meta: string;
  sourceUrl: string;
  image: string | null;
};

function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  const c = CHIP[tone];
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
      {children}
    </span>
  );
}

const money = (n: number) => `${Number(n).toLocaleString("zh-TW")} 萬`;

export default function BuyerDetail({
  buyer,
  matches,
  matched,
  total,
  link,
  message,
  meta,
}: {
  buyer: DetailBuyer;
  matches: DetailMatch[];
  /** 符合的總數；matches 只有前幾十筆 */
  matched: number;
  /** 目前在售總數 */
  total: number;
  /** 這位買方專屬的配對連結；簽章密鑰沒設時是 null */
  link: string | null;
  /** 建議傳給客戶的訊息（可以改） */
  message: string;
  meta: MatchMeta;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState(message);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 新建時電話撞到既有資料、被合併進來的，提醒一聲（網址上的 merged=1 由 BuyerEditor 帶過來）
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("merged") === "1") {
      setFlash("這支電話原本就有資料（可能是客戶自己在網站留過條件），已經合併更新到同一筆。");
      p.delete("merged");
      const rest = p.toString();
      window.history.replaceState(null, "", rest ? `${window.location.pathname}?${rest}` : window.location.pathname);
    }
  }, []);

  async function copy(textToCopy: string, label: string) {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setFlash(`${label}已複製，貼到 LINE 或簡訊給客戶就好。`);
    } catch {
      setFlash("這個瀏覽器不讓我複製，請長按下面的文字自己複製。");
    }
  }

  async function pushCards() {
    if (!window.confirm("會從官方帳號推播一則物件卡給這位買方（用掉 1 則推播額度）。確定？")) return;
    setBusy(true);
    setFlash(null);
    const r = await pushMatchesToBuyerAction(buyer.id);
    setBusy(false);
    setFlash(r.ok ? `已從官方帳號推播 ${r.count} 間物件給 ${buyer.name}。` : r.error ?? "推播失敗");
  }

  async function remove() {
    if (!window.confirm(`確定刪掉「${buyer.name}」這筆買方？名下有預約的話不會刪。`)) return;
    setBusy(true);
    const r = await deleteBuyerAction(buyer.id);
    setBusy(false);
    if (!r.ok) {
      setFlash(r.error ?? "刪除失敗");
      return;
    }
    router.push("/admin/match?tab=buyers");
  }

  const lineShare = `https://line.me/R/share?text=${encodeURIComponent(msg)}`;

  return (
    <div className={styles.wrap}>
      <Link className={styles.back} href="/admin/match?tab=buyers">
        ← 買方配對
      </Link>

      {flash && <p className={styles.msg}>{flash}</p>}

      {editing ? (
        <BuyerEditor
          meta={meta}
          buyer={{ id: buyer.id, name: buyer.name, phone: buyer.phone, note: buyer.note, preference: buyer.preference }}
          onDone={() => setEditing(false)}
        />
      ) : (
        <>
          <div className={styles.card}>
            <h1 className={styles.name}>{buyer.name}</h1>
            <a className={styles.phone} href={`tel:${buyer.phone}`}>
              {buyer.phone}
            </a>
            <div className={styles.chipRow}>
              {buyer.linked ? <Chip tone={buyer.followed ? "success" : "warn"}>✔ LINE {buyer.displayName ?? "已綁定"}</Chip> : <Chip tone="neutral">未綁定 LINE</Chip>}
              {buyer.linked && !buyer.followed && <Chip tone="warn">已封鎖</Chip>}
              {buyer.linked && buyer.followed && !buyer.notify && <Chip tone="neutral">已關閉通知</Chip>}
            </div>
            {buyer.note && <p className={styles.note}>{buyer.note}</p>}
            <p className={styles.sectionTitle} style={{ marginTop: 14 }}>
              購屋需求
            </p>
            <p className={styles.summary}>{buyer.summary ?? "還沒填條件 —— 按「編輯」補上，才配得出物件。"}</p>
            <div className={styles.actions}>
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setEditing(true)}>
                編輯
              </button>
              <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={remove} disabled={busy}>
                刪除
              </button>
            </div>
          </div>

          <div className={styles.card}>
            <p className={styles.sectionTitle}>傳給客戶</p>
            {link ? (
              <>
                <p className={styles.muted}>
                  客戶點開這個連結就直接看到依他條件配好的物件，可以直接預約看屋；之後改條件也會寫回這一筆。
                  訊息可以先改再傳。
                </p>
                <textarea className={styles.textarea} value={msg} onChange={(e) => setMsg(e.target.value)} rows={5} />
                <div className={styles.actions}>
                  <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => copy(msg, "訊息")}>
                    複製訊息
                  </button>
                  <a className={`${styles.btn} ${styles.btnLine}`} href={lineShare} target="_blank" rel="noopener noreferrer">
                    用 LINE 傳送
                  </a>
                  <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => copy(link, "連結")}>
                    只複製連結
                  </button>
                  <a className={`${styles.btn} ${styles.btnGhost}`} href={link} target="_blank" rel="noopener noreferrer">
                    看客戶會看到的頁面
                  </a>
                </div>
                {buyer.linked && buyer.followed && (
                  <div className={styles.actions}>
                    <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={pushCards} disabled={busy || matched === 0}>
                      從官方帳號推播物件卡（計費 1 則）
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className={styles.error}>簽章密鑰（APPOINTMENT_TOKEN_SECRET）沒設，產生不了客戶專屬連結。</p>
            )}
          </div>

          <div className={styles.card}>
            <p className={styles.sectionTitle}>配對結果</p>
            {!buyer.preference ? (
              <p className={styles.muted}>還沒有條件。</p>
            ) : matched === 0 ? (
              <p className={styles.muted}>
                目前在售的 {total} 間裡沒有完全符合的。可以放寬一項再看，或先這樣存著 —— 有新物件符合時，綁了 LINE 的買方會自動收到通知。
              </p>
            ) : (
              <>
                <p className={styles.muted}>
                  符合條件的物件 {matched} 間{matched > matches.length ? `，這裡先列前 ${matches.length} 間` : ""}（依價格由低到高）
                </p>
                <div className={styles.list}>
                  {matches.map((m) => (
                    <div key={m.id} className={styles.item}>
                      {m.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className={styles.thumb} src={m.image} alt="" loading="lazy" />
                      ) : (
                        <div className={styles.thumbEmpty} />
                      )}
                      <div>
                        <p className={styles.itemTitle}>{m.title}</p>
                        <p className={styles.price}>{money(m.price)}</p>
                        <p className={styles.meta}>{m.meta}</p>
                        {m.sourceUrl && (
                          <a className={styles.itemLink} href={m.sourceUrl} target="_blank" rel="noopener noreferrer">
                            店網物件頁 →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
