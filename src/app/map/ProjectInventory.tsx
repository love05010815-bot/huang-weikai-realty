/**
 * 🏢 /map 詳情面板：「太平洋房屋在這個建案的在售物件」（2026-10-20 系統擁有者要的，仿另一家網站「在售物件」那一區、自己的版本）
 *
 * 資料是 page.tsx 在伺服器算好的 `ProjectInventoryMap`（lib/project-inventory-data.ts），這裡只負責畫。
 *   ・一列一戶：照片、標題、售價、坪數／格局／樓層／型態；整列進站內單戶頁 /map/unit/<S 編號>（不外連，跟 10/20 的拍板一致）
 *   ・右邊「預約看屋」直接進 /match?book=<S 編號>（自動配對那一頁的預約表單，會發 BK 編號、綁 LINE）
 *   ・便宜的排前面（lib 排好的，跟精選好案同一條規則）；只有售、沒有租（同步本來就只抓售）
 *   ・他自己上架的那幾戶在上面「我在 ○○ 的在售物件」那一段，這裡已經扣掉，不會重複
 * 沒有物件就什麼都不畫（呼叫端決定空狀態要說什麼）。
 */
import Link from "next/link";
import { priceText, specText, type InventoryItem } from "@/lib/project-inventory";
import styles from "./inventory.module.css";

type Props = {
  projectName: string;
  items: InventoryItem[];
  /** 他自己在這個建案有幾戶（上面那一段）—— 有的話標題改成「其他在售」，不然客戶會以為兩段是重複的 */
  mineCount: number;
  /** 上面那條虛線。接在已經有虛線的區塊（.noMine）裡面時傳 false，免得兩條疊在一起 */
  divider?: boolean;
};

export default function ProjectInventory({ projectName, items, mineCount, divider = true }: Props) {
  if (items.length === 0) return null;
  return (
    <section className={divider ? styles.wrap : styles.wrapFlat} aria-label={`太平洋房屋在 ${projectName} 的在售物件`}>
      <header className={styles.head}>
        <h4 className={styles.title}>
          {mineCount > 0 ? `太平洋房屋在 ${projectName} 的其他在售物件` : `太平洋房屋在 ${projectName} 的在售物件`}
          <em className={styles.count}>{`${items.length} 間`}</em>
        </h4>
        <p className={styles.note}>資料來自太平洋房屋官網，每 30 分鐘更新，只列出售、不含出租。看中哪一戶都可以直接找我帶看。</p>
      </header>
      <ul className={styles.grid}>
        {items.map((it) => (
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
            <Link href={`/match?book=${encodeURIComponent(it.id)}`} className={styles.book} aria-label={`預約看 ${it.title}`}>
              預約看屋
            </Link>
          </li>
        ))}
      </ul>
      <p className={styles.foot}>
        ⚠️ 物件資訊以太平洋房屋官網為準，價格與狀態隨時可能異動；實際坪數、格局、屋況與產權以現場勘查及不動產說明書所載為準。
      </p>
    </section>
  );
}
