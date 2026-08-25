/**
 * / — 黃瑋凱個人官網首頁
 * 預約區塊直接導到本站的線上預約系統 /card/booking，不再只丟 LINE。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { OWNER, SOCIAL, SITE_URL } from "@/config/owner";
import { INTRO_LINES, AREAS } from "@/config/profile";
import { HOME_FEATURED_COUNT } from "@/config/listings";
import { getPublicListings } from "@/lib/listings";
import styles from "./home.module.css";
// 卡片樣式跟 /listings 共用同一份，改一處兩邊都會變
import lst from "./listings/listings.module.css";
import FeaturedTitle from "./listings/FeaturedTitle";
import PhotoCarousel from "./listings/PhotoCarousel";
import VisitCounter from "./_visits/VisitCounter";

// 標題只放三項最有搜尋量的 —— <title> 太長會被 Google 截掉，五項塞不下。
// 完整五項寫在下面的 description 裡。
const TITLE = `台中海線房仲${OWNER.name}｜買賣租賃・稅費諮詢・市場分析｜沙鹿梧棲清水龍井`;
const DESCRIPTION = `${OWNER.name}，${OWNER.company}梧棲新市鎮旗艦店副店長，112、113、114年連續三年榮獲年度千萬經紀人。深耕台中海線沙鹿、梧棲、清水、龍井，提供買賣租賃、資金配置規劃、稅費諮詢、市場分析、裝潢資源媒合一站式服務，歡迎線上預約或加LINE諮詢。`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "台中海線房仲",
    "沙鹿房仲",
    "沙鹿買房",
    "梧棲房仲",
    "清水房仲",
    "龍井房仲",
    OWNER.name,
    OWNER.company,
    "海線房價行情",
    "房產稅費諮詢",
    "千萬經紀人",
  ],
  authors: [{ name: OWNER.name }],
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "zh_TW",
    title: `台中海線房仲${OWNER.name}｜買賣租賃・稅費諮詢・市場分析`,
    description:
      "112、113、114年連續三年年度千萬經紀人。深耕台中海線沙鹿、梧棲、清水、龍井，提供買賣租賃、資金配置規劃、稅費諮詢、市場分析、裝潢資源媒合一站式服務。",
    url: "/",
    siteName: `${OWNER.name}｜台中海線房仲`,
    images: [{ url: "/profile.jpg", width: 1029, height: 1543, alt: `${OWNER.name}形象照` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `台中海線房仲${OWNER.name}｜買賣租賃・稅費諮詢・市場分析`,
    description: "112、113、114年連續三年年度千萬經紀人。深耕台中海線沙鹿、梧棲、清水、龍井。",
    images: ["/profile.jpg"],
  },
};



/**
 * 服務項目。2026-08-23 系統擁有者拍板：從三項擴成五項。
 *
 * ⚠️ 文案避開「保證」「一定」「增值」這類字眼 —— 不動產廣告不能給報酬承諾。
 *    原本「資產配置」寫的是「兼顧長期資產增值」，改名成「資金配置規劃」時
 *    一併改成談「買得起的價格帶」，不談增值。
 *
 * ⚠️ 卡片數量改變時記得看一眼版面：.serviceGrid 是「最後一排置中」的排法，
 *    3 或 6 張會剛好填滿，4、5 張最後一排會置中，不會靠左留一個洞。
 */
const SERVICES = [
  {
    icon: "🏘️",
    title: "買賣／租賃",
    desc: "買、賣、出租、找租屋都能處理。從帶看議價到過戶點交，每一步先說清楚。",
    tag: "Sales & Leasing",
  },
  {
    icon: "💰",
    title: "資金配置規劃",
    desc: "把自備款、貸款成數與每月負擔一起算出來，抓出真正買得起的價格帶。",
    tag: "Financial Planning",
  },
  {
    icon: "🧾",
    title: "稅費諮詢",
    desc: "房地合一稅、契稅、代書費先算清楚，不多繳不該繳的稅。站上就能自己試算。",
    tag: "Tax Consulting",
  },
  {
    icon: "📊",
    title: "市場分析",
    desc: "用實價登錄與海線在地成交行情，告訴您這個價格合不合理，出價訂價都有依據。",
    tag: "Market Analysis",
  },
  {
    icon: "🛠️",
    title: "裝潢資源媒合",
    desc: "簡易裝潢建議與資源媒合，用最合適的預算讓房子呈現最好的樣貌。",
    tag: "Renovation",
  },
];

/**
 * 稅費試算工具。2026-08-23 系統擁有者拍板：改成自己站上算，不再把客戶丟到外部網站。
 *
 * 原本的顧慮是「自己算等於給稅務意見，而且稅率一改就會過期」。
 * 處理方式：算法抽到 src/lib/land-tax.ts，每個數字都註明官方出處；
 * /tax 頁把計算過程整個攤開、標明法規核對日期，並保留免責聲明。
 * 稅率變動時只要改 land-tax.ts 一個檔。
 */
const TOOLS = [
  {
    icon: "🏠",
    title: "房地合一稅試算",
    desc: "賣房前先算清楚要繳多少稅。填入取得與出售的日期與價格，馬上算出持有期間、適用稅率與應納稅額，還會把每一步怎麼來的攤開給你看。",
    source: "所得稅法第 14 條之 4 與財政部規定",
    href: "/tax",
  },
  {
    icon: "🏦",
    title: "房貸月付金試算",
    desc: "先抓出每個月要還多少。填入貸款金額、利率、年限與寬限期，算出月付金與總利息，買房的預算才抓得準。",
    source: "本息平均攤還公式",
    href: "/tax",
  },
  {
    icon: "🔑",
    title: "租金補貼試算",
    desc: "租屋族先算算看能領多少。填入所在縣市、行政區與家庭狀況，就算出每月可領補貼，海線各行政區金額不一樣，選錯區會差很多。",
    source: "內政部 300 億元中央擴大租金補貼分級表",
    href: "/tax",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "RealEstateAgent",
  name: OWNER.name,
  image: `${SITE_URL}/profile.jpg`,
  url: SITE_URL,
  telephone: "+886-909-787-865",
  areaServed: AREAS.map((area) => ({ "@type": "Place", name: `台中市${area.name}` })),
  address: {
    "@type": "PostalAddress",
    addressLocality: "台中市",
    addressRegion: "台中市",
    addressCountry: "TW",
  },
  award: "112、113、114年連續三年年度千萬經紀人",
  makesOffer: SERVICES.map((service) => ({
    "@type": "Offer",
    itemOffered: { "@type": "Service", name: service.title },
  })),
  sameAs: [SOCIAL.line],
};

/**
 * 物件在資料庫裡，但首頁仍然是「靜態產生 ＋ 定時重生」——首頁不能為了讀物件變慢。
 * 後台存檔時會 revalidatePath("/")，所以改完立刻生效；下面的秒數只是保險。
 */
export const revalidate = 300;

export default async function HomePage() {
  const listings = await getPublicListings();
  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className={styles.header}>
        <div className={styles.navWrap}>
          <a href="#top" className={styles.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.brandLogo}
              src="/kaixing-mark.png"
              alt="凱心成家"
              width={40}
              height={40}
            />
            <span>
              凱心成家
              <small className={styles.brandSub}>
                {OWNER.company} 台中海線房仲
              </small>
            </span>
          </a>
          <ul className={styles.nav}>
            <li><a href="#about">關於我</a></li>
            <li><a href="#listings">精選好案</a></li>
            <li><a href="#services">服務項目</a></li>
            {/* 2026-08-21 恢復入口。原本雪藏是因為「土地使用分區」那層的建商名沒核對完；
                該層已從 /map 移除，現在頁面上是系統擁有者自己確認過的 39 個建案。 */}
            <li><Link href="/map">重劃區建案</Link></li>
            <li><a href="#tools">稅費試算</a></li>
            <li><a href="#booking">預約諮詢</a></li>
          </ul>
          <div className={styles.navCta}>
            <a className={`${styles.btn} ${styles.btnOutline} ${styles.btnSm} ${styles.navCtaPhone}`} href={`tel:${OWNER.phoneRaw}`}>
              📞 {OWNER.phone}
            </a>
            <Link className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`} href="/card/booking">
              線上預約
            </Link>
          </div>
        </div>
      </header>

      <main id="top">
        {/* ---------------- HERO ---------------- */}
        <section className={styles.hero} aria-label={`${OWNER.name}個人形象介紹`}>
          <div className={styles.heroInner}>
            <div>
              <span className={styles.eyebrow}>台中海線資產配置專家</span>
              <h1 className={styles.heroTitle}>
                <span>房產找瑋凱</span> <span className={styles.accent}>安心不踩雷</span>
              </h1>
              <p className={styles.heroRole}>
                {/* 太平洋房屋 logo。owner.ts 的 companyLogo 沒填就整個不出現，不會破圖 */}
                {OWNER.companyLogo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className={styles.heroRoleLogo}
                    src={OWNER.companyLogo}
                    alt={OWNER.company}
                    /* 寫死原圖尺寸讓瀏覽器先把位置留好，圖載進來時整行不會跳。
                       實際顯示尺寸由 CSS 的 height:1.35em 決定，這兩個值只是比例來源。 */
                    width={287}
                    height={286}
                  />
                )}
                {OWNER.title}
              </p>
              <p className={styles.heroTagline}>
                連續三年千萬經紀人的實戰經驗，陪您把買房、賣房、資產配置的每一個決定都做對——不只成交，更要成交得安心。
              </p>
              <div className={styles.heroBadges}>
                <span className={styles.heroBadge}>🏆 112・113・114年連續三年千萬經紀人</span>
                <span className={styles.heroBadge}>📍 服務區域：沙鹿・梧棲・清水・龍井</span>
              </div>
              <div className={styles.heroCta}>
                <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/card/booking">
                  立即線上預約
                </Link>
                <a className={`${styles.btn} ${styles.btnLine}`} href={SOCIAL.line} target="_blank" rel="noopener noreferrer">
                  加LINE：@a8865
                </a>
                <a className={`${styles.btn} ${styles.btnOutline}`} href={`tel:${OWNER.phoneRaw}`}>
                  📞 {OWNER.phone}
                </a>
              </div>
            </div>
            <div className={styles.heroPhotoWrap}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.heroPhoto}
                src="/profile.jpg"
                alt={`${OWNER.name}－${OWNER.company}梧棲新市鎮旗艦店副店長形象照`}
                width={320}
                height={400}
              />
              <span className={styles.heroPhotoTag}>千萬經紀人・{OWNER.name}</span>
            </div>
          </div>
        </section>

        {/* ---------------- 關於我（導引；完整內容在 /about）----------------
            原本自我介紹＋服務區域＋戰績整包都在首頁，光這段就佔首頁 26%
            的長度（手機 2426px）。搬到 /about 之後這裡只留自我介紹當鉤子，
            剩下的靠按鈕帶過去 —— 跟精選好案同一個模式。
            戰績與服務區域不放這裡也沒關係，hero 的兩個徽章已經寫著
            「連續三年千萬經紀人」與「服務區域：沙鹿・梧棲・清水・龍井」。 */}
        <section id="about" className={styles.section}>
          <div className={`${styles.container} ${styles.center}`}>
            <span className={styles.eyebrow}>ABOUT ME</span>
            <h2 className={styles.sectionTitle}>關於我</h2>
            <div className={styles.aboutIntro}>
              <div className={styles.aboutIntroLines}>
                {INTRO_LINES.map((line) => (
                  <p key={line.text} className={styles.aboutIntroLine}>
                    {/* 圖示是裝飾，語意已經在文字裡，所以對螢幕閱讀器隱藏 */}
                    <span className={styles.aboutIntroIcon} aria-hidden="true">
                      {line.icon}
                    </span>
                    {line.text}
                  </p>
                ))}
              </div>
            </div>
            <div className={styles.aboutMore}>
              <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/about">
                更多關於我
              </Link>
            </div>
          </div>
        </section>

        {/* ---------------- 精選好案 ---------------- */}
        <section id="listings" className={styles.section}>
          <div className={`${styles.container} ${styles.center}`}>
            <span className={styles.eyebrow}>LISTINGS</span>
            {/* 標題與 /listings 共用同一個元件，兩邊講的話保證一致。
                導覽列那項維持短的「精選好案」—— 那是選單，塞不下整句 */}
            <FeaturedTitle as="h2" className={styles.sectionTitle} />
            <p className={styles.sectionDesc}>
              台中海線目前主打的物件。看中意的直接約時間，我陪您一間一間看清楚再決定。
            </p>
          </div>
          <div className={styles.container}>
            {listings.length > 0 && (
              <div className={lst.grid}>
                {listings.slice(0, HOME_FEATURED_COUNT).map((item, i) => (
                  /* 卡片不能整張包在 <a> 裡了 —— 相簿有圓點與箭頭，
                     按鈕放進連結裡是無效的 HTML，點擊行為也會打架。
                     改成照片區獨立，文字區整塊當連結。 */
                  <article key={item.slug} className={lst.card}>
                    <PhotoCarousel
                      photos={item.photos}
                      alt={`${item.area}－${item.title}`}
                      eager={i === 0}
                    />
                    <Link
                      className={lst.body}
                      href="/listings"
                      data-listing-slug={item.slug}
                      data-listing-action="home"
                    >

                      <span className={lst.area}>{item.area}</span>
                      <h3 className={lst.title}>{item.title}</h3>
                      <ul className={lst.points}>
                        {item.points.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                      <span className={lst.action}>物件資訊 →</span>
                    </Link>
                  </article>
                ))}
              </div>
            )}
            <div className={`${styles.center} ${styles.listingsMore}`}>
              <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/listings">
                看全部好案
              </Link>
            </div>
          </div>
        </section>

        {/* ---------------- 服務項目 ---------------- */}
        <section id="services" className={styles.section}>
          <div className={`${styles.container} ${styles.center}`}>
            <span className={styles.eyebrow}>SERVICES</span>
            <h2 className={styles.sectionTitle}>我提供的服務項目</h2>
            <p className={styles.sectionDesc}>不只帶看，更陪您把房產相關的每個環節想清楚、做到位。</p>
          </div>
          <div className={styles.container}>
            <div className={styles.serviceGrid}>
              {SERVICES.map((service) => (
                <div key={service.title} className={styles.serviceCard}>
                  <div className={styles.serviceIcon}>{service.icon}</div>
                  <h3>{service.title}</h3>
                  <p>{service.desc}</p>
                  <span className={styles.tag}>{service.tag}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- 稅費試算 ---------------- */}
        <section id="tools" className={styles.section}>
          <div className={`${styles.container} ${styles.center}`}>
            <span className={styles.eyebrow}>TOOLS</span>
            <h2 className={styles.sectionTitle}>稅費試算</h2>
            <p className={styles.sectionDesc}>
              買賣房子最怕算漏了。這兩個試算就在站上，不用跳到別的網站，算完還看得到每一步怎麼來的。
            </p>
          </div>
          <div className={styles.container}>
            <div className={styles.toolGrid}>
              {TOOLS.map((tool) => (
                <Link key={tool.title} className={styles.toolCard} href={tool.href}>
                  <div className={styles.toolIcon}>{tool.icon}</div>
                  <h3>{tool.title}</h3>
                  <p>{tool.desc}</p>
                  <span className={styles.toolSource}>依據：{tool.source}</span>
                  <span className={styles.toolGo}>開始試算 →</span>
                </Link>
              ))}
            </div>
            <p className={styles.toolDisclaimer}>
              ⚠️ 試算<strong>僅供參考</strong>。房地合一稅之<strong>實際稅額以國稅局核定為準</strong>；
              貸款條件與利率以各銀行實際審核結果為準。稅率與相關法規會調整，
              試算頁面上有標明法規核對日期與法源出處。試算結果不構成稅務或財務意見。
            </p>
          </div>
        </section>


        {/* ---------------- 預約系統 ---------------- */}
        <section id="booking" className={`${styles.section} ${styles.contact}`}>
          <div className={`${styles.container} ${styles.center}`}>
            <span className={styles.eyebrow}>BOOKING</span>
            <h2 className={styles.sectionTitle}>預約諮詢</h2>
            <p className={styles.sectionDesc}>
              線上挑好時間直接成立預約，不用來回敲時間；或直接加LINE，馬上開始對話。
            </p>
          </div>
          <div className={styles.container}>
            <div className={styles.contactGrid}>
              <div className={styles.bookingCard}>
                <div className={styles.bookingIcon}>📅</div>
                <h3>線上預約諮詢</h3>
                <p>自己挑時段，送出就完成，省下來回敲時間的訊息。</p>
                <ol className={styles.bookingSteps}>
                  <li className={styles.bookingStep}>
                    <span className={styles.bookingStepNum}>1</span>
                    <span>選擇諮詢主題：買賣租賃、資金規劃、稅費、市場分析或裝潢</span>
                  </li>
                  <li className={styles.bookingStep}>
                    <span className={styles.bookingStepNum}>2</span>
                    <span>挑選方便的日期、時間與時長</span>
                  </li>
                  <li className={styles.bookingStep}>
                    <span className={styles.bookingStepNum}>3</span>
                    <span>留下聯絡方式，預約即刻成立</span>
                  </li>
                </ol>
                <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/card/booking">
                  開始預約
                </Link>
                <p className={styles.bookingNote}>不確定要談什麼？也可以先加LINE聊聊</p>
              </div>

              <div className={styles.contactCard}>
                <div className={styles.contactRow}>
                  <div className={styles.ic}>📞</div>
                  <div>
                    <div className={styles.contactLabel}>電話聯絡</div>
                    <div className={styles.contactValue}>{OWNER.phone}</div>
                  </div>
                </div>
                <div className={styles.contactRow}>
                  <div className={styles.ic}>💬</div>
                  <div>
                    <div className={styles.contactLabel}>LINE 官方帳號</div>
                    <div className={styles.contactValue}>@a8865</div>
                  </div>
                </div>
                <div className={styles.contactRow}>
                  <div className={styles.ic}>📍</div>
                  <div>
                    <div className={styles.contactLabel}>服務區域</div>
                    <div className={styles.contactValue}>台中市海線：沙鹿・梧棲・清水・龍井</div>
                  </div>
                </div>
                <a className={`${styles.btn} ${styles.btnLine}`} href={SOCIAL.line} target="_blank" rel="noopener noreferrer">
                  立即加LINE，免費諮詢
                </a>
                <a className={`${styles.btn} ${styles.btnOutline}`} href={`tel:${OWNER.phoneRaw}`} style={{ borderColor: "rgba(255,255,255,.5)", color: "#fff" }}>
                  直接撥打電話
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>
          <strong>{OWNER.name}</strong>｜{OWNER.title}｜服務區域：台中市海線 沙鹿・梧棲・清水・龍井
        </p>
        <p>電話 {OWNER.phone}　｜　LINE @a8865</p>
        <p>&copy; {new Date().getFullYear()} Huang Wei-Kai Realty. All rights reserved.</p>
        <div className={styles.footerVisits}>
          <VisitCounter />
        </div>
      </footer>

      <a
        className={styles.floatLine}
        href={SOCIAL.line}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="加LINE諮詢"
      >
        💬
      </a>
    </div>
  );
}
