"use client";
/**
 * 手機快速建檔的畫面：填一筆 → 原地看到符合幾間 → 傳給客戶 → 再記一位。
 *
 * 不換頁、不登入：金鑰跟著每一次 server action 一起送，伺服器那邊驗。
 * 表單（BuyerEditor）、傳給客戶（ShareToBuyer）、物件清單（MatchList）都跟後台共用，只換淺色樣式。
 */
import { useState } from "react";
import BuyerEditor from "@/app/admin/match/buyers/BuyerEditor";
import MatchList from "@/app/match/MatchList";
import matchStyles from "@/app/match/match.module.css";
import type { MatchMeta } from "@/app/match/preference-state";
import ShareToBuyer from "@/app/match/ShareToBuyer";
import { intakePushAction, intakeSaveAction, type IntakeSaveResult } from "@/lib/actions/intake";
import intakeStyles from "./intake.module.css";

/** 表單類的 class 用 /match 的淺色版，其餘（按鈕列、結果區）用這一頁自己的；同名以這一頁為準 */
const styles = { ...matchStyles, ...intakeStyles };

type Saved = Extract<IntakeSaveResult, { ok: true }>;

export default function IntakeApp({ intakeKey, meta }: { intakeKey: string; meta: MatchMeta }) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [editing, setEditing] = useState(false);

  const showForm = !saved || editing;

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <h1 className={styles.title}>代客建檔</h1>
        <p className={styles.sub}>{showForm ? "接到來電就記，存好直接看配對" : "存好了"}</p>
      </div>

      {showForm ? (
        <BuyerEditor
          key={saved?.buyer.id ?? "new"}
          meta={meta}
          styles={styles}
          buyer={editing && saved ? { id: saved.buyer.id, name: saved.buyer.name, phone: saved.buyer.phone, note: saved.buyer.note, preference: saved.buyer.preference } : null}
          onSave={(id, values) => intakeSaveAction(intakeKey, id, values)}
          afterSave={(r) => {
            if (r.ok) {
              setSaved(r);
              setEditing(false);
              window.scrollTo({ top: 0 });
            }
          }}
          onCancel={editing ? () => setEditing(false) : undefined}
        />
      ) : (
        <div className={styles.wrap}>
          {saved.merged && <p className={styles.msg}>這支電話原本就有資料（可能是客戶自己在網站留過條件），已經合併更新到同一筆。</p>}

          <div className={styles.card}>
            <h2 className={styles.name}>{saved.buyer.name}</h2>
            <a className={styles.phone} href={`tel:${saved.buyer.phone}`}>
              {saved.buyer.phone}
            </a>
            {saved.buyer.note && <p className={styles.note}>{saved.buyer.note}</p>}
            <p className={styles.sectionTitle} style={{ marginTop: 14 }}>
              購屋需求
            </p>
            <p className={styles.summary}>{saved.brief.summary ?? "還沒填條件"}</p>
            <div className={styles.actions}>
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setEditing(true)}>
                改條件
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => {
                  setSaved(null);
                  setEditing(false);
                  window.scrollTo({ top: 0 });
                }}
              >
                再記一位
              </button>
            </div>
          </div>

          <div className={styles.card}>
            <p className={styles.sectionTitle}>傳給客戶</p>
            <ShareToBuyer
              styles={styles}
              buyerName={saved.buyer.name}
              link={saved.brief.link}
              message={saved.brief.message}
              matched={saved.brief.matched}
              canPush={saved.buyer.linked && saved.buyer.followed}
              onPush={() => intakePushAction(intakeKey, saved.buyer.id)}
            />
          </div>

          <div className={styles.card}>
            <p className={styles.sectionTitle}>配對結果</p>
            <MatchList styles={styles} matches={saved.brief.matches} matched={saved.brief.matched} total={saved.brief.total} hasPreference={Boolean(saved.buyer.preference)} />
          </div>
        </div>
      )}
    </div>
  );
}
