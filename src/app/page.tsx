/**
 * / — 黃瑋凱個人官網首頁
 * 預約區塊直接導到本站的線上預約系統 /card/booking，不再只丟 LINE。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { OWNER, SOCIAL, SITE_URL } from "@/config/owner";
import { AREAS } from "@/config/profile";
import { HOME_FEATURED_COUNT } from "@/config/listings";
import { getPublicListings } from "@/lib/listings";
import { getPublicVideos, CATEGORY_META } from "@/lib/videos";
// 影片卡片的播放鈕與分類標籤跟 /videos 共用同一份樣式
import vid from "./videos/videos.module.css";
import { formatWan } from "@/lib/houseol-price";
import styles from "./home.module.css";
import SiteNav from "@/app/_ui/SiteNav";
import SocialLinks from "@/app/_ui/SocialLinks";
import SectionWave from "@/app/_ui/SectionWave";
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
    images: [{ url: "/profile-2026-09.jpg", width: 1029, height: 1543, alt: `${OWNER.name}形象照` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `台中海線房仲${OWNER.name}｜買賣租賃・稅費諮詢・市場分析`,
    description: "112、113、114年連續三年年度千萬經紀人。深耕台中海線沙鹿、梧棲、清水、龍井。",
    images: ["/profile-2026-09.jpg"],
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
    href: "/tax#land-tax",
  },
  {
    icon: "🏦",
    title: "房貸月付金試算",
    desc: "先抓出每個月要還多少。填入貸款金額、利率、年限與寬限期，算出月付金與總利息，買房的預算才抓得準。",
    source: "本息平均攤還公式",
    href: "/tax#loan",
  },
  {
    icon: "🔑",
    title: "租金補貼試算",
    desc: "租屋族先算算看能領多少。填入所在縣市、行政區與家庭狀況，就算出每月可領補貼，海線各行政區金額不一樣，選錯區會差很多。",
    source: "內政部 300 億元中央擴大租金補貼分級表",
    href: "/tax#rent",
  },
  {
    icon: "🏡",
    title: "新青安 3.0 資格檢測",
    desc: "115 年 8 月上路的新制多了年齡、所得、總價三道門檻。點 7 題，30 秒看你能不能辦、能貸多少、月付大概多少，連補貼退場後的月付也一起算。",
    source: "財政部青安 3.0 方案與國庫署問答集",
    href: "/tax#youth-loan",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "RealEstateAgent",
  name: OWNER.name,
  image: `${SITE_URL}/profile-2026-09.jpg`,
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
  /**
   * sameAs ＝ 「這些帳號跟這個網站是同一個人」。Google 靠它把社群累積的信任
   * 併回官網，也是知識面板抓社群連結的來源。
   *
   * ⚠️ `filter(Boolean)` 不能拿掉 —— `SOCIAL` 沒填的欄位是空字串，
   *    空字串進到 sameAs 會變成無效的結構化資料，Search Console 會報錯。
   */
  sameAs: [SOCIAL.line, SOCIAL.fb, SOCIAL.ig, SOCIAL.yt, SOCIAL.tiktok].filter(Boolean),
};

/**
 * 物件在資料庫裡，但首頁仍然是「靜態產生 ＋ 定時重生」——首頁不能為了讀物件變慢。
 * 後台存檔時會 revalidatePath("/")，所以改完立刻生效；下面的秒數只是保險。
 */
export const revalidate = 300;

export default async function HomePage() {
  const [listings, videos] = await Promise.all([getPublicListings(), getPublicVideos()]);
  /* 首頁只放三支最新的（2026-09-07 系統擁有者指定）。「最新」看 publishedAt（YYYY-MM-DD 字串，
     直接比大小），跟 /videos 側欄「最新影片」同一個定義；一支都沒有就整個區塊不出現。 */
  const latestVideos = [...videos].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 3);
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
          {/* ⚠️ 項目與順序是 2026-08-26 系統擁有者親自指定的，不要「順手」重排。
              清單本身在 `_ui/SiteNav.tsx` 的 ITEMS —— 桌機那一條與手機的漢堡選單
              都從那一份長出來，六個公開頁共用。**改字或加項目只改那一個地方。**
              （2026-08-27 之前這裡是一條寫死的 <ul>，子頁沒有導覽列就是因為它只在首頁。） */}
          <SiteNav variant="home" />
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

      {/* 🚫 首頁不放右側固定的社群直排（子頁有）。2026-09-03 系統擁有者看過線上後指定：
          「首頁的側邊條不出現，出現在子頁就好」—— 首頁 banner 右上已經有藥丸，
          右緣再一條直排跟形象照擠在同一側。要放回來就 <SocialLinks variant="float" />，
          放在 <header> 外面（header 的 backdrop-filter 會把 fixed 子元素關在 header 裡）。 */}
      <main id="top">
        {/* ---------------- 品牌 banner（2026-09-08 系統擁有者指定放在自我介紹的上方） ----------------
            他要的是「強調我是服務台中海線的房產規劃專家」。同日改到第三版（每版都是他看過線上後指定）：
            v1 左字右直式圖 → v2 藍綠色塊＋寬圖滿版貼底 → v3（現在）：
            「整個寬度縮小一半，把上面薄荷綠裡面的字結合到圖片裡，不需要有薄荷綠的色塊了，
              單用圖片做延伸透明化，若需要色塊輔助用 #FFFAF4」
            → 沒有色塊了：底是他指定的 #FFFAF4，文字改深色；文字＋寬圖一起收進 1080px 的框
              （跟頁面其他內容同寬，他 2000px 的螢幕上約一半）；寬圖的上緣與左右用同色漸層融進底色，
              看起來像圖往上延伸、文字就長在圖的天空裡。
            圖檔 public/banner-wide.jpg（他給的寬版，2061×503，已切掉原圖上下白邊；圖上的字、
            四個圖示、黃按鈕都是畫上去的、不能點）。要換圖直接換檔：桌機在 1080 框裡等比，
            手機是 200px 高的 cover、對準左邊 22%。
            ⚠️ 這裡的標題刻意用 <p> 不用 <h1>／<h2>：頁面唯一的 h1 是下面 hero 的「房產找瑋凱」，
               banner 在它前面放 h2 會讓大綱順序倒過來。 */}
        <section className={styles.banner} aria-label="台中海線房產規劃專家">
          <div className={styles.bannerFrame}>
            <div className={styles.bannerInner}>
              <div className={styles.bannerText}>
                <span className={styles.bannerEyebrow}>📍 台中海線在地服務</span>
                <p className={styles.bannerTitle}>
                  台中海線的
                  <br />
                  房產規劃專家
                </p>
                <p className={styles.bannerLead}>
                  沙鹿・梧棲・清水・龍井｜買房、賣房、資金配置、稅費，一次幫你規劃到位。
                </p>
                <Link className={styles.bannerCta} href="/card/booking">
                  線上預約諮詢
                </Link>
              </div>
              {/* 社群藥丸（FB／IG／YT／TikTok）。文案在 SocialLinks.tsx、網址在 owner.ts，這裡只管位置。
                  所有寬度都在第一屏：桌機右上角，860px 以下排在按鈕下面置中。 */}
              <div className={styles.bannerSocial}>
                <SocialLinks variant="bar" align="center" />
              </div>
            </div>
            {/* 寬圖。上緣＋左右的漸層在 .bannerArt::before（同底色蓋過去，不是 mask）。
                下面 hero 頂端的白弧會蓋掉它最底下 56px（那裡只是樹叢，圖裡的黃按鈕在弧上面）。 */}
            <div className={styles.bannerArt}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.bannerArtImg}
                src="/banner-wide.jpg"
                alt="一家人望著台中的天際線——不只是交易，而是人生的下一個家；專業・誠信・用心・陪你成家"
                width={2061}
                height={503}
                loading="eager"
                fetchPriority="high"
              />
            </div>
          </div>
        </section>

        {/* ---------------- HERO ---------------- */}
        <section className={`${styles.hero} ${styles.band} ${styles.bandWhite}`} aria-label={`${OWNER.name}個人形象介紹`}>
          {/* hero 頂端的白弧蓋在上面 banner 寬圖的最底下 56px */}
          <SectionWave flip />
          {/* 社群藥丸 2026-09-08 搬到上面的 banner 了（系統擁有者：「把四大平台移到 banner 處」）。
              它當初放在 hero 最上面的理由（手機第一屏一定要看得到）banner 一樣符合。
              同日拿掉這裡的「台中海線資產配置專家」標籤 —— banner 已經在講同一件事，第二段再出現是重複。 */}
          <div className={styles.heroInner}>
            <div>
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
              {/* 自我介紹三段。2026-09-07 系統擁有者親自改寫（取代原本的一句 tagline＋六句 icon 清單），
                  文案照他給的原文一字不改；只有「連續三年獲得千萬經紀人的肯定」他指定加粗、變黑。
                  ⚠️ 文案是他寫的，要改內容先問他。 */}
              <div className={styles.heroStory}>
                <p>
                  我從二十歲踏入房仲業，這是我人生中的第一份工作，也是至今唯一的一份。十五年來，我專注在不動產這一件事上，
                  <strong>連續三年獲得千萬經紀人的肯定</strong>，更重要的是，我親眼見證了一組又一組家庭在這裡圓夢的故事。
                </p>
                <p>
                  {/* 「買房、賣房、資產配置」他指定 #4a86e8＋底線。藍字加底線就是連結的長相，
                      不給目標客戶會點了沒反應，所以接到本頁的「服務項目」區塊。 */}
                  <a href="#services" className={styles.heroStoryLink}>買房、賣房、資產配置</a>
                  ，每一個決定都牽動一個家的未來。我相信自己能陪您把每一步都走對——不只是成交，更要讓您成交得安心。
                </p>
                {/* 第三段他指定整句 #ff0000 */}
                <p className={styles.heroStoryRed}>說到做到，是我對客戶的承諾；負責到底，是我為您的夢想把關的態度。</p>
              </div>
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
                src="/profile-2026-09.jpg"
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
        {/* 🚫 2026-09-07 系統擁有者拍板：首頁不再有「關於我」區塊。
            原本這裡是一塊淡粉色帶＋六句自我介紹的卡片，現在那六句併進上面 hero 形象照旁邊
            （.heroStory，他親自寫的三段自述），完整版仍在 /about（導覽列「關於我」已改成連到 /about）。
            主題色帶現在是：hero 淡藍漸層 → 精選好案 淡藍 #CFE2F3 → 服務 白 → 試算 蜜桃奶油 → 預約 深藍綠。 */}
        {/* ---------------- 精選好案 ---------------- */}
        <section id="listings" className={`${styles.section} ${styles.band} ${styles.bandBlue}`}>
          <SectionWave flip />
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
                      {/* 🏷️ 售價，跟 /listings 那張卡同一來源（愛屋型錄現抓）；null 就不渲染 */}
                      {item.price != null ? (
                        <span className={lst.price}>
                          售價 <b>{formatWan(item.price)}</b>
                        </span>
                      ) : null}
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
        <section id="services" className={`${styles.section} ${styles.band} ${styles.bandWhite}`}>
          <SectionWave />
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
        <section id="tools" className={`${styles.section} ${styles.band} ${styles.bandSoft}`}>
          <SectionWave flip />
          <div className={`${styles.container} ${styles.center}`}>
            <span className={styles.eyebrow}>TOOLS</span>
            <h2 className={styles.sectionTitle}>稅費試算</h2>
            <p className={styles.sectionDesc}>
              買賣房子最怕算漏了。這些試算都在站上，不用跳到別的網站，算完還看得到每一步怎麼來的。
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


        {/* ---------------- 影音專區（首頁只放三支最新） ----------------
            2026-08-25 拍板「影音做成獨立分頁、不放首頁下滑區塊」；2026-09-07 系統擁有者再指定
            「影音也放上三個最新影片在首頁」—— 分頁照舊，首頁多一個三支最新的入口。
            卡片點下去走 /videos?v=<id>，由 VideoLibrary 自動打開那支。
            ⚠️ 一支上架中的影片都沒有時整個區塊不畫（連標題都不畫），免得留一塊空白。 */}
        {latestVideos.length > 0 ? (
          <section id="videos" className={`${styles.section} ${styles.band} ${styles.bandWhite}`}>
            <SectionWave />
            <div className={`${styles.container} ${styles.center}`}>
              <span className={styles.eyebrow}>VIDEOS</span>
              <h2 className={styles.sectionTitle}>影音專區</h2>
              <p className={styles.sectionDesc}>最新三支。房產知識、生活知識、房屋開箱，我自己拍、自己講。</p>
            </div>
            <div className={styles.container}>
              <ul className={styles.videoGrid}>
                {latestVideos.map((v) => (
                  <li key={v.id}>
                    <Link className={styles.videoCard} href={`/videos?v=${encodeURIComponent(v.id)}`}>
                      <span className={styles.videoThumb}>
                        {v.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className={styles.videoThumbImg} src={v.thumbnail} alt="" loading="lazy" />
                        ) : (
                          <span className={styles.videoThumbEmpty} aria-hidden="true">🎬</span>
                        )}
                        <span className={vid.playBadge} aria-hidden="true" />
                      </span>
                      <span className={styles.videoBody}>
                        <span className={vid.tag}>{CATEGORY_META[v.category].label}</span>
                        <span className={styles.videoTitle}>{v.title}</span>
                        <span className={styles.videoMeta}>🕘 {v.publishedAt}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className={styles.listingsMore}>
                <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/videos">
                  看全部影片
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        {/* ---------------- 預約系統 ---------------- */}
        <section id="booking" className={`${styles.section} ${styles.contact} ${styles.band}`}>
          <SectionWave />
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
            {/* 2026-09-03 這裡原本還有一排社群底磚，系統擁有者拍板拿掉 ——
                上面 banner 右上的藥丸已經夠了，
                同一頁第三排是雜訊。要放回來就 <SocialLinks variant="tiles" />。 */}
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>
          <strong>{OWNER.name}</strong>｜{OWNER.title}
        </p>
        <p>電話 {OWNER.phone}　LINE @a8865</p>
        <p>地址 {OWNER.addressStreet}</p>
        <p>&copy; {new Date().getFullYear()} Huang Wei-Kai Realty. All rights reserved.</p>
        <div className={styles.footerVisits}>
          <VisitCounter />
        </div>
        {/* 2026-09-08 系統擁有者指定放在頁面最底部：經紀業名稱與經紀人證號。
            三個值都在 owner.ts，換經紀人只改那一個檔；/map 頁尾也放同一行。 */}
        <p className={styles.footerLegal}>
          {OWNER.brokerage}　不動產經紀人：{OWNER.brokerName}　{OWNER.brokerLicense}
        </p>
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
