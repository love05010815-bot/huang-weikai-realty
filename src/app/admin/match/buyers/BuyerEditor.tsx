"use client";
/**
 * 買方表單（怎麼稱呼、電話、備註 ＋ 跟 /match 共用的條件表單）。
 *
 * 只負責畫表單、把填好的東西交給 onSave；**怎麼存、存完去哪**由外面決定：
 *   後台     → AdminBuyerForm：saveBuyerAction（看登入），存好跳詳情頁
 *   手機快速 → /intake 的 IntakeApp：intakeSaveAction（看金鑰），存好原地顯示結果
 * 樣式一樣用 styles 傳進來（後台深色、快速建檔淺色）。
 */
import { useState } from "react";
import PreferenceForm from "@/app/match/PreferenceForm";
import { EMPTY_PREF, toApiPreference, toPrefState, type ApiPreference, type MatchMeta, type PrefState } from "@/app/match/preference-state";

type Styles = { readonly [key: string]: string };

export type EditableBuyer = {
  id: string;
  name: string;
  phone: string;
  note: string;
  preference: ApiPreference | null;
};

export type BuyerFormValues = {
  name: string;
  phone: string;
  note: string;
  preference: ReturnType<typeof toApiPreference>;
};

export default function BuyerEditor<R extends { ok: boolean; error?: string }>({
  meta,
  buyer,
  styles,
  onSave,
  afterSave,
  onCancel,
}: {
  meta: MatchMeta;
  /** 有 = 編輯這一筆；沒有 = 新建 */
  buyer?: EditableBuyer | null;
  styles: Styles;
  onSave: (id: string | null, values: BuyerFormValues) => Promise<R>;
  afterSave: (result: R) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(buyer?.name ?? "");
  const [phone, setPhone] = useState(buyer?.phone ?? "");
  const [note, setNote] = useState(buyer?.note ?? "");
  // 新建時縣市先幫他選好第一個（＝在售物件最多的那個，台中市），在外面少點一下才看得到行政區
  const [pref, setPref] = useState<PrefState>(() =>
    buyer?.preference ? toPrefState(buyer.preference) : { ...EMPTY_PREF, city: meta.cities[0]?.city ?? "" },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await onSave(buyer?.id ?? null, { name, phone, note, preference: toApiPreference(pref) });
      if (!r.ok) {
        setError(r.error ?? "存檔失敗，請再試一次");
        return;
      }
      afterSave(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "存檔失敗，請再試一次");
    } finally {
      setBusy(false);
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
        {onCancel && (
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onCancel} disabled={busy}>
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
