"use client";
/**
 * 買方詳情：這個人是誰、他要什麼、目前有哪幾間符合、怎麼把結果傳給他。
 *
 * 「傳給客戶」與物件清單是跟手機快速建檔共用的元件（ShareToBuyer／MatchList）。
 * 編輯是把表單展開在原地，存好 refresh；刪除只有在名下沒預約時才會成功。
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CHIP, type ChipTone } from "@/app/admin/_components/cis";
import MatchList from "@/app/match/MatchList";
import ShareToBuyer from "@/app/match/ShareToBuyer";
import type { ApiPreference, MatchMeta } from "@/app/match/preference-state";
import { deleteBuyerAction, pushMatchesToBuyerAction } from "@/lib/actions/match";
import type { BuyerBrief } from "@/lib/match/intake";
import AdminBuyerForm from "./AdminBuyerForm";
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
};

function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  const c = CHIP[tone];
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
      {children}
    </span>
  );
}

export default function BuyerDetail({ buyer, brief, meta }: { buyer: DetailBuyer; brief: BuyerBrief; meta: MatchMeta }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 新建時電話撞到既有資料、被合併進來的，提醒一聲（網址上的 merged=1 由 AdminBuyerForm 帶過來）
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("merged") === "1") {
      setFlash("這支電話原本就有資料（可能是客戶自己在網站留過條件），已經合併更新到同一筆。");
      p.delete("merged");
      const rest = p.toString();
      window.history.replaceState(null, "", rest ? `${window.location.pathname}?${rest}` : window.location.pathname);
    }
  }, []);

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

  return (
    <div className={styles.wrap}>
      <Link className={styles.back} href="/admin/match?tab=buyers">
        ← 買方配對
      </Link>

      {flash && <p className={styles.msg}>{flash}</p>}

      {editing ? (
        <AdminBuyerForm meta={meta} buyer={{ id: buyer.id, name: buyer.name, phone: buyer.phone, note: buyer.note, preference: buyer.preference }} onDone={() => setEditing(false)} />
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
            <p className={styles.summary}>{brief.summary ?? "還沒填條件 —— 按「編輯」補上，才配得出物件。"}</p>
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
            <ShareToBuyer
              styles={styles}
              buyerName={buyer.name}
              link={brief.link}
              message={brief.message}
              matched={brief.matched}
              canPush={buyer.linked && buyer.followed}
              onPush={() => pushMatchesToBuyerAction(buyer.id)}
            />
          </div>

          <div className={styles.card}>
            <p className={styles.sectionTitle}>配對結果</p>
            <MatchList styles={styles} matches={brief.matches} matched={brief.matched} total={brief.total} hasPreference={Boolean(buyer.preference)} />
          </div>
        </>
      )}
    </div>
  );
}
