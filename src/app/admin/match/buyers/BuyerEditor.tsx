"use client";
/**
 * 代客建檔／編輯買方 —— 他在外面接到買方來電時，用手機把人跟需求記下來的表單。
 *
 * 條件欄位是跟 /match 共用的 PreferenceForm（這裡套深色樣式），所以他在這裡幫客戶勾的，
 * 跟客戶自己點開連結看到的是同一組選項、同一套配對規則。存檔走 server action。
 *
 * 新建存好直接跳到那位買方的詳情頁（配對結果與「傳給客戶」都在那裡）；
 * 編輯存好留在原地，由外面的詳情頁 refresh。
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import PreferenceForm from "@/app/match/PreferenceForm";
import { EMPTY_PREF, toApiPreference, toPrefState, type ApiPreference, type MatchMeta, type PrefState } from "@/app/match/preference-state";
import { saveBuyerAction } from "@/lib/actions/match";
import styles from "./buyer-form.module.css";

export type EditableBuyer = {
  id: string;
  name: string;
  phone: string;
  note: string;
  preference: ApiPreference | null;
};

export default function BuyerEditor({ meta, buyer, onDone }: { meta: MatchMeta; buyer?: EditableBuyer | null; onDone?: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(buyer?.name ?? "");
  const [phone, setPhone] = useState(buyer?.phone ?? "");
  const [note, setNote] = useState(buyer?.note ?? "");
  // 新建時縣市先幫他選好第一個（＝在售物件最多的那個，台中市），少點一下才看得到行政區
  const [pref, setPref] = useState<PrefState>(() =>
    buyer?.preference ? toPrefState(buyer.preference) : { ...EMPTY_PREF, city: meta.cities[0]?.city ?? "" },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await saveBuyerAction(buyer?.id ?? null, { name, phone, note, preference: toApiPreference(pref) });
    setBusy(false);
    if (!r.ok || !r.id) {
      setError(r.error ?? "存檔失敗，請再試一次");
      return;
    }
    if (buyer) {
      router.refresh();
      onDone?.();
    } else {
      router.push(`/admin/match/buyers/${r.id}${r.merged ? "?merged=1" : ""}`);
    }
  }

  return (
    <form className={styles.wrap} onSubmit={onSubmit} noValidate>
      <div className={styles.card}>
        <label className={styles.field}>
          怎麼稱呼
          <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：王先生、陳小姐" autoComplete="off" />
        </label>
        <label className={styles.field}>
          電話
          <input className={styles.input} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0912345678" autoComplete="off" />
        </label>
        <label className={styles.field}>
          備註（只有你看得到）
          <textarea className={styles.textarea} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：自備款 300、週末才能看、想離娘家近" />
        </label>
      </div>

      <div className={styles.card}>
        <p className={styles.sectionTitle}>購屋需求</p>
        <PreferenceForm meta={meta} value={pref} onChange={setPref} styles={styles} />
      </div>

      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.stickyBar}>
        {onDone && (
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onDone} disabled={busy}>
            取消
          </button>
        )}
        <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy}>
          {busy ? "存檔中…" : buyer ? "儲存" : "存檔，看配對結果"}
        </button>
      </div>
    </form>
  );
}
