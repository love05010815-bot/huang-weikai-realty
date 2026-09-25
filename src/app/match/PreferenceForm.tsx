"use client";
/**
 * 購屋條件的表單欄位 —— 買方自己填的 /match 與後台「代客建檔」共用同一份。
 *
 * 只負責畫欄位、把改動丟回去；**不包 <form>、不放送出按鈕**，外面自己決定怎麼送。
 * 樣式用 styles 傳進來：前台是淺色（match.module.css），後台是深色（admin 那邊的 module），
 * 兩份 CSS 的 class 名字一樣、顏色不一樣。用到的 class：
 *   field / label / two / chips / chip / chipOn / hint / input / select
 */
import { LAND_TYPE, toggle, toggleTypeIn, type MatchMeta, type PrefState } from "./preference-state";

/** CSS module 的形狀（Next 的型別就是這樣，不另外收窄，不然 module 傳不進來） */
export type FormStyles = { readonly [key: string]: string };

export default function PreferenceForm({
  meta,
  value: pref,
  onChange,
  styles,
}: {
  meta: MatchMeta | null;
  value: PrefState;
  /**
   * 用「拿上一個狀態算新狀態」的寫法，不是直接給新值 —— 兩個 chip 連點時 React 會把更新併在一起，
   * 直接給值的話第二下會用到還沒更新的舊值、把第一下蓋掉。setState 本身就吃這種函式，外面直接傳 setPref 進來就好。
   */
  onChange: (update: (prev: PrefState) => PrefState) => void;
  styles: FormStyles;
}) {
  const districts = meta?.cities.find((c) => c.city === pref.city)?.districts ?? [];
  const wantsLand = pref.types.includes(LAND_TYPE);
  const set = (patch: Partial<PrefState> | ((prev: PrefState) => Partial<PrefState>)) =>
    onChange((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }));
  const chipClass = (on: boolean) => `${styles.chip} ${on ? styles.chipOn : ""}`;

  return (
    <>
      <label className={styles.field}>
        縣市
        <select className={styles.select} value={pref.city} onChange={(e) => set({ city: e.target.value, districts: [] })}>
          <option value="">不限</option>
          {meta?.cities.map((c) => (
            <option key={c.city} value={c.city}>
              {c.city}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.field}>
        <div className={styles.label}>行政區（可複選）</div>
        {districts.length ? (
          <div className={styles.chips}>
            {districts.map((d) => (
              <button key={d} type="button" className={chipClass(pref.districts.includes(d))} onClick={() => set((p) => ({ districts: toggle(p.districts, d) }))}>
                {d}
              </button>
            ))}
          </div>
        ) : (
          <span className={styles.hint}>請先選擇縣市</span>
        )}
      </div>

      <label className={styles.field}>
        預算上限（萬）
        <input className={styles.input} type="number" inputMode="numeric" min={0} step={10} placeholder="例如 1500" value={pref.budgetMax} onChange={(e) => set({ budgetMax: e.target.value })} />
      </label>

      {/* 2026-09-25 改成可複選：都不勾就是不限，所以不再需要一顆「不限」 */}
      <div className={styles.field}>
        <div className={styles.label}>房數（可複選）</div>
        <div className={styles.chips}>
          {(meta?.rooms ?? []).map((r) => (
            <button key={r.value} type="button" className={chipClass(pref.roomsList.includes(r.value))} onClick={() => set((p) => ({ roomsList: toggle(p.roomsList, r.value) }))}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`${styles.field} ${styles.two}`}>
        <label>
          建物坪數下限
          <input className={styles.input} type="number" inputMode="decimal" min={0} placeholder="不限" value={pref.sizeMin} onChange={(e) => set({ sizeMin: e.target.value })} />
        </label>
        <label>
          建物坪數上限
          <input className={styles.input} type="number" inputMode="decimal" min={0} placeholder="不限" value={pref.sizeMax} onChange={(e) => set({ sizeMax: e.target.value })} />
        </label>
      </div>

      <div className={styles.field}>
        <div className={styles.label}>類型（可複選）</div>
        <div className={styles.chips}>
          {(meta?.types ?? []).map((t) => (
            <button key={t} type="button" className={chipClass(pref.types.includes(t))} onClick={() => onChange((p) => toggleTypeIn(p, t))}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* 土地專屬的兩項，只有勾了「土地」才出現 —— 買公寓的人不需要看到農地建地。
          店網只有土地物件會給地坪（透天那些都是 0），所以土地坪數也放在這裡。 */}
      {wantsLand && (
        <>
          <div className={styles.field}>
            <div className={styles.label}>土地類別（可複選）</div>
            <div className={styles.chips}>
              {(meta?.landCategories ?? []).map((c) => (
                <button key={c} type="button" className={chipClass(pref.landCategories.includes(c))} onClick={() => set((p) => ({ landCategories: toggle(p.landCategories, c) }))}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className={`${styles.field} ${styles.two}`}>
            <label>
              土地坪數下限
              <input className={styles.input} type="number" inputMode="decimal" min={0} placeholder="不限" value={pref.landMin} onChange={(e) => set({ landMin: e.target.value })} />
            </label>
            <label>
              土地坪數上限
              <input className={styles.input} type="number" inputMode="decimal" min={0} placeholder="不限" value={pref.landMax} onChange={(e) => set({ landMax: e.target.value })} />
            </label>
          </div>
        </>
      )}

      <label className={styles.field}>
        屋齡
        <select className={styles.select} value={pref.ageRange} onChange={(e) => set({ ageRange: e.target.value })}>
          <option value="">不限</option>
          {(meta?.ages ?? []).map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        希望樓層
        <select className={styles.select} value={pref.floor} onChange={(e) => set({ floor: e.target.value })}>
          <option value="">不限</option>
          {(meta?.floors ?? []).map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.field}>
        <div className={styles.label}>其他需求</div>
        <div className={styles.chips}>
          {(meta?.features ?? []).map((f) => (
            <button key={f} type="button" className={chipClass(pref.features.includes(f))} onClick={() => set((p) => ({ features: toggle(p.features, f) }))}>
              {f}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
