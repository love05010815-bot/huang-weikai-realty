/**
 * /map — 台中海線建案地圖（台中港生活圈：梧棲、清水、沙鹿共 4 個有建案的區）
 *
 * ⚠️ **2026-08-31 起 metadata 已經跟頁面同範圍了**（先前刻意只寫重劃區，
 *    那是頁面還只有 39 案時的決定；長到 133 案之後那個限制反而在擋流量）。
 *    ⚠️ **2026-08-31 第二次拍板：`<title>` 改成地名打頭**（梧棲・清水・沙鹿），
 *    「台中港市鎮中心」已不在標題裡（內文、keywords、description 仍有），
 *    細節見 TITLE 上面那段。
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
import { DISTRICT, PROJECTS, SOURCES, projectStats, AREA_FILTERS } from "@/data/port-projects";
import { ZONES } from "@/data/port-zones";
import { getMapListingsByProject } from "@/lib/map-listings";
import ProjectExplorer, { type ProjectListing } from "./ProjectExplorer";
import styles from "./Map.module.css";
import SiteNav from "@/app/_ui/SiteNav";
import SocialLinks from "@/app/_ui/SocialLinks";

const stats = projectStats();

/**
 * 地圖上非官方界線的色塊數（官方那塊不算）。寫死成「五塊」的話，
 * 之後 port-zones.ts 增減，這句文案會默默對不上，而且不會報錯。
 *
 * ⚠️ 2026-08-27 起這些**不全是沙鹿的商圈**了（多了梧棲市區，之後還會有清水市區），
 *    所以下面那句文案已經把「沙鹿的」拿掉 —— 再加一塊非沙鹿的區域時，
 *    只要確認文案沒有重新寫死區域名就好。
 */
const LOCAL_ZONE_COUNT = ZONES.filter((z) => !z.official).length;

/**
 * 重劃區以外、有建案的生活圈，照案數多的排前面 ——「鹿寮萬家福商圈 64 案、沙鹿車站商圈 28 案」。
 *
 * ⚠️ **一定要用算的，不要把區名寫死。** 2026-08-27 這句原本寫死成「沙鹿車站商圈 N 案」，
 *    當天補進鹿寮萬家福 64 案之後，句子裡的 39＋28 就跟 `stats.total`（131）對不起來，
 *    等於漏講 64 案 —— 而且不會報錯、畫面看起來還很正常。
 *    這裡改成從 `AREA_FILTERS` 掃出所有非重劃區、案數 > 0 的區，之後再補哪一區都不用回來改。
 */
const AREA_BREAKDOWN = AREA_FILTERS.filter((f) => f.value !== "梧棲" && f.value !== "清水")
  .map((f) => ({ label: f.label, n: stats.byArea[f.value] ?? 0 }))
  .filter((x) => x.n > 0)
  .sort((a, b) => b.n - a.n)
  .map((x) => `${x.label} ${x.n} 案`)
  .join("、");

/**
 * ⚠️ 2026-08-31 改：metadata 從「只講重劃區 39 案」放寬成「整個海線 133 案」。
 *
 * 原本刻意只寫重劃區，理由是「台中港市鎮中心」是房產網站最常用的搜尋詞。
 * 但這頁後來長到 133 案、跨四個有建案的區，標題卻還在賣 39 案 ——
 * 搜「沙鹿建案」「鹿寮建案」的人找不到這頁，等於 94 案的內容白做。
 *
 * ⚠️ **2026-08-31 系統擁有者再次拍板：標題改成地名打頭 —— 梧棲・清水・沙鹿。**
 * 「台中港市鎮中心」從 `<title>` 拿掉了（前一版刻意把它擺最前面保排名，這一版不是）。
 *
 * 為什麼可以拿掉：那是重劃區的正式名稱，**一般買方不會這樣搜**；
 * 客戶真的打進 Google 的是行政區名（梧棲／清水／沙鹿）。
 * 而且它沒有從這頁消失 —— 線上實測內文仍出現 15 次，keywords、description、JSON-LD
 * 都還在，**拿掉的只有 `<title>` 那一行**。
 *
 * 🚫 **「鹿寮」2026-08-31 一度被加進標題，同日又被系統擁有者拿掉 —— 鹿寮在沙鹿區
 *    裡面，跟「沙鹿」並列等於同一個地方講兩次。不要再加回去。** 通則：**行政區的
 *    下一層（商圈、里）不進標題**。⚠️ 這條只管標題 —— `鹿寮建案`、`鹿寮萬家福商圈`
 *    仍留在 keywords，那裡多寫不佔版面、搜得到就是賺，是兩回事。
 *
 * ⚠️ 標題裡的地名要對得起案數：梧棲＋清水＝重劃區 39 案，沙鹿（鹿寮萬家福 66
 *    ＋沙鹿車站 28）94 案，合計 133 案。**不要再往裡面加地名**，理由見下一段。
 *
 * ⚠️ **只寫真的有建案的區。** 目前 `AREA_FILTERS` 裡的梧棲市區、清水市區、
 *    梧棲市區與清水市區是 0 案，**不准寫進標題或 keywords** —— 那等於
 *    對搜尋的人宣稱這裡有那一區的建案，點進來會撲空。判準跟當初沙鹿 0 案時
 *    不把沙鹿寫進 H1 是同一條。
 */
const TITLE = `梧棲・清水・沙鹿建案地圖｜台中海線 ${stats.total} 案一次看｜房仲${OWNER.name}`;
const DESCRIPTION = `台中海線 ${stats.total} 個建案總覽：${DISTRICT.alias}重劃區（梧棲＋清水）${stats.district} 案，${AREA_BREAKDOWN}。遠雄之星系列、遠雄幸福成、聯悅馨、勝麗交響曲、合總小時代、富宇與凱悅系列等，可依區域、預售／成屋與建商篩選，並標示規模與銷售階段。由台中海線房仲${OWNER.name}整理自公開資訊。`;

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
    // 2026-08-31 補：沙鹿車站商圈 28 案、鹿寮萬家福商圈 66 案進來之後才加的。
    // ⚠️ 只加真的有建案的區 —— 梧棲市區／清水市區目前 0 案，不要加。
    "台中海線建案",
    "沙鹿建案",
    "沙鹿車站商圈",
    "沙鹿新成屋",
    "沙鹿預售屋",
    "鹿寮建案",
    "鹿寮萬家福商圈",
    // 2026-09-01 補：北勢靜宜商圈 80 案進來之後才加的（在此之前它是 0 案、不准寫）。
    // ⚠️ 標題仍然不加 —— 北勢、靜宜都在沙鹿區裡面，照上面「行政區的下一層不進標題」那條。
    "北勢靜宜商圈",
    "靜宜大學建案",
    "沙鹿北勢東路建案",
    // 2026-09-02 補：新光田特區 107 案進來之後才加的（在此之前它是 0 案、不准寫）。
    // ⚠️ 標題一樣不加 —— 新光田在沙鹿區裡面，照「行政區的下一層不進標題」那條。
    "新光田特區",
    "沙鹿新光田",
    OWNER.name,
  ],
  authors: [{ name: OWNER.name }],
  robots: { index: true, follow: true },
  alternates: { canonical: "/map" },
  /* ⚠️ description 刻意不寫戶數 —— 見下方 lede 那段註解（45 案缺 units）。不要補回去。 */
  openGraph: {
    type: "article",
    locale: "zh_TW",
    title: `台中海線建案地圖｜梧棲・清水・沙鹿 ${stats.total} 個建案`,
    description: `${stats.total} 個建案，可依區域、預售／成屋與建商篩選。`,
    url: "/map",
    siteName: `${OWNER.name}｜台中海線房仲`,
    images: [{ url: "/profile.jpg", width: 1029, height: 1543, alt: `${OWNER.name}形象照` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `台中海線建案地圖｜梧棲・清水・沙鹿 ${stats.total} 個建案`,
    description: `${stats.total} 個建案，可依預售／成屋與建商篩選。`,
    images: ["/profile.jpg"],
  },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "台中海線建案總覽",
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
    name: "台中海線建案清單",
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
  // 地圖上的在售物件是獨立的一套（map_listing 表，後台 /admin/map-listings），
  // 跟「精選好案」不共用 —— 2026-08-23 系統擁有者拍板。
  const byProject = await getMapListingsByProject();

  const listings: Record<string, ProjectListing[]> = {};
  for (const [projectId, list] of byProject) {
    listings[projectId] = list.map((l) => ({
      id: l.id,
      title: l.title,
      points: l.points,
      // 傳原始值就好，PhotoCarousel 自己會解析成網址
      photos: l.photos,
      linkHref: l.linkHref,
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
          <SiteNav variant="sub" />
          <Link href="/card/booking" className={styles.headerCta}>
            預約諮詢
          </Link>
        </div>
      </header>

      {/* 🚫 這頁不放右側固定的社群直排（其他五頁有）。
          /map 的容器接近滿版：1280px 視窗實測內容到 x=1237，直排要佔 x=1203～1251，
          會壓到地圖與建案清單的右緣。頂端那顆藥丸所有寬度都顯示，這頁不需要直排接手。 */}
      <section className={styles.hero}>
        <div className={styles.container}>
          {/* 社群藥丸（所有寬度都顯示）。這頁沒有右側直排（容器接近滿版會被壓到）。
              放在 hero 最上面，手機一打開就看得到 */}
          <SocialLinks variant="bar" align="center" />
          <span className={styles.eyebrow}>台中海線・區域研究</span>
          {/* ⚠️ 標題講的是「整個生活圈」，不是重劃區 —— 2026-08-26 起地圖範圍已擴大到
              沙鹿的商圈，2026-08-27 系統擁有者指定把這塊的名稱改過來。

              沙鹿是 2026-08-27 補進 28 案之後才寫進標題的。**在那之前刻意不寫**，
              因為當時沙鹿一案都沒有，寫進去等於對客戶宣稱這裡有沙鹿建案。
              以後要再往標題加一個地名，判準一樣：**那一區真的有建案了才加。**

              🚫 2026-08-31 一度補上「鹿寮」，同日系統擁有者又拿掉：**鹿寮在沙鹿區裡面，
              跟「沙鹿」並列等於同一個地方講兩次。不要再加回去。** 通則：**行政區的下一層
              （商圈、里）不進標題** —— 跟上面那條「那一區真的有建案了才加」是兩條，都要過。

              ⚠️ 這行 H1、`<title>`、og:title **三處要一起改**。只改一個不會報錯，
              但 Google 看到的、LINE 分享看到的、客戶點進來看到的會變成三種說法。 */}
          <h1 className={styles.title}>台中海線建案地圖・梧棲｜清水｜沙鹿</h1>
          {/* 🔴 2026-08-31 系統擁有者拍板：這句不要再出現「合計 N 戶」。
              理由：133 案裡有 45 案沒有 units，`stats.units` 只是有資料那 88 案的合計，
              接在「133 個建案」後面會被讀成 133 案的總戶數 —— 低報，但不準。
              要恢復戶數，先把 45 案補齊再說。og／twitter 的 description 同批拿掉了。 */}
          <p className={styles.lede}>
            {`這裡整理了台中海線 ${stats.total} 個建案：${DISTRICT.alias}重劃區（梧棲＋清水）${stats.district} 案，${AREA_BREAKDOWN}。地圖範圍是整個台中港生活圈，除了重劃區也畫出周邊 ${LOCAL_ZONE_COUNT} 塊生活圈範圍。`}
          </p>

          <p className={styles.bounds}>
            <b>重劃區四至：</b>
            {DISTRICT.bounds}
            <br />
            <b>重劃區涵蓋地段：</b>
            {`梧棲區${DISTRICT.sections.梧棲區.join("、")}，清水區${DISTRICT.sections.清水區.join("、")}`}
            <br />
            <span className={styles.boundsNote}>
              {`重劃區本身 ${DISTRICT.areaHa} 公頃、${DISTRICT.completedYear}竣工，橫跨梧棲與清水兩個行政區。`}
              在地習慣把它拆成「梧棲重劃區」與「清水重劃區」兩半來稱呼，但那是
              <b>同一個重劃案</b>跨兩個行政區，不是兩個重劃區。
            </span>
          </p>
        </div>
      </section>

      {/* ── 建案地圖（地圖與建案總覽已於 2026-08-23 合併成一個）── */}
      <section className={styles.layer} id="projects">
        <div className={styles.container}>
          {/* 兩層合併成一層之後就只剩這一個區塊，編號「01」沒有對照組，
              留著只會讓人以為下面還有 02。2026-08-23 拿掉。 */}
          <h2 className={styles.layerTitle}>建案地圖</h2>
          {/* ⚠️ 這句**跟著資料自動變**，不要寫死。2026-08-27 補進沙鹿 28 案時，
              那批一個座標都沒有，地圖上不會有圖釘；若這裡還寫死「位置由本人逐一標定」，
              就是對客戶宣稱 67 案都標好了，而畫面上只有 39 顆圖釘。
              系統擁有者用 `/map?fix=1` 把座標補完之後，這句會自己變回乾淨的版本。 */}
          <p className={styles.layerDesc}>
            {`台中海線 ${stats.total} 個建案。${
              stats.located === stats.total
                ? `位置由${OWNER.alias}本人逐一標定。`
                : `其中 ${stats.located} 案的位置由${OWNER.alias}本人逐一標定；另外 ${stats.total - stats.located} 案還沒標上地圖，先列在下方清單裡。`
            }點大樓圖示看建案資訊，我有物件在售的建案會一併列出物件。`}
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
