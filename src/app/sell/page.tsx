/**
 * /sell —— 賣房流程與費用
 *
 * 2026-09-29 系統擁有者提供公司內部文件「賣屋應注意事項.doc」（太平洋房屋制式格式），
 * 跟 /buy 同一套做法：費用清單、過戶四階段（賣方視角：什麼時候收款、什麼時候繳稅）、
 * 房地合一稅 2.0 稅率表、買方出價的兩種方式，改寫成表格＋白話說明。
 * **金額／天數／百分比全部照他提供的文件，一個字都沒有自己編或估。**
 *
 * 房地合一稅那張表在轉檔時被打得最亂，拼回來後拿 src/lib/land-tax.ts 的
 * RESIDENT_RATE（45／35／20／15%，持有年限四段）交叉核對過，一致。
 * 營利事業那一列（45／35／20%，超過 5 年一律 20%）試算器沒做，照文件放。
 *
 * 樣式直接共用 ../buy/buy.module.css —— 兩頁是同一種版面，不另抄一份。
 */
import Link from "next/link";
import type { Metadata } from "next";
import { OWNER, SITE_URL } from "@/config/owner";
import styles from "../home.module.css";
import buy from "../buy/buy.module.css";
import SiteNav from "@/app/_ui/SiteNav";
import SocialLinks from "@/app/_ui/SocialLinks";
import SiteFooter from "@/app/_ui/SiteFooter";

const TITLE = `賣房流程與費用一次看懂｜台中海線房仲${OWNER.name}｜沙鹿梧棲清水龍井`;
const DESCRIPTION =
  "賣房要繳哪些稅和費用、簽約到交屋各階段什麼時候收款、買方出價的兩種方式——台中海線房仲黃瑋凱整理成一張表，讓您在委託前心裡有底。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "賣房流程",
    "賣房費用",
    "賣房要繳什麼稅",
    "土地增值稅",
    "房地合一稅",
    "價金履約保證",
    "過戶流程",
    "台中海線房仲",
    OWNER.name,
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: "/sell" },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/sell`,
    title: TITLE,
    description: DESCRIPTION,
    siteName: `${OWNER.name}｜台中海線房仲`,
  },
};

const COSTS: { item: string; desc: string }[] = [
  { item: "服務費", desc: "4%（以成交價計），從履保專戶扣除" },
  { item: "代書費", desc: "貸款塗銷費 2,000 元（依權狀張數增加）＋簽約費 1,000 元" },
  { item: "土地增值稅", desc: "依「公告現值 − 前次移轉現值」，按 20%／30%／40% 稅率 × 面積計算" },
  {
    item: "房地合一稅（2.0 版）",
    desc: "105 年 1 月 1 日以後取得、且出售的房地適用，稅率依持有期間而定（見下表）；申報書代辦費 5,000～6,000 元",
  },
  {
    item: "價金履約保證",
    desc: "買賣價金萬分之六，買賣雙方各負擔一半；萬分之六未達 600 元者，以 600 元計收",
  },
  { item: "實價登錄費", desc: "2,000 元" },
  { item: "水電瓦斯、房屋稅、地價稅、管理費", desc: "皆分算至交屋當日，由買賣雙方互相找補" },
];

/** 房地合一稅 2.0 稅率。個人那一欄跟 lib/land-tax.ts 的 RESIDENT_RATE 核對過一致 */
const TAX_RATES: { holding: string; person: string; company: string }[] = [
  { holding: "持有 2 年以內", person: "45%", company: "45%" },
  { holding: "持有超過 2 年、未逾 5 年", person: "35%", company: "35%" },
  { holding: "持有超過 5 年、未逾 10 年", person: "20%", company: "20%" },
  { holding: "持有超過 10 年", person: "15%", company: "20%" },
];

type Stage = {
  name: string;
  days: string;
  money: string;
  prep: string;
  note: string;
};

const STAGES: Stage[] = [
  {
    name: "① 簽約",
    days: "一天",
    money: "收 10%；服務費 4% 從履保專戶扣除",
    prep: "身份證、印章、房屋稅單、地價稅單、權狀正本",
    note: "",
  },
  {
    name: "② 備證（用印）",
    days: "三～五天（簽約當天一起確定備證時間）",
    money: "收 10%",
    prep: "印鑑證明二份",
    note: "",
  },
  {
    name: "③ 完稅",
    days: "備證後約 14～21 天（以稅單核發日期為準）",
    money: "收 10%；繳交土地增值稅",
    prep: "買方押尾款本票一張，交由代書保管",
    note: "",
  },
  {
    name: "④ 交屋",
    days: "完稅後約 10 天",
    money: "收 70%（多為買方貸款撥款；房子若還有貸款，由買方的貸款銀行直接替您清償餘額）",
    prep: "交付尾款、確認屋況",
    note: "完成交屋手續：結清代書費、火險、補貼房屋稅／地價稅、結清水電瓦斯管理費、確認產權無誤",
  },
];

export default function SellPage() {
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
            <span className={styles.eyebrow}>SELLING GUIDE</span>
            <h1 className={styles.sectionTitle}>賣房流程與費用</h1>
            <p className={styles.sectionDesc}>
              賣房最常被問的兩件事：要繳哪些稅和費用、錢什麼時候進來。
              先把這些整理成一張表給您參考，實際委託時我會再依您的房子與持有狀況，把確切金額算給您聽。
            </p>
          </div>

          {/* ── 賣方費用一覽 ── */}
          <div className={`${styles.container} ${styles.center} ${styles.aboutBlock}`}>
            <h2 className={styles.aboutSubTitle}>賣方費用一覽</h2>
            <p className={styles.sectionDesc}>
              下面這幾項是賣方通常需要負擔的費用與稅。土地增值稅與房地合一稅會依持有年限差很多，數字僅供參考。
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

          {/* ── 房地合一稅稅率 ── */}
          <div className={`${styles.container} ${styles.center} ${styles.aboutBlock}`}>
            <h2 className={styles.aboutSubTitle}>房地合一稅 2.0 稅率</h2>
            <p className={styles.sectionDesc}>
              持有愈久稅率愈低。想知道自己那間要繳多少，
              <Link href="/tax">站上的房地合一稅試算</Link>填入取得與出售的日期和價格就算得出來。
            </p>
          </div>
          <div className={styles.container}>
            <div className={buy.tableWrap}>
              <table className={buy.table}>
                <thead>
                  <tr>
                    <th>持有期間</th>
                    <th>個人（境內）</th>
                    <th>營利事業（境內）</th>
                  </tr>
                </thead>
                <tbody>
                  {TAX_RATES.map((row) => (
                    <tr key={row.holding}>
                      <td className={buy.itemCell}>{row.holding}</td>
                      <td>{row.person}</td>
                      <td>{row.company}</td>
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
              價金分四次進來：簽約、備證、完稅各 10%，交屋時收剩下的 70%。
              合計大約一個半月到兩個月，實際天數會因為稅單核發、買方貸款銀行作業時間而有出入。
            </p>
          </div>
          <div className={styles.container}>
            <div className={buy.tableWrap}>
              <table className={buy.table}>
                <thead>
                  <tr>
                    <th>階段</th>
                    <th>約需天數</th>
                    <th>收款／付款</th>
                    <th>要準備</th>
                  </tr>
                </thead>
                <tbody>
                  {STAGES.map((s) => (
                    <tr key={s.name}>
                      <td className={buy.itemCell}>{s.name}</td>
                      <td>{s.days}</td>
                      <td>{s.money}</td>
                      <td>
                        {s.prep}
                        {s.note ? <span className={buy.stageNote}>{s.note}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 表格是給查找用的；這裡用白話再走一次，給第一次賣房的人看 */}
            <div className={buy.narrative}>
              <p>
                <strong>簽約當天</strong>先收到總價 10%。服務費 4% 是從履保專戶裡扣，不用另外準備現金。
                要帶身份證、印章、房屋稅單、地價稅單和權狀正本。
              </p>
              <p>
                接下來三到五天是<strong>備證</strong>：主要是去戶政事務所申請兩份印鑑證明。這個階段再收 10%。
              </p>
              <p>
                備證完成後，稅單核發需要一到三週，這段時間叫<strong>完稅</strong>：再收 10%，同時繳土地增值稅；
                買方會押一張尾款本票給代書保管，作為交屋前的保障。
              </p>
              <p>
                完稅之後大約十天<strong>交屋</strong>：剩下的 70% 多半是買方的貸款撥下來的錢。房子如果還有貸款，
                由買方的貸款銀行直接替您清償餘額，不用自己先籌錢還清。結清代書費、保險費、水電瓦斯與稅費，
                確認產權無誤，就正式交屋。
              </p>
            </div>
          </div>

          {/* ── 買方出價的兩種方式 ── */}
          <div className={`${styles.container} ${styles.center} ${styles.aboutBlock}`}>
            <h2 className={styles.aboutSubTitle}>買方出價時，會用哪一種？</h2>
            <p className={styles.sectionDesc}>
              有人看中您的房子出價時，會走下面兩種方式之一。差別在買方要不要先付一筆錢，違約時的算法也不一樣。
            </p>
          </div>
          <div className={styles.container}>
            <div className={buy.offerGrid}>
              <div className={buy.offerCard}>
                <h3>意願書</h3>
                <p className={buy.offerPrice}>買方先付出價金 5%（以買方出的價格計算）</p>
                <ul>
                  <li>您同意 → 3 日內依太平洋房屋指定地點簽約，出價金直接算進房屋價金裡</li>
                  <li>您不同意 → 2 個銀行營業日內無息退還給買方</li>
                  <li>違約金以出價金 5% 計算</li>
                </ul>
              </div>
              <div className={buy.offerCard}>
                <h3>要約書</h3>
                <p className={buy.offerPrice}>買方不用先付錢</p>
                <ul>
                  <li>您同意 → 一樣 3 日內依太平洋房屋指定地點簽約</li>
                  <li>違約金以成交價 3% 計算</li>
                </ul>
              </div>
            </div>
          </div>

          <div className={styles.container}>
            <p className={buy.disclaimer}>
              ⚠️ 以上費用項目、比例與天數為一般行情與作業慣例，僅供參考；
              <strong>實際金額會因物件、持有年限、買方貸款狀況與最新法規而不同</strong>，
              土地增值稅與房地合一稅以稅捐機關核定為準，確切數字請以個案實際計算與合約內容為準。
            </p>

            <p className={buy.crossLink}>
              要買房？<Link href="/buy">看買房流程與費用 →</Link>
            </p>

            <div className={`${styles.center} ${styles.aboutBlock}`}>
              <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/card/booking">
                想先知道自己的房子能賣多少？線上預約諮詢
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
