/**
 * /buy —— 買房流程與費用
 *
 * 2026-09-29 系統擁有者提供公司內部文件「買房屋應注意事項.doc」（太平洋房屋制式格式），
 * 我把裡面的費用清單、過戶四階段流程、兩種斡旋方式，改寫成客戶看得懂的表格＋白話說明。
 * **金額／天數／百分比全部照他提供的文件，一個字都沒有自己編或估。**
 *
 * 賣方那半（他說之後會再給）與 FAQ 都還沒做，先做這半；
 * 之後兩頁很可能會互相連結，架構先各自獨立、不要現在就綁死路由。
 *
 * 這頁是純內容、沒有資料庫，跟 /tax 一樣是純靜態頁。
 */
import Link from "next/link";
import type { Metadata } from "next";
import { OWNER, SITE_URL } from "@/config/owner";
import styles from "../home.module.css";
import buy from "./buy.module.css";
import SiteNav from "@/app/_ui/SiteNav";
import SocialLinks from "@/app/_ui/SocialLinks";
import SiteFooter from "@/app/_ui/SiteFooter";

const TITLE = `買房流程與費用一次看懂｜台中海線房仲${OWNER.name}｜沙鹿梧棲清水龍井`;
const DESCRIPTION =
  "第一次買房該準備哪些費用、簽約到交屋大概要幾天、意願書和要約書怎麼選——台中海線房仲黃瑋凱整理成一張表，帶您一步一步走完整個流程。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "買房流程",
    "買房費用",
    "過戶流程",
    "代書費",
    "履保費",
    "意願書",
    "要約書",
    "斡旋金",
    "台中海線房仲",
    OWNER.name,
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: "/buy" },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/buy`,
    title: TITLE,
    description: DESCRIPTION,
    siteName: `${OWNER.name}｜台中海線房仲`,
  },
};

const COSTS: { item: string; desc: string }[] = [
  { item: "服務費", desc: "2%" },
  { item: "契稅", desc: "房屋評定現值 × 6%" },
  { item: "買賣規費", desc: "約 6,000 元（印花稅、謄本費用、買賣地政規費等，實支實付，總價愈高愈多）" },
  { item: "銀行設定規費", desc: "設定金額 1/1000" },
  { item: "火險＋地震險", desc: "約 2,000 元，每年保一次" },
  { item: "銀行開辦費", desc: "約 3,000～6,000 元" },
  { item: "代書費", desc: "簽約費 1,000 元、買賣 12,000 元、貸款設定 5,000 元（依權狀張數增加調整）" },
  { item: "履保費", desc: "成交總價 × 3/10000" },
  { item: "實價登錄費", desc: "2,000 元" },
  { item: "水電瓦斯、房屋稅、地價稅、管理費", desc: "皆分算至交屋當日，由買賣雙方互相找補" },
];

type Stage = {
  name: string;
  days: string;
  payment: string;
  prep: string;
  note: string;
};

const STAGES: Stage[] = [
  {
    name: "① 簽約",
    days: "一天",
    payment: "10% ＋ 服務費 2%",
    prep: "身份證、印章",
    note: "同時確定貸款額度",
  },
  {
    name: "② 備證（用印）",
    days: "三～五天（簽約當天一起確定備證時間）",
    payment: "10%（預收代書費一萬元）",
    prep: "戶口名簿、確定買受人身份（身份證、印章）、確定貸款銀行、扣繳憑單、財力證明",
    note: "",
  },
  {
    name: "③ 完稅",
    days: "備證後約 14～21 天（以稅單核發日期為準）",
    payment: "10%（繳交契稅）",
    prep: "押尾款本票一張，交由代書保管",
    note: "準備過戶到買受人名下",
  },
  {
    name: "④ 交屋",
    days: "完稅後約 10 天",
    payment: "70%（多為貸款撥款；若不需貸款 7 成，不足尾款以現金補足）",
    prep: "交付尾款、確認屋況",
    note: "完成交屋手續：結清代書費、保費、補貼房屋稅／地價稅、結清水電瓦斯管理費、確認產權無誤",
  },
];

export default function BuyPage() {
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

      <SocialLinks variant="float" />

      <main>
        <section className={styles.section}>
          <div className={`${styles.container} ${styles.center}`}>
            <SocialLinks variant="bar" align="center" />
            <span className={styles.eyebrow}>BUYING GUIDE</span>
            <h1 className={styles.sectionTitle}>買房流程與費用</h1>
            <p className={styles.sectionDesc}>
              買房除了房屋總價，還有幾筆一定會遇到的費用；簽約之後到交屋，也有固定要走的幾個階段。
              先把這些整理成一張表給您參考，實際帶看時我會再依您的物件與貸款狀況，把確切金額算給您聽。
            </p>
          </div>

          {/* ── 買方費用一覽 ── */}
          <div className={`${styles.container} ${styles.center} ${styles.aboutBlock}`}>
            <h2 className={styles.aboutSubTitle}>買方費用一覽</h2>
            <p className={styles.sectionDesc}>
              下面這幾項是買方通常需要負擔的費用。多數會依總價、坪數、權狀張數調整，數字僅供參考。
            </p>
          </div>
          <div className={styles.container}>
            <div className={buy.tableWrap}>
              <table className={buy.table}>
                <thead>
                  <tr>
                    <th>項目</th>
                    <th>說明</th>
                  </tr>
                </thead>
                <tbody>
                  {COSTS.map((row) => (
                    <tr key={row.item}>
                      <td className={buy.itemCell}>{row.item}</td>
                      <td>{row.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── 過戶流程 ── */}
          <div className={`${styles.container} ${styles.center} ${styles.aboutBlock}`}>
            <h2 className={styles.aboutSubTitle}>簽約到交屋，四個階段</h2>
            <p className={styles.sectionDesc}>
              從簽約到真正拿到鑰匙，大致會走完下面四個階段，合計大約一個半月到兩個月，
              實際天數會因為稅單核發、貸款銀行作業時間而有出入。
            </p>
          </div>
          <div className={styles.container}>
            <div className={buy.tableWrap}>
              <table className={buy.table}>
                <thead>
                  <tr>
                    <th>階段</th>
                    <th>約需天數</th>
                    <th>付款</th>
                    <th>要準備</th>
                  </tr>
                </thead>
                <tbody>
                  {STAGES.map((s) => (
                    <tr key={s.name}>
                      <td className={buy.itemCell}>{s.name}</td>
                      <td>{s.days}</td>
                      <td>{s.payment}</td>
                      <td>
                        {s.prep}
                        {s.note ? <span className={buy.stageNote}>{s.note}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 表格是給查找用的；這裡用白話再走一次，給第一次買房、不熟流程的人看 */}
            <div className={buy.narrative}>
              <p>
                <strong>簽約當天</strong>先付總價 10% 加 2% 服務費，同時確定貸款額度大概能貸多少。
              </p>
              <p>
                接下來三到五天是<strong>備證</strong>：準備戶口名簿、身份證、印章，確定要用哪家銀行貸款，
                同時再付一筆代書費（一萬元）當作預收款。
              </p>
              <p>
                備證完成後，稅單核發需要一到三週，這段時間叫<strong>完稅</strong>，會再繳一筆總價
                10% 當作契稅款，同時準備一張本票交給代書保管，作為交屋前的保障。
              </p>
              <p>
                完稅之後大約十天可以<strong>交屋</strong>：剩下的尾款（多半是貸款撥下來的錢）付清、
                確認屋況沒問題，結清代書費、保險費、水電瓦斯與稅費，就正式交屋、拿到鑰匙。
              </p>
            </div>
          </div>

          {/* ── 斡旋方式 ── */}
          <div className={`${styles.container} ${styles.center} ${styles.aboutBlock}`}>
            <h2 className={styles.aboutSubTitle}>看中意了，怎麼出價？</h2>
            <p className={styles.sectionDesc}>出價通常有兩種方式，差別在要不要先付一筆錢，違約時的算法也不一樣。</p>
          </div>
          <div className={styles.container}>
            <div className={buy.offerGrid}>
              <div className={buy.offerCard}>
                <h3>意願書</h3>
                <p className={buy.offerPrice}>要先付出價金 5%（以您出的價格計算）</p>
                <ul>
                  <li>屋主同意 → 3 日內依太平洋房屋指定地點簽約，出價金直接算進房屋價金裡</li>
                  <li>屋主不同意 → 2 個銀行營業日內無息退還</li>
                  <li>違約金以出價金 5% 計算</li>
                </ul>
              </div>
              <div className={buy.offerCard}>
                <h3>要約書</h3>
                <p className={buy.offerPrice}>不用先付錢</p>
                <ul>
                  <li>屋主同意 → 一樣 3 日內依太平洋房屋指定地點簽約</li>
                  <li>違約金以成交價 3% 計算</li>
                </ul>
              </div>
            </div>
          </div>

          <div className={styles.container}>
            <p className={buy.disclaimer}>
              ⚠️ 以上費用項目、比例與天數為一般行情與作業慣例，僅供參考；
              <strong>實際金額會因物件、貸款成數、承辦銀行與最新法規而不同</strong>，
              確切數字請以個案實際計算與合約內容為準。稅費相關法規如有異動，也會影響上述比例。
            </p>

            <div className={`${styles.center} ${styles.aboutBlock}`}>
              <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/card/booking">
                有問題想先問清楚？線上預約諮詢
              </Link>
              <div>
                <Link href="/" className={buy.backLink}>
                  ← 回首頁
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
