/**
 * 🪜 四階段流程（簽約 → 備證 → 完稅 → 交屋）—— /buy、/sell 共用的「一步一步」圖示版。
 *
 * 2026-10-22 他貼兩頁流程表的截圖：「把買方及賣方流程的這個部分改為圖示的呈現，有一步一步漸進式的感覺」。
 * 原本的四欄表格＋底下的白話段落合併成這個：每一步一顆圖示圓圈（編號 1→4、一條線串起來）＋一張卡
 * （約需天數、付款／收款、要準備、白話說明）。桌機四格橫排、線穿過圓圈；手機直排、線在左邊往下走。
 *
 * 內容（天數、比例、要準備的東西、白話那句）都在各頁的 STAGES，這裡只管長相 —— 改數字去 /buy、/sell 改，
 * 改完記得 src/config/faq.ts 那兩題也要同步（那邊是手動抄的）。
 */
import css from "./StageStepper.module.css";

export type Stage = {
  /** 圓圈裡的圖示（emoji） */
  icon: string;
  /** 階段名，例如「簽約」「備證（用印）」 */
  name: string;
  /** 約需天數 */
  days: string;
  /** 付款（買方）／收款（賣方）那一行，連「付」「收」一起寫在字串裡 */
  money: string;
  /** 要準備的東西 */
  prep: string;
  /** 要準備底下的小字（沒有就不顯示） */
  note?: string;
  /** 白話說明（原本表格底下那段） */
  desc: string;
};

export default function StageStepper({ stages }: { stages: Stage[] }) {
  return (
    <ol className={css.stepper}>
      {stages.map((s, i) => (
        <li key={s.name} className={css.step}>
          <div className={css.circle} aria-hidden="true">
            <span className={css.num}>{i + 1}</span>
            {s.icon}
          </div>
          <div className={css.card}>
            <h3 className={css.title}>{s.name}</h3>
            <ul className={css.meta}>
              <li>
                <span aria-hidden="true">⏱️</span>
                <span>{s.days}</span>
              </li>
              <li>
                <span aria-hidden="true">💵</span>
                <span>{s.money}</span>
              </li>
            </ul>
            <p className={css.prep}>
              <strong>要準備：</strong>
              {s.prep}
              {s.note ? <span className={css.note}>{s.note}</span> : null}
            </p>
            <p className={css.desc}>{s.desc}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
