/**
 * /map/compare 的畫面。page.tsx 負責讀網址、查資料庫、抓型錄；這裡只負責渲染。
 *
 * 版面照 2026-09-10 系統擁有者給的範本（另一家的社區比較頁）：左邊一欄「比較項目」，
 * 每件物件一欄，最上面是照片＋建案名＋標題，底下九列就是他指定的九項（順序也照他列的），
 * 最後一列放「物件介紹 ↗」「預約諮詢」兩顆 —— 跟 /map 卡片同一組按鈕，樣式也借同一份。
 *
 * ⚠️ 九項全部來自各戶的愛屋型錄（lib/houseol-facts.ts），**不在資料庫、後台沒欄位**。
 *    ・型錄上沒印的那一格 → 「型錄未載」
 *    ・整戶型錄抓不到（愛屋慢或掛了、連結不是愛屋、版面認不得）→ 整欄「—」＋標題底下說明，
 *      不要讓客戶以為那戶就是「沒車位、沒公設比」。
 *
 * 頁首頁尾與 /map 同一套（Map.module.css），色票變數在 `.page` 上，表格自己的樣式在 compare.module.css。
 */
import Link from "next/link";
import { OWNER } from "@/config/owner";
import { AREA_LABEL, type Project } from "@/data/port-projects";
import type { PublicMapListing } from "@/lib/map-listings";
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

export type CompareEntry = {
  listing: PublicMapListing;
  /** map_listing 掛的建案；對不到（建案資料被改名／刪掉）就 null，建案名退回型錄的「社區」 */
  project: Project | null;
  /** null ＝ 沒有型錄連結、或這次抓不到 */
  facts: HouseolFacts | null;
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
      sub: e.project ? AREA_LABEL[e.project.area] : null,
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
    key: "main",
    label: "主建物坪數",
    cell: (e) => ({ main: formatPing(e.facts?.mainPing ?? null) }),
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

export default function CompareView({ entries, dropped }: { entries: CompareEntry[]; dropped: number }) {
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
              ? `從海線建案一覽挑出的 ${entries.length} 件在售物件，九項條件並排對照。資料整理自各戶的物件型錄，每小時更新一次。`
              : "還沒有選要比較的物件。"}
          </p>
          <Link href="/map" className={`${cmp.back} ${cmp.noPrint}`}>
            ← 回建案地圖再挑
          </Link>
        </div>
      </section>

      <section className={cmp.section}>
        <div className={styles.container}>
          {dropped > 0 && <p className={cmp.notice}>{`有 ${dropped} 件已下架或找不到，沒有列入。`}</p>}

          {entries.length === 0 ? (
            <div className={cmp.empty}>
              <p>
                {`到「海線建案一覽」點建案，在我的在售物件按「＋ 比較」，勾 ${COMPARE_MIN}～${COMPARE_MAX} 件再按「開始比較」。`}
              </p>
              <Link href="/map" className={cmp.emptyCta}>
                前往海線建案一覽
              </Link>
            </div>
          ) : (
            <>
              {entries.length < COMPARE_MIN && (
                <p className={cmp.notice}>目前只有 1 件，回地圖多勾幾件才有對照。</p>
              )}

              <div className={cmp.wrap}>
                <table className={cmp.table}>
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
                          {unavailable(e) && (
                            <span className={cmp.colWarn}>
                              {e.listing.linkHref ? "型錄暫時讀不到，稍後再開一次" : "這戶還沒有型錄連結"}
                            </span>
                          )}
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
                          {/* 兩顆都掛 data-listing-*，全站的 ListingClickTracker 會記一次點擊（slug 用地圖物件 id，跟 /map 卡片一致） */}
                          <div className={cmp.btns}>
                            {e.listing.linkHref && (
                              <a
                                className={styles.saleLink}
                                href={e.listing.linkHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-listing-slug={e.listing.id}
                                data-listing-action="link"
                              >
                                物件介紹 ↗
                              </a>
                            )}
                            <Link
                              className={styles.saleBtn}
                              href="/card/booking"
                              data-listing-slug={e.listing.id}
                              data-listing-action="booking"
                            >
                              預約諮詢
                            </Link>
                          </div>
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
          <Link href="/map">海線建案一覽</Link>
          {"　"}
          <Link href="/card/booking">線上預約</Link>
          <p className={styles.footerLegal}>
            {OWNER.brokerage}　不動產經紀人：{OWNER.brokerName}　{OWNER.brokerLicense}
          </p>
        </div>
      </footer>
    </main>
  );
}
