/**
 * /about —— 關於我（自我介紹 ＋ 服務區域 ＋ 年度戰績）
 *
 * 原本這三塊都塞在首頁，光這一段就佔了首頁 26% 的長度（手機上 2426px）。
 * 拆成獨立頁之後首頁只留一段導引 ＋「更多關於我」按鈕，動線跟 /listings 一致。
 *
 * 內容在 src/config/profile.ts，首頁的導引區塊也讀同一份。
 * 版面沿用首頁那套（home.module.css 的 .page 裡定義了配色變數）。
 */
import Link from "next/link";
import type { Metadata } from "next";
import { OWNER, SITE_URL } from "@/config/owner";
import { INTRO_LINES, AREAS, YEARS } from "@/config/profile";
import styles from "../home.module.css";

const TITLE = `關於瑋凱｜台中海線房仲${OWNER.name}｜十五年不動產經驗`;
const DESCRIPTION = `${OWNER.name}，${OWNER.company}資深不動產經紀人。二十歲入行、十五年不動產經驗，連續三年年度千萬經紀人。深耕台中海線沙鹿、梧棲、清水、龍井，陪您把買房賣房的每個決定都做對。`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "台中海線房仲推薦",
    "沙鹿房仲",
    "梧棲房仲",
    "清水房仲",
    "龍井房仲",
    "千萬經紀人",
    OWNER.name,
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: "/about" },
  openGraph: {
    type: "profile",
    url: `${SITE_URL}/about`,
    title: TITLE,
    description: DESCRIPTION,
    siteName: `${OWNER.name}｜台中海線房仲`,
  },
};

export default function AboutPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.navWrap}>
          <Link href="/" className={styles.brand}>
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
              <small className={styles.brandSub}>{OWNER.company} 台中海線房仲</small>
            </span>
          </Link>
          <div className={styles.navCta}>
            <Link className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`} href="/card/booking">
              線上預約
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className={styles.section}>
          <div className={`${styles.container} ${styles.center}`}>
            <span className={styles.eyebrow}>ABOUT ME</span>
            <h1 className={styles.sectionTitle}>關於我</h1>
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
          </div>

          {/* ── 服務區域 ── */}
          <div className={`${styles.container} ${styles.center} ${styles.aboutBlock}`}>
            <h2 className={styles.aboutSubTitle}>我服務的區域</h2>
            <p className={styles.sectionDesc}>
              主力深耕台中海線，熟悉沙鹿買房、梧棲置產、清水換屋、龍井投資等在地生活圈與重劃區行情，買賣房都能給您最在地的判斷。
            </p>
          </div>
          <div className={styles.container}>
            <div className={styles.areaGrid}>
              {AREAS.map((area) => (
                <div key={area.name} className={styles.areaCard}>
                  <div className={styles.pin}>📍</div>
                  <h3>{area.name}</h3>
                  <p>{area.desc}</p>
                </div>
              ))}
            </div>
            <div className={styles.areaNote}>
              <span>💬</span>
              <span>
                不論您是<strong>首購、換屋、置產或投資</strong>，只要物件在台中海線，我都能提供最即時、最在地的行情分析與建議。
              </span>
            </div>
          </div>

          {/* ── 年度戰績 ── */}
          <div className={`${styles.container} ${styles.center} ${styles.aboutBlock}`}>
            <h2 className={styles.aboutSubTitle}>我的戰績</h2>
            <p className={styles.sectionDesc}>用穩定的成交實力，證明專業與信任值得託付。</p>
          </div>
          <div className={styles.container}>
            <div className={styles.awardBanner}>
              <div className={styles.awardBannerInner}>
                <div className={styles.trophy}>🏆</div>
                <h3>連續三年 年度千萬經紀人</h3>
                <p>民國112年・113年・114年　連續三年榮獲年度千萬經紀人殊榮</p>
                <p className={styles.awardBannerNote}>
                  這些數字背後，是每一位客戶願意把買房、賣房這麼重要的決定託付給我
                </p>
              </div>
            </div>
            <div className={styles.yearsRow}>
              {YEARS.map((year) => (
                <div key={year} className={styles.yearCard}>
                  <div className={styles.yearNum}>{year}</div>
                  <div className={styles.yearLabel}>年度千萬經紀人</div>
                  <div className={styles.yearSub}>Year of Excellence</div>
                </div>
              ))}
            </div>
          </div>

          {/* 看完關於我，下一步就是約時間 —— 不要讓這頁變成死路 */}
          <div className={`${styles.container} ${styles.center} ${styles.aboutBlock}`}>
            <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/card/booking">
              線上預約諮詢
            </Link>
            <div>
              <Link href="/" className={styles.aboutBackLink}>
                ← 回首頁
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
