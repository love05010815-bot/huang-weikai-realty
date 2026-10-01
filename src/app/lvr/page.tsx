/**
 * /lvr —— 台中海線（梧棲、清水、沙鹿、龍井）最新實價登錄
 *
 * 2026-09-30 系統擁有者：「我想知道海線每日最新的實價登錄，讓客戶可以馬上知道最新的周圍行情。」
 *
 * 資料：內政部「不動產交易實價查詢服務網」開放資料（政府資料開放授權條款，須註明出處）。
 *   每天台北 10:00 由 /api/lvr/daily 抓「本期」zip 存進資料庫（src/lib/lvr.ts），
 *   這頁只讀資料庫。⚠️ 內政部**每月 1、11、21 日**才發布新一期，其他日子同步到的是同一批，
 *   所以文案寫「內政部最新一期」，不寫「今日成交」—— 成交到看得到，實際落差約一到兩個月。
 *
 * 版面：期程狀態列 → 四區近 6 個月摘要卡（點卡片＝篩那一區）→ 篩選列 → 成交表 → 分頁 → 免責。
 * 表格在 720px 以下變成一列一卡（CSS 用 data-label 補欄名）。
 *
 * ⚠️ 備註有「親友／特殊關係」「法拍」等字眼的那幾筆，單價不代表行情：表格上打標籤、
 *    摘要的中位數直接排除（lvr.ts getDistrictStats）。
 */
import Link from "next/link";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { OWNER, SITE_URL } from "@/config/owner";
import SiteNav from "@/app/_ui/SiteNav";
import SocialLinks from "@/app/_ui/SocialLinks";
import SiteFooter from "@/app/_ui/SiteFooter";
import {
  LVR_DISTRICTS,
  LVR_CATEGORY_LABEL,
  buildingAge,
  buildingTypeShort,
  floorLabel,
  isoToRoc,
  m2ToPing,
  noteFlags,
  periodTextForDisplay,
  toHalfWidth,
  unitPriceToWanPerPing,
  yuanToWan,
  type LvrCategory,
  type LvrKind,
} from "@/lib/lvr-parse";
import {
  LVR_PERIOD_RECENT,
  getDistrictStats,
  getLvrYearOptions,
  latestSuccessfulSync,
  listDeals,
  taipeiStamp,
  type LvrDealRow,
  type LvrSort,
} from "@/lib/lvr";
import styles from "../home.module.css";
import tax from "../tax/tax.module.css";
import css from "./lvr.module.css";
import LvrFilters, { type LvrFilterValues } from "./LvrFilters";

const TITLE = `梧棲・清水・沙鹿・龍井實價登錄｜海線最新成交行情｜房仲${OWNER.name}`;
const DESCRIPTION =
  "台中海線四區（梧棲、清水、沙鹿、龍井）內政部最新一期實價登錄成交一次看：大樓、華廈、透天、預售屋的成交日、門牌、坪數、總價與每坪單價，可依行政區、型態、路名、建案篩選，另附四區近半年成交筆數與單價中位數。資料每天自動同步內政部開放資料。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "實價登錄",
    "梧棲實價登錄",
    "清水實價登錄",
    "沙鹿實價登錄",
    "龍井實價登錄",
    "台中海線實價登錄",
    "梧棲房價",
    "沙鹿房價",
    "清水房價",
    "龍井房價",
    "海線成交行情",
    "台中港市鎮中心 實價登錄",
    "台中海線房仲",
    OWNER.name,
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: "/lvr" },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/lvr`,
    title: TITLE,
    description: DESCRIPTION,
    siteName: `${OWNER.name}｜台中海線房仲`,
  },
};

/** 這頁吃 searchParams，本來就是動態的；寫明白免得誰想加 revalidate */
export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;
const CATEGORIES = new Set<string>(Object.keys(LVR_CATEGORY_LABEL));
const SORTS = new Set<string>(["date", "unitDesc", "unitAsc", "priceDesc", "priceAsc"]);

/** 摘要一小時快取；同步成功會 revalidateTag("lvr") 立刻更新 */
const getCachedStats = unstable_cache(async (batch: string) => getDistrictStats(batch), ["lvr-district-stats"], {
  revalidate: 3600,
  tags: ["lvr"],
});

type SP = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** 型態下拉不再有「預售屋」這個值 —— 它現在是上面的分頁籤（kind），單獨判斷掉 */
function readFilters(sp: SP, years: string[]): LvrFilterValues & { page: number } {
  const area = one(sp.area);
  const type = one(sp.type);
  const sort = one(sp.sort);
  const kind = one(sp.kind);
  const period = one(sp.period);
  const pageNum = Number.parseInt(one(sp.page) || "1", 10);
  return {
    kind: kind === "presale" ? "presale" : "sale",
    area: (LVR_DISTRICTS as readonly string[]).includes(area) ? area : "",
    type: (CATEGORIES.has(type) && type !== "presale" ? type : "") as LvrCategory | "",
    period: period === LVR_PERIOD_RECENT || years.includes(period) ? period : LVR_PERIOD_RECENT,
    q: toHalfWidth(one(sp.q)).slice(0, 40),
    sort: (SORTS.has(sort) ? sort : "date") as LvrSort,
    fresh: one(sp.fresh) === "1",
    page: Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1,
  };
}

/** 帶著目前篩選條件換頁／換區／換分頁籤的網址 */
function hrefWith(f: LvrFilterValues, patch: Partial<LvrFilterValues> & { page?: number }): string {
  const v = { ...f, ...patch };
  const p = new URLSearchParams();
  if (v.kind !== "sale") p.set("kind", v.kind);
  if (v.area) p.set("area", v.area);
  if (v.type) p.set("type", v.type);
  if (v.period !== LVR_PERIOD_RECENT) p.set("period", v.period);
  if (v.q) p.set("q", v.q);
  if (v.sort !== "date") p.set("sort", v.sort);
  if (v.fresh) p.set("fresh", "1");
  if (patch.page && patch.page > 1) p.set("page", String(patch.page));
  const s = p.toString();
  return s ? `/lvr?${s}` : "/lvr";
}

function fmtWan(n: number): string {
  return n.toLocaleString("zh-TW");
}

/** 門牌去掉「臺中市○○區」前綴 —— 行政區已經另外標了，表格窄一點 */
function shortAddress(d: LvrDealRow): string {
  return d.address.replace(/^臺中市/, "").replace(new RegExp(`^${d.district}`), "").trim() || d.address;
}

function layoutText(d: LvrDealRow): string {
  if (!d.rooms && !d.halls && !d.baths) return "—";
  return `${d.rooms}房${d.halls}廳${d.baths}衛`;
}

function floorText(d: LvrDealRow): string {
  const f = floorLabel(d.floor);
  const t = floorLabel(d.totalFloors);
  if (f && t) return `${f}／${t}`;
  return f || t || "—";
}

function ageText(d: LvrDealRow): string {
  if (d.kind === "presale") return "預售";
  const age = buildingAge(d.builtYm);
  if (age === null) return "—";
  return age < 1 ? "新成屋" : `${age} 年`;
}

/** 成屋／預售屋 分頁籤 */
const KIND_TABS: { value: LvrKind; label: string }[] = [
  { value: "sale", label: "成屋" },
  { value: "presale", label: "預售屋" },
];

function periodLabel(period: string): string {
  return period === LVR_PERIOD_RECENT ? "近 6 個月" : `民國 ${period} 年`;
}

export default async function LvrPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  // 年度清單要先拿到才能驗證 URL 上的 period 是不是一個真的有資料的年度
  const [latest, years] = await Promise.all([latestSuccessfulSync(), getLvrYearOptions()]);
  const f = readFilters(sp, years);
  const latestBatch = latest?.batch ?? "";
  const [stats, list] = await Promise.all([
    getCachedStats(latestBatch),
    listDeals(
      {
        kind: f.kind,
        district: f.area,
        category: f.type,
        period: f.period,
        q: f.q,
        sort: f.sort,
        freshOnly: f.fresh,
        page: f.page,
        pageSize: PAGE_SIZE,
      },
      latestBatch,
    ),
  ]);
  const totalPages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const freshTotal = stats.districts.reduce((s, d) => s + d.fresh, 0);
  const noData = stats.totalDeals === 0;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.navWrap}>
          <Link href="/" className={styles.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.brandLogo} src="/kaixing-mark.png" alt="凱心成家" width={40} height={40} />
            <span>
              凱心成家
              <small className={styles.brandSub}>{OWNER.company} 台中海線房仲</small>
            </span>
          </Link>
          <SiteNav variant="sub" />
          <div className={styles.navCta}>
            <Link className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`} href="/card/booking">
              線上預約
            </Link>
          </div>
        </div>
      </header>

      {/* 一定要放在 <header> 外面，理由見 SiteNav.tsx */}
      <SocialLinks variant="float" />
      <main>
        <section className={styles.section}>
          <div className={`${styles.container} ${styles.center}`}>
            <SocialLinks variant="bar" align="center" />
            <span className={styles.eyebrow}>TOOLS</span>
            <h1 className={styles.sectionTitle}>梧棲・清水・沙鹿・龍井 最新實價登錄</h1>
            <p className={styles.sectionDesc}>
              內政部最新一期的海線成交，每天自動同步。預設顯示近 6 個月，可切換看成屋或預售屋，
              也能指定要查的年度；成交日、門牌、坪數、總價與每坪單價一次看，先知道周圍行情，再談價格才有依據。
            </p>
          </div>

          <div className={styles.container}>
            {/* ---------- 期程狀態列 ---------- */}
            <div className={css.status} role="status">
              {latest ? (
                <>
                  <div>
                    <strong>內政部最新一期</strong>
                    <span className={css.statusPeriod}>{periodTextForDisplay(latest.periodText) || latest.batch}</span>
                  </div>
                  <div className={css.statusMeta}>
                    本站同步：{taipeiStamp(new Date(latest.finishedMs ?? latest.startedMs)).slice(0, 16)}
                    {freshTotal ? (
                      <>
                        {" ・ "}
                        本期四區新增 <strong>{freshTotal}</strong> 筆
                      </>
                    ) : null}
                    {" ・ "}
                    內政部每月 1、11、21 日發布新一期
                  </div>
                </>
              ) : (
                <div>
                  <strong>資料尚未同步</strong>
                  <span className={css.statusMeta}>每天早上 10 點自動向內政部抓取，請稍後再來。</span>
                </div>
              )}
            </div>

            {/* ---------- 四區摘要 ---------- */}
            <div className={css.tiles}>
              {stats.districts.map((d) => {
                const on = f.area === d.district;
                return (
                  <Link
                    key={d.district}
                    href={hrefWith(f, { area: on ? "" : d.district })}
                    className={`${css.tile} ${on ? css.tileOn : ""}`}
                    aria-pressed={on}
                  >
                    <div className={css.tileHead}>
                      <span className={css.tileName}>{d.district}</span>
                      {d.fresh ? <span className={css.freshBadge}>本期 +{d.fresh}</span> : null}
                    </div>
                    <div className={css.tileCount}>
                      近 {stats.months} 個月 <strong>{d.count}</strong> 筆
                    </div>
                    <dl className={css.tileRows}>
                      <div>
                        <dt>大樓／華廈</dt>
                        <dd>{d.aptMedian !== null ? <><strong>{d.aptMedian}</strong> 萬/坪 <small>({d.aptCount})</small></> : <small>樣本不足</small>}</dd>
                      </div>
                      <div>
                        <dt>透天</dt>
                        <dd>{d.houseMedian !== null ? <><strong>{d.houseMedian}</strong> 萬/坪 <small>({d.houseCount})</small></> : <small>樣本不足</small>}</dd>
                      </div>
                      <div>
                        <dt>預售屋</dt>
                        <dd>{d.presaleMedian !== null ? <><strong>{d.presaleMedian}</strong> 萬/坪 <small>({d.presaleCount})</small></> : <small>樣本不足</small>}</dd>
                      </div>
                    </dl>
                  </Link>
                );
              })}
            </div>
            <p className={css.tilesNote}>
              中位數只算有單價、備註沒有親友／法拍等特殊註記的成交；括號是樣本數。透天的每坪單價含土地，跟大樓不能直接比。
            </p>

            {/* ---------- 成屋／預售屋 分頁籤 ----------
                2026-10-01 系統擁有者：「預售跟成屋分開顯示」—— 兩種資料的欄位意義不一樣
                （成屋看屋齡與樓層、預售屋看建案與棟號），混在同一份清單裡不容易看懂，分開才對。
                換籤只動 kind，其餘篩選（行政區／期間／排序／關鍵字）照舊帶著走；
                但「型態」重設成全部 —— 兩籤的型態選項不同，留著舊值可能查出「這籤沒有的型態」而顯示空清單。 */}
            <div className={css.kindTabs} role="tablist" aria-label="成屋或預售屋">
              {KIND_TABS.map((t) => (
                <Link
                  key={t.value}
                  href={hrefWith(f, { kind: t.value, type: "" })}
                  className={`${css.kindTab} ${f.kind === t.value ? css.kindTabOn : ""}`}
                  role="tab"
                  aria-selected={f.kind === t.value}
                >
                  {t.label}
                </Link>
              ))}
            </div>

            {/* ---------- 篩選 ---------- */}
            <LvrFilters values={f} hasFresh={Boolean(latestBatch) && freshTotal > 0} years={years} />

            {/* ---------- 清單 ---------- */}
            <div className={css.count}>
              {f.kind === "presale" ? "預售屋" : "成屋"}
              {" ・ "}
              {f.area || "四區"}
              {" ・ "}
              {f.type ? LVR_CATEGORY_LABEL[f.type] : "全部型態"}
              {f.q ? ` ・ 「${f.q}」` : ""}
              {" ・ "}
              {periodLabel(f.period)}
              {f.fresh ? " ・ 只看本期" : ""}
              {" ・ 共 "}
              <strong>{list.total.toLocaleString("zh-TW")}</strong> 筆
              {totalPages > 1 ? `，第 ${f.page}／${totalPages} 頁` : ""}
            </div>

            {list.rows.length === 0 ? (
              <div className={css.empty}>
                {noData ? "資料還沒同步進來，請稍後再試。" : "這個條件下沒有成交紀錄，換個行政區、型態或期間看看。"}
              </div>
            ) : (
              <div className={css.tableWrap}>
                <table className={css.table}>
                  <thead>
                    <tr>
                      <th>門牌／建案</th>
                      <th>成交日</th>
                      <th className={css.num}>總價</th>
                      <th className={css.num}>單價</th>
                      <th>坪數</th>
                      <th>屋齡</th>
                      <th>格局</th>
                      <th>型態・樓層</th>
                      <th>車位</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.rows.map((d) => {
                      const flags = noteFlags(d.note);
                      const isLand = d.target === "土地";
                      const unit = unitPriceToWanPerPing(d.unitPriceM2);
                      const isFresh = latestBatch && d.batch === latestBatch;
                      return (
                        <tr key={d.id} className={d.cancelled ? css.rowCancelled : undefined}>
                          <td data-label="門牌／建案" className={css.addrCell}>
                            <span className={css.district}>{d.district}</span>
                            {d.kind === "presale" ? (
                              <>
                                <span className={css.addr}>{d.projectName || "（未填建案名）"}</span>
                                <span className={css.sub}>
                                  {d.unitNo}
                                  {d.unitNo && shortAddress(d) ? " ・ " : ""}
                                  {shortAddress(d)}
                                </span>
                              </>
                            ) : (
                              <span className={css.addr}>{shortAddress(d)}</span>
                            )}
                            {d.cancelled ? <span className={`${css.flag} ${css.flagCancel}`}>已解約：{d.cancelled}</span> : null}
                            {flags.map((x) => (
                              <span key={x} className={css.flag}>
                                {x}
                              </span>
                            ))}
                            {d.note ? (
                              <details className={css.note}>
                                <summary>備註</summary>
                                <p>{d.note}</p>
                              </details>
                            ) : null}
                          </td>
                          <td data-label="成交日">
                            <span className={css.date}>{isoToRoc(d.dealDate)}</span>
                            {isFresh ? <span className={css.freshDot} title="本期新增">本期</span> : null}
                          </td>
                          <td data-label="總價" className={css.num}>
                            <strong>{fmtWan(yuanToWan(d.totalPrice))}</strong> 萬
                          </td>
                          <td data-label="單價" className={css.num}>
                            {unit !== null ? (
                              <>
                                <strong>{unit}</strong> 萬/坪
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td data-label="坪數">
                            {isLand ? (
                              <>
                                {m2ToPing(d.landAreaM2)} 坪<span className={css.sub}>土地</span>
                              </>
                            ) : (
                              <>
                                {m2ToPing(d.buildingAreaM2)} 坪
                                {d.parkingAreaM2 > 0 ? <span className={css.sub}>含車位 {m2ToPing(d.parkingAreaM2)} 坪</span> : null}
                              </>
                            )}
                          </td>
                          <td data-label="屋齡">{isLand ? "—" : ageText(d)}</td>
                          <td data-label="格局">{isLand ? "—" : layoutText(d)}</td>
                          <td data-label="型態・樓層">
                            {isLand ? "土地" : buildingTypeShort(d.buildingType)}
                            {!isLand ? <span className={css.sub}>{floorText(d)}</span> : null}
                          </td>
                          <td data-label="車位">
                            {d.parkingType ? (
                              <>
                                {d.parkingType}
                                {d.parkingPrice > 0 ? <span className={css.sub}>{fmtWan(yuanToWan(d.parkingPrice))} 萬</span> : null}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 ? (
              <nav className={css.pager} aria-label="分頁">
                {f.page > 1 ? (
                  <Link className={css.pagerBtn} href={hrefWith(f, { page: f.page - 1 })}>
                    ← 上一頁
                  </Link>
                ) : (
                  <span className={`${css.pagerBtn} ${css.pagerOff}`}>← 上一頁</span>
                )}
                <span className={css.pagerInfo}>
                  {f.page} / {totalPages}
                </span>
                {f.page < totalPages ? (
                  <Link className={css.pagerBtn} href={hrefWith(f, { page: f.page + 1 })}>
                    下一頁 →
                  </Link>
                ) : (
                  <span className={`${css.pagerBtn} ${css.pagerOff}`}>下一頁 →</span>
                )}
              </nav>
            ) : null}

            <div className={css.cta}>
              想知道某個社區實際的可談空間、或這些數字對您要買要賣的房子代表什麼？
              <Link href="/card/booking" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`}>
                線上預約，我幫您看
              </Link>
            </div>

            <div className={tax.disclaimer}>
              <strong>⚠️ 資料僅供參考，實際交易條件以內政部實價登錄查詢服務網公告為準。</strong>
              成交價受樓層、屋況、車位、裝潢與買賣雙方關係影響，
              <strong>單一筆成交不等於行情</strong>；備註有親友、特殊關係、法拍、含增建等字眼的，已在表格標示，
              其單價不宜直接比較。每坪單價依內政部公布的「單價元／平方公尺」換算（已扣除車位），坪數＝平方公尺 × 0.3025。
              內政部資料每月 1、11、21 日發布新一期，每期收錄的是前一旬完成登記的案件，
              <strong>成交到公開約有一到兩個月時間差</strong>；本頁「本期新增」是指最新一期才出現的案件。
              預售屋資料以「交易日期」呈現，已解約的案件會標示。
              清單預設只顯示<strong>近 6 個月</strong>的成交，想看更早的資料可用「期間」改選特定年度。
              本頁不構成任何價格建議或估價。
              <div className={tax.sources}>
                資料來源：
                <br />
                ・{" "}
                <a href="https://plvr.land.moi.gov.tw/DownloadOpenData" target="_blank" rel="noopener noreferrer">
                  內政部不動產交易實價查詢服務網 開放資料（政府資料開放授權條款）↗
                </a>
                <br />
                ・{" "}
                <a href="https://lvr.land.moi.gov.tw/" target="_blank" rel="noopener noreferrer">
                  內政部不動產交易實價查詢服務網（查單筆詳細資料）↗
                </a>
              </div>
            </div>

            <Link href="/" className={tax.backLink}>
              ← 回首頁
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
