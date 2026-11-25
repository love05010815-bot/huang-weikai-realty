/**
 * /garbage —— 垃圾車查詢（附近哪裡有垃圾車、幾點來）
 *
 * 2026-11-25 系統擁有者：「我想做一個小工具，可以提供客人查詢附近有沒有垃圾車，幾點有」
 * 「可以用地址或是社區查詢」。
 *
 * 資料：環保局「定時定點垃圾收運地點」（沒有座標）＋民政局門牌座標，`npm run build:garbage` 壓成
 * public/data/garbage/（靜態檔，前台 fetch、不進 bundle、不吃 lambda）。規則在 lib/garbage-truck.ts，
 * 畫面在 GarbageFinder.tsx。這頁是靜態預渲染，「今天幾點」在瀏覽器算。
 *
 * 社區名：直接用建案地圖那份建案（名稱＋他親手點的座標），所以只有梧棲、清水、沙鹿、龍井；
 * 其他區的客戶打地址。別名（alias）也收進來當另一個可搜的名字。
 */
import Link from "next/link";
import type { Metadata } from "next";
import { OG_IMAGE, OWNER, SITE_URL } from "@/config/owner";
import { AREA_LABEL, COORDS, PROJECTS } from "@/data/port-projects";
import BreadcrumbJsonLd from "@/app/_ui/BreadcrumbJsonLd";
import SiteNav from "@/app/_ui/SiteNav";
import SocialLinks from "@/app/_ui/SocialLinks";
import SiteFooter from "@/app/_ui/SiteFooter";
import { GARBAGE_SOURCE_URL, type Community } from "@/lib/garbage-truck";
import styles from "../home.module.css";
import tax from "../tax/tax.module.css";
import GarbageFinder from "./GarbageFinder";

const TITLE = `台中垃圾車時間查詢｜打地址或社區名，看附近幾點收垃圾｜台中海線房仲${OWNER.name}`;
const DESCRIPTION =
  "台中市垃圾車時間查詢：輸入地址、社區名或用手機定位，列出附近的垃圾車收運點、今天幾點來、星期幾收資源回收，一週時間表和地圖一次看。資料取自臺中市政府環境保護局定時定點收運資料，梧棲、清水、沙鹿、龍井可直接用社區名查。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "台中垃圾車時間",
    "垃圾車查詢",
    "垃圾車幾點",
    "台中垃圾車路線",
    "梧棲垃圾車時間",
    "清水垃圾車時間",
    "沙鹿垃圾車時間",
    "龍井垃圾車時間",
    "資源回收時間",
    "台中海線房仲",
    OWNER.name,
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: "/garbage" },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/garbage`,
    title: TITLE,
    description: DESCRIPTION,
    siteName: `${OWNER.name}｜台中海線房仲`,
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_IMAGE.url] },
};

/** 建案地圖的建案 → 可以搜的社區（有座標的才收；別名另外算一筆） */
function communities(): Community[] {
  const out: Community[] = [];
  const seen = new Set<string>();
  for (const p of PROJECTS) {
    const c = COORDS[p.id];
    if (!c) continue;
    for (const name of [p.name, p.alias]) {
      if (!name || seen.has(`${name}|${p.area}`)) continue;
      seen.add(`${name}|${p.area}`);
      out.push({ name, area: AREA_LABEL[p.area], lat: c.lat, lng: c.lng });
    }
  }
  return out;
}

export default function GarbagePage() {
  return (
    <div className={styles.page}>
      <BreadcrumbJsonLd items={[{ name: "垃圾車時間查詢", href: "/garbage" }]} />
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
        <div className={styles.headerSocial}>
          <SocialLinks variant="bar" align="start" compact className={styles.headerSocialBar} />
        </div>
      </header>

      {/* ⚠️ 一定要放在 <header> 外面（header 的 backdrop-filter 會把 position:fixed 關在裡面） */}
      <SocialLinks variant="float" />

      <main>
        <section className={styles.section}>
          <div className={`${styles.container} ${styles.center} ${styles.stickyTitleWrap}`}>
            <span className={styles.eyebrow}>TOOLS</span>
            <h1 className={styles.sectionTitle}>垃圾車時間查詢</h1>
          </div>
          <div className={`${styles.container} ${styles.center}`}>
            <p className={styles.sectionDesc}>
              剛搬家、看房時最實際的一題：「這裡垃圾車幾點來？」打地址或社區名，附近的收運點、今天幾點到、
              星期幾收資源回收，連一週時間表和地圖一起列給您。
            </p>
          </div>

          <div className={styles.container}>
            <GarbageFinder communities={communities()} />

            <div className={tax.disclaimer}>
              <strong>⚠️ 時間是環保局排定的表定時間，實際到達會因天候、車流、節日提早或延後，以現場為準。</strong>
              <strong>收運點的位置是用地址對照門牌資料推算的</strong>，不是環保局提供的座標，地圖上的位置與距離僅供參考；
              環保局只寫路口或地標的收運點定位不到，不會出現在「附近」清單裡。
              <strong>社區大樓</strong>多半有自己的垃圾集中處、由管委會委託清運，不一定要追垃圾車，入住前可以先問管理室。
              <strong>國定假日、颱風天、春節</strong>的收運另有公告；想看垃圾車現在開到哪，可以用環保局的「垃圾大車隊」App。
              路線或時間有疑問請洽各區清潔隊或撥 1999。
              <div className={tax.sources}>
                資料來源：
                <br />
                ・收運點與時間 ——{" "}
                <a href={GARBAGE_SOURCE_URL} target="_blank" rel="noopener noreferrer">
                  臺中市政府環境保護局 臺中市定時定點垃圾收運地點（政府資料開放授權）↗
                </a>
                <br />
                ・門牌位置 ——{" "}
                <a
                  href="https://opendata.taichung.gov.tw/search/f0c0712a-a604-4716-8b3f-33e9f4c8049e"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  臺中市政府民政局 GIS 門牌號碼（政府資料開放授權）↗
                </a>
                <br />
                ・地圖底圖 —— © OpenStreetMap 貢獻者
              </div>
            </div>

            <Link href="/tools" className={tax.backLink}>
              ← 回免費小工具
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
