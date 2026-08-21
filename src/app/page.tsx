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

const TITLE = `台中海線房仲${OWNER.name}｜資產配置・稅務諮詢・簡易裝潢｜沙鹿梧棲清水龍井`;
const DESCRIPTION = `${OWNER.name}，${OWNER.company}資深不動產經紀人，112、113、114年連續三年榮獲年度千萬經紀人。深耕台中海線沙鹿、梧棲、清水、龍井，提供資產配置、稅務諮詢、簡易裝潢一站式服務，歡迎線上預約或加LINE諮詢。`;

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
    "資產配置專家",
    "房產稅務諮詢",
    "千萬經紀人",
  ],
  authors: [{ name: OWNER.name }],
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "zh_TW",
    title: `台中海線房仲${OWNER.name}｜資產配置・稅務諮詢・簡易裝潢`,
    description:
      "112、113、114年連續三年年度千萬經紀人。深耕台中海線沙鹿、梧棲、清水、龍井，提供資產配置、稅務諮詢、簡易裝潢一站式服務。",
    url: "/",
    siteName: `${OWNER.name}｜台中海線房仲`,
    images: [{ url: "/profile.jpg", width: 1029, height: 1543, alt: `${OWNER.name}形象照` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `台中海線房仲${OWNER.name}｜資產配置・稅務諮詢・簡易裝潢`,
    description: "112、113、114年連續三年年度千萬經紀人。深耕台中海線沙鹿、梧棲、清水、龍井。",
    images: ["/profile.jpg"],
  },
};



const SERVICES = [
  {
    icon: "💼",
    title: "資產配置",
    desc: "依照您的財務狀況與人生階段，規劃房產配置策略，兼顧自住需求與長期資產增值，讓每一筆資金都用在刀口上。",
    tag: "Asset Planning",
  },
  {
    icon: "🧾",
    title: "稅務諮詢",
    desc: "房地合一稅、重購退稅、持有稅務等相關試算與諮詢，交易前先了解成本，避免多繳一毛不該繳的稅。",
    tag: "Tax Consulting",
  },
  {
    icon: "🛠️",
    title: "簡易裝潢",
    desc: "提供簡易裝潢建議與資源媒合，讓房子在交屋前後都能以最合適的預算呈現最好的樣貌，賣相與住感一次到位。",
    tag: "Renovation",
  },
];

/**
 * 稅費試算工具。都是連到外部的官方／銀行網站，我們不自己算 ——
 * 自己算等於在給稅務意見，而且稅率一改就會過期。
 */
const TOOLS = [
  {
    icon: "🏠",
    title: "房地合一稅試算",
    desc: "賣房前先算清楚要繳多少稅。填入取得與出售的時間、價格，就能估出應納稅額，不會等到簽了約才發現稅金吃掉獲利。",
    source: "財政部電子稅務入口網",
    href: "https://www.etax.nat.gov.tw/etwmain/tax-info/house-land-transfer-taxtation-calculation-area/sale/online-taxable-amount-calculation",
  },
  {
    icon: "🏦",
    title: "房貸試算",
    desc: "先抓出每個月要還多少。填入貸款金額、利率、年限與寬限期，算出月付金，買房的預算才抓得準。",
    source: "內政部不動產資訊平台",
    href: "https://pip.moi.gov.tw/V3/c/SCRC0201.aspx?Func=3",
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
            {/* 2026-08-20 系統擁有者拍板：/map 的資料還沒核對完（25 筆建商名與面積只有 3 筆
                verified、33 塊未命名、開發狀態全是「待確認」），先不對外掛入口。
                頁面本身還在，打網址進得去。核對完把下面這行取消註解就恢復。 */}
            {/* <li><Link href="/map">區域地圖</Link></li> */}
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
              <p className={styles.heroRole}>{OWNER.title}</p>
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
                alt={`${OWNER.name}－${OWNER.company}台中海線資深不動產經紀人形象照`}
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
                    <Link className={lst.body} href="/listings">

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
              買賣房子最怕算漏了。這兩個是政府與銀行提供的官方試算工具，先自己跑一輪、心裡有底，再來談會更踏實。
            </p>
          </div>
          <div className={styles.container}>
            <div className={styles.toolGrid}>
              {TOOLS.map((tool) => (
                <a
                  key={tool.title}
                  className={styles.toolCard}
                  href={tool.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className={styles.toolIcon}>{tool.icon}</div>
                  <h3>{tool.title}</h3>
                  <p>{tool.desc}</p>
                  <span className={styles.toolSource}>資料來源：{tool.source}</span>
                  <span className={styles.toolGo}>前往試算 ↗</span>
                </a>
              ))}
            </div>
            <p className={styles.toolDisclaimer}>
              ⚠️ 以上連結皆為<strong>外部網站提供的試算工具，僅供試算參考</strong>。
              房地合一稅之<strong>實際稅額以國稅局核定為準</strong>；貸款條件與利率以各銀行實際審核結果為準。
              稅率與相關法規會調整，請以連結頁面當下的官方規定為準。試算結果不構成稅務或財務意見。
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
                    <span>選擇諮詢主題：資產配置、稅務、簡易裝潢或買賣房</span>
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
