/**
 * 🏢 /map 詳情面板：「這個建案目前的在售物件」（2026-10-20 系統擁有者要的，仿另一家網站「在售物件」那一區、自己的版本）
 *
 * 2026-10-20 晚上他再拍板：「物件不用區分我 key 的跟您抓到的，我 key 的部分全部移除，都改以官網抓到的資料為主」——
 * 所以這一段現在是面板上**唯一**的在售物件清單，不再有「我的」「其他」之分。
 *
 * 資料是 page.tsx 在伺服器算好的 `ProjectInventoryMap`（lib/project-inventory-data.ts），這裡只負責畫。
 *   ・一列一戶：照片、標題、售價、坪數／格局／樓層／型態；整列進站內單戶頁 /map/unit/<S 編號>（不外連）
 *   ・右邊「預約看屋」直接進 /match?book=<S 編號>（自動配對那一頁的預約表單，會發 BK 編號、綁 LINE）；
 *     「＋ 比較」勾起來進畫面底下的比較列（/map/compare?ids=S…，九項從官網單筆 API 來）；
 *     「分享 ↗」把站內單戶頁的連結分享出去（手機叫系統分享面板、電腦複製；2026-10-21 他要的）
 *   ・便宜的排前面（lib 排好的，跟精選好案同一條規則）；只有售、沒有租（同步本來就只抓售）
 * 沒有物件就什麼都不畫（呼叫端決定空狀態要說什麼）。
 */
import Link from "next/link";
import { COMPARE_MAX } from "@/lib/map-compare";
import { priceText, specText, type InventoryItem } from "@/lib/project-inventory";
import ShareButton from "@/app/_ui/ShareButton";
import styles from "./inventory.module.css";

/** 「＋ 比較」要的那幾個動作（useCompare 回傳值的子集合）；不給就不畫那顆鈕 */
export type InventoryCompare = { has: (id: string) => boolean; toggle: (id: string) => void; full: boolean };

type Props = {
  projectName: string;
  items: InventoryItem[];
  /** 上面那條虛線。接在已經有虛線的區塊（.noMine／.mineBlock）裡面時傳 false，免得兩條疊在一起 */
  divider?: boolean;
  compare?: InventoryCompare;
};

export default function ProjectInventory({ projectName, items, divider = true, compare }: Props) {
  if (items.length === 0) return null;
  return (
    <section className={divider ? styles.wrap : styles.wrapFlat} aria-label={`${projectName} 的在售物件`}>
      <header className={styles.head}>
        {/* 小標只寫「目前在售」：面板標題已經是建案名，2026-10-21 他圈掉重複的那一個 */}
        <h4 className={styles.title}>
          目前在售
          <em className={styles.count}>{`${items.length} 間`}</em>
        </h4>
        <p className={styles.note}>資料來自太平洋房屋官網，每 30 分鐘更新，只列出售、不含出租。看中哪一戶都可以直接找我帶看。</p>
      </header>
      <ul className={styles.grid}>
        {items.map((it) => {
          const picked = compare?.has(it.id) ?? false;
          const blocked = Boolean(compare && !picked && compare.full);
          return (
            <li key={it.id} className={styles.row}>
              <Link href={`/map/unit/${encodeURIComponent(it.id)}`} className={styles.main}>
                {it.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={styles.thumb} src={it.photo} alt="" width={96} height={72} loading="lazy" />
                ) : (
                  <span className={`${styles.thumb} ${styles.thumbEmpty}`} aria-hidden="true" />
                )}
                <span className={styles.body}>
                  <b className={styles.ttl}>{it.title}</b>
                  <span className={styles.meta}>
                    {it.price !== null && <strong className={styles.price}>{priceText(it.price)}</strong>}
                    <span className={styles.spec}>{specText(it)}</span>
                  </span>
                </span>
              </Link>
              <div className={styles.actions}>
                <Link href={`/match?book=${encodeURIComponent(it.id)}`} className={styles.book} aria-label={`預約看 ${it.title}`}>
                  預約看屋
                </Link>
                {compare && (
                  /* 🔀 滿 4 件時其他戶的按鈕變灰，要先在底下的比較列移除一件 */
                  <button
                    type="button"
                    className={picked ? styles.cmpOn : styles.cmp}
                    onClick={() => compare.toggle(it.id)}
                    disabled={blocked}
                    aria-pressed={picked}
                    title={blocked ? `最多比 ${COMPARE_MAX} 件，先移除一件` : undefined}
                  >
                    {picked ? "✓ 已加入" : blocked ? `已滿 ${COMPARE_MAX} 件` : "＋ 比較"}
                  </button>
                )}
                {/* 📤 分享這一戶（2026-10-21 他要的）：分享站內單戶頁 /map/unit/<S 編號>，朋友點開直接看、可預約。
                    縮圖太小，不像精選好案卡那樣把圖示疊在照片角落，改放在動作欄當一顆藥丸；電腦複製成功時字變「已複製 ✓」 */}
                <ShareButton
                  variant="text"
                  className={styles.share}
                  path={`/map/unit/${encodeURIComponent(it.id)}`}
                  title={it.title}
                  text={`${projectName}｜${it.title}${it.price !== null ? `｜${priceText(it.price)}` : ""}`}
                  label="分享 ↗"
                  inlineDone="已複製 ✓"
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className={styles.foot}>
        ⚠️ 物件資訊以太平洋房屋官網為準，價格與狀態隨時可能異動；實際坪數、格局、屋況與產權以現場勘查及不動產說明書所載為準。
      </p>
    </section>
  );
}
