/**
 * /estimate —— 我的房子行情多少（海線房屋行情試算）
 *
 * 2026-10-26 系統擁有者：「客戶輸入行政區、建物型態、權狀坪數、屋齡，就能知道他的房子區域行情
 * 大概落在哪：最低成交、中價位、最高成交，依內政部實價登錄的資料比。」
 *
 * 資料：就是 /lvr 那套 `lvr_deal`（內政部開放資料，每天同步），不另外抓。
 * 比對：lib/lvr-estimate.ts（純函式，改條件跑 `npm run check:estimate`）；撈資料：lib/lvr-estimate-data.ts。
 *
 * 版面：表單（四格）→ 結果卡（中價位大字＋最低／中位／最高三格＋常見區間）→ 比對用的成交表 → 免責。
 * 表單是純 GET、action 帶 `#result`，送出後頁面自己捲到結果（結果就在表單底下，手機也不用找）。
 *
 * ⚠️ 文案不寫「估價」—— 不動產估價是估價師的執業範圍；這頁是「行情試算」「成交區間」。
 * ⚠️ 坪數比的是**不含車位**的建物坪數、推算總價也不含車位（官方單價本來就扣掉車位算）。
 */
import Link from "next/link";
import type { Metadata } from "next";
import { OG_IMAGE, OWNER, SITE_URL } from "@/config/owner";
import BreadcrumbJsonLd from "@/app/_ui/BreadcrumbJsonLd";
import SiteNav from "@/app/_ui/SiteNav";
import SocialLinks from "@/app/_ui/SocialLinks";
import SiteFooter from "@/app/_ui/SiteFooter";
import { LVR_DISTRICTS, floorLabel, isoToRoc, periodTextForDisplay } from "@/lib/lvr-parse";
import { latestSuccessfulSync } from "@/lib/lvr";
import { taipeiDay } from "@/lib/site-visits";
import {
  MIN_SAMPLES,
  MIN_SHOW,
  POOL_MONTHS,
  estimate,
  estimateTypeDef,
  fmtWan,
  parseEstimateInput,
  tierLabel,
  type EstimateComp,
  type EstimateResult,
} from "@/lib/lvr-estimate";
import { COUNT_MONTHS, getCachedEstimatePool, getCachedEstimateTypeCounts } from "@/lib/lvr-estimate-data";
import styles from "../home.module.css";
import tax from "../tax/tax.module.css";
import lvr from "../lvr/lvr.module.css";
import css from "./estimate.module.css";
import EstimateForm from "./EstimateForm";

const TITLE = `沙鹿、梧棲、清水、龍井房價行情試算｜填坪數屋齡看成交區間｜台中海線房仲${OWNER.name}`;
const DESCRIPTION =
  "我的房子值多少？選行政區（沙鹿、梧棲、清水、龍井）、建物型態（住宅大樓、華廈、公寓、透天）、填權狀坪數與屋齡，就從內政部實價登錄裡挑出條件相近的成屋成交，算出每坪最低、中價位、最高成交單價，再換算成您這間的總價區間，比對用的每一筆成交門牌、日期都列出來。資料每天自動同步內政部開放資料。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "房價行情查詢",
    "我的房子值多少",
    "沙鹿房價",
    "梧棲房價",
    "清水房價",
    "龍井房價",
    "沙鹿大樓一坪多少",
    "梧棲透天行情",
    "海線房價行情",
    "實價登錄 行情試算",
    "台中海線房仲",
    OWNER.name,
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: "/estimate" },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/estimate`,
    title: TITLE,
    description: DESCRIPTION,
    siteName: `${OWNER.name}｜台中海線房仲`,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

/** 這頁吃 searchParams，本來就是動態的；寫明白免得誰想加 revalidate */
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** 門牌去掉「臺中市○○區」前綴 —— 行政區已經在標題寫了 */
function shortAddress(address: string, district: string): string {
  return address.replace(/^臺中市/, "").replace(new RegExp(`^${district}`), "").trim() || address;
}

function ageText(age: number | null): string {
  if (age === null) return "—";
  return age < 1 ? "新成屋" : `${age} 年`;
}

function floorText(c: EstimateComp): string {
  const f = floorLabel(c.floor);
  const t = floorLabel(c.totalFloors);
  if (f && t) return `${f}／${t}`;
  return f || t || "—";
}

function layoutText(c: EstimateComp): string {
  if (!c.rooms && !c.halls && !c.baths) return "—";
  return `${c.rooms}房${c.halls}廳${c.baths}衛`;
}

/** 到 /lvr 看同區同型態完整清單（/lvr 的型態只分 apt＝大樓華廈公寓、house＝透天） */
function lvrHref(district: string, type: string): string {
  const p = new URLSearchParams();
  p.set("area", district);
  p.set("type", type === "house" ? "house" : "apt");
  return `/lvr?${p.toString()}`;
}

export default async function EstimatePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const raw = { district: one(sp.area), type: one(sp.type), ping: one(sp.ping), age: one(sp.age) };
  const [counts, latest] = await Promise.all([getCachedEstimateTypeCounts(), latestSuccessfulSync()]);
  const parsed = parseEstimateInput(raw, LVR_DISTRICTS);

  let result: EstimateResult | null = null;
  if (parsed.input) {
    const pool = await getCachedEstimatePool(parsed.input.district, parsed.input.type);
    result = estimate(parsed.input, pool, taipeiDay());
  }

  return (
    <div className={styles.page}>
      <BreadcrumbJsonLd items={[{ name: "我的房子行情多少", href: "/estimate" }]} />
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
        {/* 2026-10-22 系統擁有者：社群藥丸在 logo 下方、跟 header 一起固定（見 home.module.css） */}
        <div className={styles.headerSocial}>
          <SocialLinks variant="bar" align="start" compact className={styles.headerSocialBar} />
        </div>
      </header>

      {/* 桌機右側固定社群直排，1220px 以上顯示、跟 header 的 compact 藥丸分工；一定要在 <header> 外面（見 SiteNav.tsx） */}
      <SocialLinks variant="float" />

      <main>
        <section className={styles.section}>
          {/* 稱呼＋標題黏住、長描述不黏（2026-10-22 全站規矩，見 home.module.css 的 .stickyTitleWrap） */}
          <div className={`${styles.container} ${styles.center} ${styles.stickyTitleWrap}`}>
            <span className={styles.eyebrow}>TOOLS</span>
            <h1 className={styles.sectionTitle}>我的房子行情多少？沙鹿・梧棲・清水・龍井</h1>
          </div>
          <div className={`${styles.container} ${styles.center}`}>
            <p className={styles.sectionDesc}>
              填行政區、建物型態、權狀坪數、屋齡，從內政部實價登錄裡挑出條件相近的成屋成交，
              算出您這間的最低、中價位、最高總價（每坪單價一起附上）；比對用的每一筆成交都列給您看，不是憑空一個數字。
            </p>
          </div>

          <div className={styles.container}>
            <EstimateForm values={raw} counts={counts} countMonths={COUNT_MONTHS} errors={parsed.errors} />

            <div id="result" className={css.resultAnchor}>
              {result ? <ResultView result={result} /> : null}
            </div>

            <div className={tax.disclaimer}>
              <strong>⚠️ 這是依實價登錄成交算出來的區間，不是估價報告，也不是任何價格建議。</strong>
              成交價受樓層、座向、屋況、裝潢、車位與買賣雙方狀況影響，同一棟同坪數的房子也會差一到兩成；
              <strong>最低與最高都是單一筆成交</strong>，只代表區間的兩端，中價位（中位數）比較能代表一般狀況。
              比對只看<strong>同行政區、同型態、坪數與屋齡相近</strong>的成屋成交，條件相近的筆數不夠時會逐步放寬
              （期間拉長、坪數與屋齡範圍放大、住宅大樓與華廈合併），用了哪一種條件會寫在結果上。
              坪數比的是<strong>不含車位</strong>的建物面積，推算總價也不含車位；車位的價格請另外看那幾筆成交的車位欄。
              備註有親友、法拍、債權債務、瑕疵等註記的成交不列入計算。透天的每坪單價含土地，跟大樓不能直接比。
              每坪單價依內政部公布的「單價元／平方公尺」換算（已扣除車位），坪數＝平方公尺 × 0.3025。
              內政部資料每月 1、11、21 日發布新一期，<strong>成交到公開約有一到兩個月時間差</strong>。
              {latest ? (
                <>
                  本站資料到內政部最新一期：{periodTextForDisplay(latest.periodText) || latest.batch}。
                </>
              ) : null}
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

// ---------------------------------------------------------------- 結果

function ResultView({ result }: { result: EstimateResult }) {
  const { input } = result;
  const def = estimateTypeDef(input.type);
  const label = tierLabel(result.tier, input);
  const yourHouse = `${input.district}${def.label} ${input.ping} 坪・${input.age < 1 ? "新成屋" : `屋齡 ${input.age} 年`}`;

  if (!result.ok) {
    return (
      <div className={css.noResult} role="status">
        <p>
          <strong>樣本不足，算不出可靠的行情。</strong>
          {yourHouse}：{label.period}、{label.area}、{label.age}、{label.type}的成屋成交只有{" "}
          <strong>{result.sample}</strong> 筆（至少要 {MIN_SHOW} 筆才給數字）
          {result.poolSize === 0
            ? `，${input.district}近 ${POOL_MONTHS / 12} 年根本沒有${def.label}的成交紀錄。`
            : result.poolSize === result.sample
              ? `，${input.district}近 ${POOL_MONTHS / 12} 年的${label.type}成交就只有這幾筆。`
              : `；${input.district}近 ${POOL_MONTHS / 12} 年的${label.type}成交共 ${result.poolSize} 筆，其餘的坪數跟您的差太多。`}
        </p>
        <p>
          可以換個型態或行政區再試，或直接
          <Link href="/card/booking" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`}>
            預約我幫您看
          </Link>
          {" "}—— 條件特殊的房子，用人工找同社區、同路段的成交才準。
        </p>
        {result.comps.length ? <CompsTable comps={result.comps} district={input.district} type={input.type} title="僅有的這幾筆" /> : null}
      </div>
    );
  }

  const { stats } = result;
  const excludedTotal = Object.values(result.excluded).reduce((a, b) => a + b, 0);
  const excludedText = Object.entries(result.excluded)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n} 筆`)
    .join("、");

  return (
    <div className={tax.result} role="status" aria-live="polite">
      <div className={tax.resultHead}>
        {/* 2026-10-26 系統擁有者：「以總價金額為主，單坪金額改小」—— 大字是推算總價，每坪單價退成副標 */}
        <div className={tax.resultLabel}>{yourHouse}・中價位推算總價約</div>
        <div className={tax.resultBig}>
          {fmtWan(stats.totalMedian)}
          <span className={tax.resultUnit}>萬</span>
        </div>
        <div className={tax.resultSub}>
          每坪約 <strong>{stats.median} 萬／坪</strong> × 您的 {input.ping} 坪（不含車位）
        </div>
        <div className={tax.resultFacts}>
          <span className={tax.fact}>比對 {stats.sample} 筆成交</span>
          <span className={tax.fact}>{label.period}</span>
          <span className={tax.fact}>{label.area}</span>
          <span className={tax.fact}>{label.age}</span>
          <span className={tax.fact}>{label.type}</span>
        </div>
      </div>

      <div className={tax.resultBody}>
        {result.tierIndex > 1 ? (
          <div className={tax.resultWarn}>
            <p>
              <strong>條件有放寬。</strong>
              跟您完全相近（近 1 年、坪數 ±20%、屋齡 ±5 年、同型態）的成交不到 {MIN_SAMPLES} 筆，
              所以放寬到「{label.period}・{label.area}・{label.age}・{label.type}」才湊到 {stats.sample} 筆。
              {result.tier.mergeApt ? "住宅大樓與華廈已合併計算。" : ""}
              {result.tier.ageYears === null ? "屋齡沒有限制，新舊房子混在一起，區間會比較寬。" : ""}
            </p>
          </div>
        ) : null}

        <div className={css.three}>
          <PricePointCard
            label="最低成交"
            unit={stats.low.unitWan}
            total={stats.totalLow}
            comp={stats.low.comp}
            district={input.district}
          />
          <PricePointCard label="中價位（中位數）" unit={stats.median} total={stats.totalMedian} mid />
          <PricePointCard
            label="最高成交"
            unit={stats.high.unitWan}
            total={stats.totalHigh}
            comp={stats.high.comp}
            district={input.district}
          />
        </div>

        <div className={css.rangeLines}>
          <div>
            多數成交換算成您的坪數約 <strong>{fmtWan(stats.p25 * input.ping)}～{fmtWan(stats.p75 * input.ping)} 萬</strong>
            <small>（第 25～75 百分位，每坪 {stats.p25}～{stats.p75} 萬／坪）</small>
          </div>
          <div>
            這 {stats.sample} 筆成交的實際總價：最低 <strong>{fmtWan(stats.dealTotalLow)} 萬</strong>・中位{" "}
            <strong>{fmtWan(stats.dealTotalMedian)} 萬</strong>・最高 <strong>{fmtWan(stats.dealTotalHigh)} 萬</strong>
            <small>（官方登錄總價，有車位的含車位）</small>
          </div>
          {excludedTotal ? (
            <div>
              <small>另有 {excludedTotal} 筆條件相近但不列入：{excludedText}（備註有這些字眼的價格不代表行情）。</small>
            </div>
          ) : null}
        </div>

        <CompsTable
          comps={result.comps}
          district={input.district}
          type={input.type}
          title={`拿來比的成交（${result.comps.length < stats.sample ? `最新 ${result.comps.length} 筆，共 ${stats.sample} 筆` : `${stats.sample} 筆`}）`}
        />

        <div className={tax.cta}>
          <p className={tax.ctaText}>想知道您這間在同社區、同路段實際可以談到哪裡？行情區間只是起點。</p>
          <Link href="/card/booking" className={`${styles.btn} ${styles.btnPrimary}`}>
            線上預約，我幫您看
          </Link>
        </div>

        <p className={tax.inlineNote}>
          <strong>最低與最高都是單一筆成交</strong>，各有它的樓層、屋況與車位狀況，不代表您的房子就能賣到或只值那個價；
          中價位比較能代表一般狀況。推算總價＝每坪單價 × 您填的 {input.ping} 坪，<strong>不含車位</strong>。
          資料為內政部實價登錄成屋成交，不構成估價或價格建議。
        </p>
      </div>
    </div>
  );
}

function PricePointCard({
  label,
  unit,
  total,
  comp,
  district,
  mid,
}: {
  label: string;
  unit: number;
  total: number;
  comp?: EstimateComp;
  district?: string;
  mid?: boolean;
}) {
  return (
    <div className={`${css.pt} ${mid ? css.ptMid : ""}`}>
      <div className={css.ptLabel}>{label}</div>
      {/* 總價大字、每坪單價小字（2026-10-26 系統擁有者指定） */}
      <div className={css.ptUnit}>
        {fmtWan(total)}
        <small>萬</small>
      </div>
      <div className={css.ptTotal}>
        每坪約 <strong>{unit}</strong> 萬／坪
      </div>
      {comp && district ? (
        <div className={css.ptRef}>
          {shortAddress(comp.address, district)}
          <br />
          {isoToRoc(comp.dealDate)}・{comp.ping} 坪・{ageText(comp.ageAtDeal)}・{floorText(comp)}
        </div>
      ) : (
        <div className={css.ptRef}>一半成交比它高、一半比它低</div>
      )}
    </div>
  );
}

function CompsTable({ comps, district, type, title }: { comps: EstimateComp[]; district: string; type: string; title: string }) {
  return (
    <>
      <div className={css.compsHead}>
        <h2 className={css.compsTitle}>{title}</h2>
        <Link href={lvrHref(district, type)} className={css.compsMore}>
          看{district}完整實價登錄清單 →
        </Link>
      </div>
      <div className={lvr.tableWrap}>
        <table className={lvr.table}>
          <thead>
            <tr>
              <th>門牌</th>
              <th>成交日</th>
              <th className={lvr.num}>單價</th>
              <th className={lvr.num}>總價</th>
              <th>坪數</th>
              <th>成交時屋齡</th>
              <th>格局</th>
              <th>型態・樓層</th>
              <th>車位</th>
            </tr>
          </thead>
          <tbody>
            {comps.map((c) => (
              <tr key={c.id}>
                <td data-label="門牌" className={lvr.addrCell}>
                  <span className={lvr.addr}>{shortAddress(c.address, district)}</span>
                  {c.flags.map((x) => (
                    <span key={x} className={lvr.flag}>
                      {x}
                    </span>
                  ))}
                </td>
                <td data-label="成交日">
                  <span className={lvr.date}>{isoToRoc(c.dealDate)}</span>
                </td>
                <td data-label="單價" className={lvr.num}>
                  <strong>{c.unitWan}</strong> 萬/坪
                </td>
                <td data-label="總價" className={lvr.num}>
                  <strong>{fmtWan(c.totalWan)}</strong> 萬
                  {c.parkingWan > 0 ? <span className={lvr.sub}>含車位 {fmtWan(c.parkingWan)} 萬</span> : null}
                </td>
                <td data-label="坪數">
                  {c.ping} 坪<span className={lvr.sub}>不含車位</span>
                </td>
                <td data-label="成交時屋齡">{ageText(c.ageAtDeal)}</td>
                <td data-label="格局">{layoutText(c)}</td>
                <td data-label="型態・樓層">
                  {c.type ? estimateTypeDef(c.type).label : "其他"}
                  <span className={lvr.sub}>{floorText(c)}</span>
                </td>
                <td data-label="車位">{c.parkingType || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
