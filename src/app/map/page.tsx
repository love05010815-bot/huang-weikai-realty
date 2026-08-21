/**
 * /map — 台中港市鎮中心（梧棲市政重劃區）區域頁
 *
 * 兩層：
 *   ① 土地分佈圖  資料在 src/data/port-district.ts   —— 示意圖，未核對完
 *   ② 建案總覽    資料在 src/data/port-projects.ts   —— 23 案，有出處
 *
 * 這頁的商業目的：讓在地客戶「看懂這一區 → 想問行情 → 點預約」。
 *
 * ⚠️ 這頁目前沒有對外入口（首頁導覽與 sitemap 那兩行被刻意註解掉了），
 *    因為①的地塊資料還沒核對完。要恢復入口請看 src/app/page.tsx 與 src/app/sitemap.ts 的註解。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { OWNER, SITE_URL } from "@/config/owner";
import { DISTRICT, PROJECTS, SOURCES, projectStats } from "@/data/port-projects";
import MapCanvas from "./MapCanvas";
import ProjectPanel from "./ProjectPanel";
import styles from "./Map.module.css";

const stats = projectStats();

const TITLE = `台中港市鎮中心建案總覽｜梧棲市政重劃區 ${stats.total} 個建案一次看｜台中海線房仲${OWNER.name}`;
const DESCRIPTION = `台中港市鎮中心（梧棲市政重劃區）${stats.total} 個建案總覽：遠雄幸福成、聯悅馨、長虹天擎、聯虹鉑玥等，可依預售／成屋與建商篩選，另附土地使用分區互動地圖。由台中海線房仲${OWNER.name}整理自公開資訊。`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "台中港市鎮中心",
    "梧棲市政重劃區",
    "梧棲重劃區建案",
    "台中港特定區",
    "梧棲建案",
    "清水建案",
    "遠雄幸福成",
    "聯悅馨",
    "台中海線建商",
    OWNER.name,
  ],
  authors: [{ name: OWNER.name }],
  robots: { index: true, follow: true },
  alternates: { canonical: "/map" },
  openGraph: {
    type: "article",
    locale: "zh_TW",
    title: `台中港市鎮中心建案總覽｜梧棲市政重劃區 ${stats.total} 個建案`,
    description: `${stats.total} 個建案、共 ${stats.units.toLocaleString("zh-TW")} 戶，可依預售／成屋與建商篩選，另附土地使用分區互動地圖。`,
    url: "/map",
    siteName: `${OWNER.name}｜台中海線房仲`,
    images: [{ url: "/profile.jpg", width: 1029, height: 1543, alt: `${OWNER.name}形象照` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `台中港市鎮中心建案總覽｜梧棲市政重劃區 ${stats.total} 個建案`,
    description: `${stats.total} 個建案、共 ${stats.units.toLocaleString("zh-TW")} 戶，可依預售／成屋與建商篩選。`,
    images: ["/profile.jpg"],
  },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: `${DISTRICT.alias}建案總覽`,
  description: DESCRIPTION,
  url: `${SITE_URL}/map`,
  inLanguage: "zh-Hant-TW",
  about: {
    "@type": "Place",
    name: DISTRICT.name,
    address: {
      "@type": "PostalAddress",
      addressLocality: "梧棲區",
      addressRegion: "台中市",
      addressCountry: "TW",
    },
  },
  mainEntity: {
    "@type": "ItemList",
    name: `${DISTRICT.alias}建案清單`,
    numberOfItems: PROJECTS.length,
    itemListElement: PROJECTS.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.name,
    })),
  },
  author: {
    "@type": "RealEstateAgent",
    name: OWNER.name,
    telephone: OWNER.phone,
    areaServed: ["台中市沙鹿區", "台中市梧棲區", "台中市清水區", "台中市龍井區"],
  },
};

const NOTES = [
  {
    title: "「市政重劃區」是哪裡",
    body: `在地習慣叫「梧棲市政重劃區」，正式名稱是「${DISTRICT.name}」，也常被叫做「${DISTRICT.alias}」。「市政」來自梧棲區公所、戶政所、衛生所將遷入本區。`,
  },
  {
    title: "為什麼不標價格",
    body: "房價每個月都在動，寫在網頁上很快就過期，過期的價格對你我都沒好處。想知道特定建案的實際成交行情與可談空間，直接預約，我帶你看最新的實價登錄資料。",
  },
  {
    title: "資料怎麼來的",
    body: "建案名稱與戶數整理自公開的建案資訊平台與區域專文，來源列在頁面最下方。預售屋依法須申報實價登錄，這類資料查得到、可追溯，但仍可能有時間差。",
  },
];

export default function MapPage() {
  return (
    <main className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand}>
            {OWNER.name}
            <span>台中海線房仲</span>
          </Link>
          <Link href="/card/booking" className={styles.headerCta}>
            預約諮詢
          </Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.container}>
          <span className={styles.eyebrow}>台中海線・區域研究</span>
          <h1 className={styles.title}>台中港市鎮中心・梧棲市政重劃區</h1>
          <p className={styles.lede}>
            {`重劃區面積 ${DISTRICT.areaHa} 公頃，${DISTRICT.completedYear}竣工，橫跨梧棲與清水兩區。這裡整理了區內 ${stats.total} 個建案、合計 ${stats.units.toLocaleString("zh-TW")} 戶，並附上土地使用分區互動地圖。`}
          </p>

          <p className={styles.bounds}>
            <b>重劃區四至：</b>
            {DISTRICT.bounds}
          </p>
        </div>
      </section>

      {/* ── 第一層：土地分佈圖 ── */}
      <section className={styles.layer} id="land">
        <div className={styles.container}>
          <h2 className={styles.layerTitle}>
            <span className={styles.layerNo}>01</span>
            土地使用分區圖
          </h2>
          <p className={styles.layerDesc}>
            點任一地塊看使用分區與土地面積。可切換成開發狀態上色，也可以搜尋建商。
          </p>

          <p className={styles.disclaimer}>
            <b>看圖前請先讀這段：</b>
            本圖為<b>示意圖</b>，街廓與地塊界線係依公開圖資重建，非地籍測量成果，
            <b>不得作為界址、產權或交易依據</b>。 地塊上的建商名稱整理自公開資訊，
            <b>多數尚未經人工核對</b>，點開會標示「待確認」。 實際情形請以主管機關公告與土地登記謄本為準。
          </p>
        </div>

        <div className={styles.container}>
          <MapCanvas />
        </div>
      </section>

      {/* ── 第二層：建案總覽 ── */}
      <section className={styles.layer} id="projects">
        <div className={styles.container}>
          <h2 className={styles.layerTitle}>
            <span className={styles.layerNo}>02</span>
            建案總覽
          </h2>
          <p className={styles.layerDesc}>
            {`區內 ${stats.total} 個建案，可依預售／成屋與建商篩選。點建案看坐落、房型與資料出處。`}
          </p>

          <ProjectPanel />
        </div>
      </section>

      {/* ── 說明 ── */}
      <section className={styles.notes}>
        <div className={styles.container}>
          <div className={styles.notesGrid}>
            {NOTES.map((n) => (
              <article key={n.title} className={styles.note}>
                <h3>{n.title}</h3>
                <p>{n.body}</p>
              </article>
            ))}
          </div>

          <div className={styles.sources}>
            <h3>資料來源</h3>
            <ul>
              {Object.entries(SOURCES).map(([key, s]) => (
                <li key={key}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer nofollow">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
            <p className={styles.sourceNote}>
              本頁資料整理自上述公開資訊，僅供參考，可能與最新狀況有落差。
              實際建案資訊請以建商公告與主管機關資料為準；土地相關事項請以土地登記謄本為準。
            </p>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.container}>
          {`${OWNER.name}｜${OWNER.title}　`}
          <Link href="/">回首頁</Link>
          {"　"}
          <Link href="/listings">精選好案</Link>
          {"　"}
          <Link href="/card/booking">線上預約</Link>
        </div>
      </footer>
    </main>
  );
}
