"use client";
/**
 * 🔑 租屋快搜的條件欄位（2026-10-26）。跟 PreferenceForm 一樣只畫欄位、把改動丟回去，**不包 <form>、不放送出按鈕**。
 * 樣式吃 match.module.css 的 field / label / two / chips / chip / chipOn / hint / input / select / rangeRow / rangeSep。
 *
 * 欄位比買房少（他說「跟買賣物件相同」指的是物件頁，租屋條件本來就簡單）：
 * 行政區、租金上下限（元／月，固定級距）、房數、出租型態、型態、坪數上下限。沒有屋齡／樓層／車位 —— 官網的租屋資料多半沒填這些。
 * 選項（行政區、出租型態、型態）是 /api/match/rent 從目前出租中的物件整理的，所以不會出現「選了卻一筆都沒有」的選項。
 */
import { RENT_TIERS, type RentMeta } from "@/lib/match/rent";
import type { FormStyles } from "./PreferenceForm";
import { ROOMS_FALLBACK } from "./preference-state";

/** 表單狀態。數字欄位是字串，空字串 = 不限（輸入框要能留白） */
export type RentFormState = {
  districts: string[];
  rentMin: string;
  rentMax: string;
  roomsList: number[];
  types: string[];
  rentTypes: string[];
  sizeMin: string;
  sizeMax: string;
};

export const EMPTY_RENT: RentFormState = { districts: [], rentMin: "", rentMax: "", roomsList: [], types: [], rentTypes: [], sizeMin: "", sizeMax: "" };

/** GET /api/match/rent 回的東西：lib/match/rent.ts 的 rentMeta ＋ 房數選項 */
export type RentMetaPayload = RentMeta & { rooms: { value: number; label: string }[] };

const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** 表單狀態 → 送 POST /api/match/rent 的查詢。縣市跟著勾到的行政區走（目前六家店的出租物件都在台中市） */
export function toRentQuery(s: RentFormState, meta: RentMetaPayload | null) {
  const city = meta?.cities.find((c) => s.districts.some((d) => c.districts.includes(d)))?.city ?? "";
  return {
    city,
    districts: s.districts,
    rentMin: Number(s.rentMin) || 0,
    rentMax: Number(s.rentMax) || 0,
    roomsList: s.roomsList,
    types: s.types,
    rentTypes: s.rentTypes,
    sizeMin: Number(s.sizeMin) || 0,
    sizeMax: Number(s.sizeMax) || 0,
  };
}

export default function RentForm({
  meta,
  value: s,
  onChange,
  styles,
}: {
  meta: RentMetaPayload | null;
  value: RentFormState;
  /** 跟 PreferenceForm 一樣用「拿上一個狀態算新狀態」的寫法，兩個 chip 連點才不會互相蓋掉 */
  onChange: (update: (prev: RentFormState) => RentFormState) => void;
  styles: FormStyles;
}) {
  const set = (patch: Partial<RentFormState> | ((prev: RentFormState) => Partial<RentFormState>)) =>
    onChange((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }));
  const chipClass = (on: boolean) => `${styles.chip} ${on ? styles.chipOn : ""}`;
  const districts = meta?.cities.flatMap((c) => c.districts) ?? [];
  const rooms = meta?.rooms?.length ? meta.rooms : ROOMS_FALLBACK;
  const tiers = meta?.tiers?.length ? meta.tiers : RENT_TIERS;
  const money = (n: number) => n.toLocaleString("zh-TW");

  return (
    <>
      <div className={styles.field}>
        <div className={styles.label}>行政區（可複選）</div>
        {districts.length ? (
          <div className={styles.chips}>
            {districts.map((d) => (
              <button key={d} type="button" className={chipClass(s.districts.includes(d))} onClick={() => set((p) => ({ districts: toggle(p.districts, d) }))}>
                {d}
              </button>
            ))}
          </div>
        ) : (
          <p className={styles.hint}>{meta ? "目前沒有出租中的物件" : "讀取中…"}</p>
        )}
      </div>

      <div className={styles.field}>
        <div className={styles.label}>租金（元／月）</div>
        <div className={styles.rangeRow}>
          <select className={styles.select} value={s.rentMin} onChange={(e) => set({ rentMin: e.target.value })} aria-label="租金下限">
            <option value="">不限</option>
            {tiers.map((t) => (
              <option key={t} value={t}>
                {money(t)} 起
              </option>
            ))}
          </select>
          <span className={styles.rangeSep}>～</span>
          <select className={styles.select} value={s.rentMax} onChange={(e) => set({ rentMax: e.target.value })} aria-label="租金上限">
            <option value="">不限</option>
            {tiers.map((t) => (
              <option key={t} value={t}>
                {money(t)} 內
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.label}>房數（可複選）</div>
        <div className={styles.chips}>
          {rooms.map((r) => (
            <button key={r.value} type="button" className={chipClass(s.roomsList.includes(r.value))} onClick={() => set((p) => ({ roomsList: toggle(p.roomsList, r.value) }))}>
              {r.label}
            </button>
          ))}
        </div>
        <p className={styles.hint}>店面、土地這類沒有房數的物件，房數不限才會出現。</p>
      </div>

      {meta && meta.rentTypes.length > 0 && (
        <div className={styles.field}>
          <div className={styles.label}>出租型態（可複選）</div>
          <div className={styles.chips}>
            {meta.rentTypes.map((t) => (
              <button key={t} type="button" className={chipClass(s.rentTypes.includes(t))} onClick={() => set((p) => ({ rentTypes: toggle(p.rentTypes, t) }))}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {meta && meta.types.length > 0 && (
        <div className={styles.field}>
          <div className={styles.label}>型態（可複選）</div>
          <div className={styles.chips}>
            {meta.types.map((t) => (
              <button key={t} type="button" className={chipClass(s.types.includes(t))} onClick={() => set((p) => ({ types: toggle(p.types, t) }))}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={`${styles.field} ${styles.two}`}>
        <label>
          坪數下限
          <input className={styles.input} type="number" inputMode="numeric" min={0} placeholder="不限" value={s.sizeMin} onChange={(e) => set({ sizeMin: e.target.value })} />
        </label>
        <label>
          坪數上限
          <input className={styles.input} type="number" inputMode="numeric" min={0} placeholder="不限" value={s.sizeMax} onChange={(e) => set({ sizeMax: e.target.value })} />
        </label>
      </div>
    </>
  );
}
