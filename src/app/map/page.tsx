/**
 * /map — 台中港市鎮中心（梧棲＋清水重劃區）區域頁
 *
 * 主體是 `ProjectExplorer.tsx`（地圖＋篩選＋詳情＋在售物件，2026-08-23 由
 * 「地圖」與「建案總覽」兩層合併而成）。建案資料在 src/data/port-projects.ts。
 *
 * 這頁的商業目的：讓在地客戶「看懂這一區 → 點到有興趣的建案 → 看到我的物件或留下線索」。
 *
 * ⚠️ 舊的 `ProjectPanel.tsx`（獨立的建案總覽清單）與 `ProjectMap.tsx`（組成示意圖）
 *    已無人引用，檔案留著但不再是這頁的一部分。
 *
 * ⚠️ 2026-08-21 系統擁有者拍板：**「土地使用分區」那一層已從本頁移除**。
 *    理由：地塊界線是從截圖重建的，上面 24 個建商名沒核對過，公開等於發表未查證資料。
 *    元件（MapCanvas.tsx）與資料（port-district.ts）都還留著，要復原就把
 *    `<MapCanvas />` 加回來。**要加回來之前先把建商名核對完。**
 */
import type { Metadata } from "next";
import Link from "next/link";
import { OWNER, SITE_URL } from "@/config/owner";
import { DISTRICT, PROJECTS, SOURCES, projectStats } from "@/data/port-projects";
import { getListingsByProject } from "@/lib/project-listings";
import ProjectExplorer, { type ProjectListing } from "./ProjectExplorer";
import styles from "./Map.module.css";

const stats = projectStats();

const TITLE = `台中港市鎮中心建案總覽｜梧棲・清水重劃區 ${stats.total} 個建案一次看｜台中海線房仲${OWNER.name}`;
const DESCRIPTION = `台中港市鎮中心重劃區（橫跨梧棲區與清水區）${stats.total} 個建案總覽：遠雄幸福成、聯悅馨、長虹天擎、聯虹鉑玥、遠雄之星系列等，可依行政區、預售／成屋與建商篩選，並標示規模與銷售階段。由台中海線房仲${OWNER.name}整理自公開資訊。`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "台中港市鎮中心",
    "梧棲重劃區",
    "清水重劃區",
    "梧棲市政重劃區",
    "梧棲重劃區建案",
    "清水重劃區建案",
    "台中港特定區",
    "梧棲建案",
    "清水建案",
    "遠雄之星",
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
    description: `${stats.total} 個建案、共 ${stats.units.toLocaleString("zh-TW")} 戶，可依行政區、預售／成屋與建商篩選。`,
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
    title: "梧棲重劃區、清水重劃區，是同一個地方嗎",
    body: `是。正式名稱是「${DISTRICT.name}」，業界常稱「${DISTRICT.alias}」。它橫跨梧棲與清水兩個行政區，所以在地習慣按行政區拆成兩半來講，但它是同一個重劃案。梧棲側涵蓋${DISTRICT.sections.梧棲區.join("、")}，清水側是${DISTRICT.sections.清水區.join("、")}。至於「市政」這個俗稱，來自梧棲區公所、戶政所、衛生所將遷入本區。`,
  },
  {
    title: "為什麼不標價格",
    body: "房價每個月都在動，寫在網頁上很快就過期，過期的價格對你我都沒好處。想知道特定建案的實際成交行情與可談空間，直接預約，我帶你看最新的實價登錄資料。",
  },
  {
    title: "資料怎麼來的",
    body: `建商、所在行政區、完工年與銷售階段來自${OWNER.alias}自己整理的在地建案總表；戶數、坪數、樓層等細節則整理自公開的建案資訊平台，來源列在頁面最下方。房市變動快，資料仍可能有時間差，實際請以建商公告為準。`,
  },
];

/**
 * 這頁現在會讀資料庫（把在售物件掛到建案底下），所以不再是純靜態。
 * 跟首頁同一個做法：靜態產生 ＋ 定時重生，物件改了最慢 5 分鐘會反映。
 * 資料庫連不上時 `getPublicListings()` 會退回種子資料，頁面不會開天窗。
 */
export const revalidate = 300;

export default async function MapPage() {
  const byProject = await getListingsByProject();

  // 只挑畫面用得到的欄位傳給 client component，整包 Listing 丟過去是浪費
  const listings: Record<string, ProjectListing[]> = {};
  for (const [projectId, list] of byProject) {
    listings[projectId] = list.map((l) => ({
      slug: l.slug,
      title: l.title,
      area: l.area,
      points: l.points ?? [],
      // 傳原始值就好，PhotoCarousel 自己會解析成網址
      photos: l.photos ?? [],
      link: l.link ?? null,
    }));
  }

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
          <h1 className={styles.title}>台中港市鎮中心重劃區・梧棲＋清水</h1>
          <p className={styles.lede}>
            {`重劃區面積 ${DISTRICT.areaHa} 公頃，${DISTRICT.completedYear}竣工，橫跨梧棲與清水兩個行政區。這裡整理了區內 ${stats.total} 個建案、合計 ${stats.units.toLocaleString("zh-TW")} 戶。`}
          </p>

          <p className={styles.bounds}>
            <b>重劃區四至：</b>
            {DISTRICT.bounds}
            <br />
            <b>涵蓋地段：</b>
            {`梧棲區${DISTRICT.sections.梧棲區.join("、")}，清水區${DISTRICT.sections.清水區.join("、")}`}
            <br />
            <span className={styles.boundsNote}>
              在地習慣把它拆成「梧棲重劃區」與「清水重劃區」兩半來稱呼，但那是
              <b>同一個重劃案</b>跨兩個行政區，不是兩個重劃區。
            </span>
          </p>
        </div>
      </section>

      {/* ── 建案地圖（地圖與建案總覽已於 2026-08-23 合併成一個）── */}
      <section className={styles.layer} id="projects">
        <div className={styles.container}>
          <h2 className={styles.layerTitle}>
            <span className={styles.layerNo}>01</span>
            建案地圖
          </h2>
          <p className={styles.layerDesc}>
            {`區內 ${stats.total} 個建案，位置由${OWNER.alias}本人逐一標定。點大樓圖示看建案資訊，我有物件在售的建案會一併列出物件。`}
          </p>

          <ProjectExplorer listings={listings} />
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
