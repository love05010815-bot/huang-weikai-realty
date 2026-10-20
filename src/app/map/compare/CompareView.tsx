/**
 * 物件比較表的畫面 —— /map/compare（地圖在售物件）與 /favorites/compare（收藏的精選好案）共用。
 * 各自的 page.tsx 負責讀網址、查資料庫、抓型錄（lib/compare-facts.ts）；這裡只負責渲染。
 *
 * 版面照 2026-09-10 系統擁有者給的範本（另一家的社區比較頁）：左邊一欄「比較項目」，
 * 每件物件一欄，最上面是照片＋建案名＋標題，底下九列就是他指定的九項（順序也照他列的），
 * 最後一列放下一步的按鈕：
 *   ・/map：「看這戶的完整介紹 →」（站內 /map/listing/<id>，2026-10-20 起不外連）「預約諮詢」—— 樣式借 /map 卡片那份
 *   ・/favorites：「看這戶的完整介紹 →」「預約看這戶」—— 跟收藏頁那列同一組；精選好案 2026-10-20 起
 *     不再把客戶導去外部網站（單戶頁自己顯示官網資料），所以這邊不放外連
 *
 * ⚠️ 九項全部來自各戶的型錄（愛屋型錄或太平洋分享連結），**不在資料庫、後台沒欄位**。
 *    ・型錄上沒印的那一格 → 「型錄未載」
 *    ・整戶型錄抓不到（愛屋慢或掛了、連結不是型錄、版面認不得）→ 整欄「—」＋標題底下說明原因，
 *      不要讓客戶以為那戶就是「沒車位、沒公設比」。
 *
 * 頁首頁尾與 /map 同一套（Map.module.css），色票變數在 `.page` 上，表格自己的樣式在 compare.module.css。
 */
import type { CSSProperties } from "react";
import Link from "next/link";
import { OWNER } from "@/config/owner";
import { formatWan } from "@/lib/houseol-price";
import {
  MISSING_TEXT,
  formatAge,
  formatCompletion,
  formatFloor,
  formatLayout,
  formatParking,
  formatPing,
  type HouseolFacts,
} from "@/lib/houseol-facts";
import { COMPARE_MAX, COMPARE_MIN } from "@/lib/map-compare";
import { resolvePhotoSrc } from "@/lib/photo-src";
import SiteNav from "@/app/_ui/SiteNav";
import styles from "../Map.module.css";
import cmp from "./compare.module.css";

/** 從哪一頁來的：決定說明文字、回去的連結、每欄底下那組按鈕 */
export type CompareSource = "map" | "favorites";

export type CompareListing = {
  /** /map ＝ map_listing id；/favorites ＝ 精選好案 slug。也是點擊統計的 data-listing-slug（跟各自的卡片一致） */
  id: string;
  title: string;
  /** 第一張是封面；空陣列顯示佔位塊 */
  photos: string[];
  /** 「物件介紹」連結；null ＝ 後台沒填 */
  linkHref: string | null;
};

export type CompareEntry = {
  listing: CompareListing;
  /**
   * 建案名＋顯示用的區域。/map 是 map_listing 掛的建案；精選好案是 area 欄拆出來的「行政區・建案名」。
   * 對不到就 null，建案名退回型錄的「社區」。
   */
  project: { name: string; area: string | null } | null;
  /** null ＝ 沒有型錄連結、不是型錄連結、或這次抓不到 */
  facts: HouseolFacts | null;
  /** 連結認得出是型錄（愛屋／太平洋分享連結）。false ＝ 連去別的地方（591、官網物件頁），九項帶不進來要講清楚 */
  catalogLink: boolean;
};

type Cell = { main: string | null; sub?: string | null };

/** 九列。順序就是系統擁有者列的順序，不要重排 */
const ROWS: Array<{ key: string; label: string; cell: (e: CompareEntry) => Cell }> = [
  {
    key: "price",
    label: "開價",
    cell: (e) => ({ main: e.facts?.price != null ? formatWan(e.facts.price) : null }),
  },
  {
    key: "project",
    label: "建案名",
    cell: (e) => ({
      main: e.project?.name ?? e.facts?.community ?? null,
      sub: e.project?.area ?? null,
    }),
  },
  {
    key: "age",
    label: "屋齡",
    cell: (e) => ({
      main: e.facts ? formatAge(e.facts) : null,
      sub: formatCompletion(e.facts?.completion ?? null),
    }),
  },
  {
    key: "floor",
    label: "樓層／樓高",
    // 拆不開（型錄寫法沒看過）就照原文印，總比空白好
    cell: (e) => ({ main: formatFloor(e.facts?.floor ?? null) ?? e.facts?.floorRaw ?? null }),
  },
  {
    // 2026-09-11 系統擁有者拍板：這一列從「主建物坪數」改成「登記坪數」（權狀坪；型錄的登記坪數含車位坪）。
    // 有車位的戶用小字標出車位佔幾坪，客戶才不會拿含車位的 45 坪去跟沒車位的 22 坪硬比。
    key: "reg",
    label: "登記坪數",
    cell: (e) => ({
      main: formatPing(e.facts?.regPing ?? null),
      sub: e.facts?.parkPing != null && e.facts.parkPing > 0 ? `含車位 ${formatPing(e.facts.parkPing)}` : null,
    }),
  },
  {
    key: "mainAtt",
    label: "主＋附屬坪數",
    cell: (e) => ({
      main: formatPing(e.facts?.mainAttPing ?? null),
      sub: e.facts?.attPing != null ? `其中附屬建物 ${formatPing(e.facts.attPing)}` : null,
    }),
  },
  {
    key: "layout",
    label: "格局",
    cell: (e) => ({ main: formatLayout(e.facts?.layout ?? null) }),
  },
  {
    key: "parking",
    label: "車位",
    cell: (e) => ({ main: formatParking(e.facts?.parking ?? null) }),
  },
  {
    key: "ratio",
    label: "公設比",
    cell: (e) => ({ main: e.facts?.publicRatio ?? null }),
  },
];

/** 這戶的型錄整份讀不到（不是某一格沒填） */
const unavailable = (e: CompareEntry): boolean => !e.facts || e.facts.fieldCount === 0;

/** 整欄「—」時標題底下那句：三種原因分開講，客戶才知道是「沒連結」還是「等一下再開」 */
function unavailableNote(e: CompareEntry): string {
  if (!e.listing.linkHref) return "這戶還沒有型錄連結";
  if (!e.catalogLink) return "物件資訊不是型錄連結，這九項帶不進來";
  return "型錄暫時讀不到，稍後再開一次";
}

/** 兩個來源不一樣的字：從哪裡挑的、回哪裡、空狀態怎麼教 */
const SOURCE: Record<
  CompareSource,
  { from: string; noun: string; backHref: string; backLabel: string; emptyHow: string; emptyCta: string }
> = {
  map: {
    from: "海線建案一覽",
    noun: "在售物件",
    backHref: "/map",
    backLabel: "← 回建案地圖再挑",
    emptyHow: "到「海線建案一覽」點建案，在我的在售物件按「＋ 比較」",
    emptyCta: "前往海線建案一覽",
  },
  favorites: {
    from: "我的最愛",
    noun: "精選好案",
    backHref: "/favorites",
    backLabel: "← 回我的最愛再挑",
    emptyHow: "到「我的最愛」在精選好案的物件按「＋ 比較」",
    emptyCta: "前往我的最愛",
  },
};

/** 每欄最底下「下一步」那兩顆。兩顆都掛 data-listing-*，全站的 ListingClickTracker 會記一次點擊 */
function NextSteps({ source, entry }: { source: CompareSource; entry: CompareEntry }) {
  const id = entry.listing.id;
  if (source === "favorites") {
    const slug = encodeURIComponent(id);
    return (
      <div className={cmp.btns}>
        {/* 單戶頁自己會記「被打開」，這顆不掛 data-listing-*（跟 /listings 卡片同一個做法，不然會記兩次） */}
        <Link className={styles.saleLink} href={`/listings/${slug}`}>
          看這戶的完整介紹 →
        </Link>
        <Link
          className={styles.saleBtn}
          href={`/card/booking?listing=${slug}`}
          data-listing-slug={id}
          data-listing-action="booking"
        >
          預約看這戶
        </Link>
      </div>
    );
  }
  // 2026-10-20 下午起地圖物件也不外連：「物件介紹 ↗」改成站內單戶頁 /map/listing/<id>（單戶頁自己記「被打開」，這顆不掛 data-listing-*）
  return (
    <div className={cmp.btns}>
      <Link className={styles.saleLink} href={`/map/listing/${encodeURIComponent(id)}`}>
        看這戶的完整介紹 →
      </Link>
      <Link className={styles.saleBtn} href="/card/booking" data-listing-slug={id} data-listing-action="booking">
        預約諮詢
      </Link>
    </div>
  );
}

export default function CompareView({
  source,
  entries,
  dropped,
}: {
  source: CompareSource;
  entries: CompareEntry[];
  dropped: number;
}) {
  const s = SOURCE[source];
  return (
    <main className={styles.page}>
      <header className={`${styles.header} ${cmp.noPrint}`}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand}>
            {OWNER.name}
            <span>台中海線房仲</span>
          </Link>
          <SiteNav variant="sub" />
          <Link href="/card/booking" className={styles.headerCta}>
            預約諮詢
          </Link>
        </div>
      </header>

      <section className={cmp.hero}>
        <div className={styles.container}>
          <span className={cmp.eyebrow}>COMPARE・物件比較</span>
          <h1 className={cmp.title}>把在意的條件放在一起看</h1>
          <p className={cmp.lede}>
            {entries.length > 0
              ? `從${s.from}挑出的 ${entries.length} 件${s.noun}，九項條件並排對照。資料整理自各戶的物件型錄，每小時更新一次。`
              : "還沒有選要比較的物件。"}
          </p>
          <Link href={s.backHref} className={`${cmp.back} ${cmp.noPrint}`}>
            {s.backLabel}
          </Link>
        </div>
      </section>

      <section className={cmp.section}>
        <div className={styles.container}>
          {dropped > 0 && <p className={cmp.notice}>{`有 ${dropped} 件已下架或找不到，沒有列入。`}</p>}

          {entries.length === 0 ? (
            <div className={cmp.empty}>
              <p>{`${s.emptyHow}，勾 ${COMPARE_MIN}～${COMPARE_MAX} 件再按「開始比較」。`}</p>
              <Link href={s.backHref} className={cmp.emptyCta}>
                {s.emptyCta}
              </Link>
            </div>
          ) : (
            <>
              {entries.length < COMPARE_MIN && (
                <p className={cmp.notice}>{`目前只有 1 件，回${s.from}多勾幾件才有對照。`}</p>
              )}

              <div className={cmp.wrap}>
                {/* --cols 給 CSS 算最小寬度（手機上左右滑的那條）；欄寬本身是 table-layout: fixed 平均分，
                    每戶一樣寬、照片才一樣大（見 compare.module.css 的 .table 註解） */}
                <table className={cmp.table} style={{ "--cols": entries.length } as CSSProperties}>
                  <thead>
                    <tr>
                      <th scope="col" className={cmp.rowHead}>
                        比較項目
                      </th>
                      {entries.map((e) => (
                        <th scope="col" key={e.listing.id} className={cmp.colHead}>
                          {e.listing.photos[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              className={cmp.thumb}
                              src={resolvePhotoSrc(e.listing.photos[0])}
                              alt={`${e.project?.name ?? ""} ${e.listing.title}`.trim()}
                              loading="lazy"
                            />
                          ) : (
                            <div className={cmp.thumbHolder} aria-hidden="true" />
                          )}
                          {e.project && <span className={cmp.colProject}>{e.project.name}</span>}
                          <span className={cmp.colTitle}>{e.listing.title}</span>
                          {unavailable(e) && <span className={cmp.colWarn}>{unavailableNote(e)}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS.map((row) => (
                      <tr key={row.key}>
                        <th scope="row" className={cmp.rowHead}>
                          {row.label}
                        </th>
                        {entries.map((e) => {
                          if (unavailable(e)) {
                            return (
                              <td key={e.listing.id}>
                                <span className={cmp.missing}>—</span>
                              </td>
                            );
                          }
                          const c = row.cell(e);
                          return (
                            <td key={e.listing.id}>
                              {c.main ? (
                                <span className={cmp.value}>{c.main}</span>
                              ) : (
                                <span className={cmp.missing}>{MISSING_TEXT}</span>
                              )}
                              {c.sub && <span className={cmp.sub}>{c.sub}</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className={cmp.noPrint}>
                    <tr>
                      <th scope="row" className={cmp.rowHead}>
                        下一步
                      </th>
                      {entries.map((e) => (
                        <td key={e.listing.id}>
                          <NextSteps source={source} entry={e} />
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p className={cmp.note}>
                ⚠️ 物件資訊僅供初步參考，整理自各戶物件型錄；「型錄未載」代表型錄上沒有這一欄。
                <strong>實際坪數、格局、屋況與產權，以現場勘查及不動產說明書所載為準。</strong>
                價格與物件狀態隨時可能異動，成交後即下架。
              </p>
            </>
          )}
        </div>
      </section>

      <footer className={`${styles.footer} ${cmp.noPrint}`}>
        <div className={styles.container}>
          {`${OWNER.name}｜${OWNER.title}　`}
          <Link href="/">回首頁</Link>
          {"　"}
          <Link href={s.backHref}>{s.from}</Link>
          {"　"}
          <Link href="/card/booking">線上預約</Link>
          <p className={styles.footerLegal}>{OWNER.brokerage}</p>
          <p className={styles.footerLegal2}>
            不動產營業員 {OWNER.name}　{OWNER.salespersonLicense}
          </p>
          <p className={styles.footerLegal2}>
            不動產經紀人 {OWNER.brokerName}　{OWNER.brokerLicense}
          </p>
        </div>
      </footer>
    </main>
  );
}
