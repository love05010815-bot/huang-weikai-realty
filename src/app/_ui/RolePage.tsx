/**
 * 「我是屋主」「我是買方」兩個分流頁共用的整頁畫面（/owner、/buyer）。
 *
 * 2026-10-26 系統擁有者：首頁 hero 的「我是屋主／我是買方」點進去要「產生另一個分頁，顯示這兩個紅框的按鈕」
 * —— 他在免費小工具的下拉選單上各圈了兩項（屋主：房地合一稅試算、我的房子行情多少；
 * 買方：房貸月付金試算、新青安 3.0 資格檢測），同日再加屋主的「賣房流程」、買方的「買房流程」「實價登錄」。
 * 頁面就是標題＋一句說明＋幾顆大按鈕，兩頁長得一模一樣，所以畫面只寫一份，內容全部從 config/roles.ts 來。
 *
 * 外殼（header／導覽列／社群／黏住的標題／footer）照 /area 那幾頁的寫法一字不差，
 * 那些為什麼這樣排的理由請看 app/area/page.tsx 與 home.module.css，這裡不再抄一次。
 */
import Link from "next/link";
import type { Metadata } from "next";
import { OG_IMAGE, OWNER, SITE_URL } from "@/config/owner";
import { ROLE_LIST, type Role } from "@/config/roles";
import BreadcrumbJsonLd from "@/app/_ui/BreadcrumbJsonLd";
import SiteNav from "@/app/_ui/SiteNav";
import SocialLinks from "@/app/_ui/SocialLinks";
import SiteFooter from "@/app/_ui/SiteFooter";
import styles from "@/app/home.module.css";
import rp from "./RolePage.module.css";

/** 每頁的 metadata 寫法跟 /area 一樣，只是字從 roles.ts 讀；page.tsx 裡 `export const metadata = roleMetadata(ROLES.owner)`。 */
export function roleMetadata(role: Role): Metadata {
  return {
    metadataBase: new URL(SITE_URL),
    title: role.seo.title,
    description: role.seo.description,
    keywords: role.seo.keywords,
    robots: { index: true, follow: true },
    alternates: { canonical: role.path },
    openGraph: {
      type: "website",
      url: `${SITE_URL}${role.path}`,
      title: role.seo.title,
      description: role.seo.description,
      siteName: `${OWNER.name}｜台中海線房仲`,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: role.seo.title,
      description: role.seo.description,
      images: [OG_IMAGE.url],
    },
  };
}

export default function RolePage({ role }: { role: Role }) {
  const other = ROLE_LIST.find((r) => r.slug !== role.slug);
  return (
    <div className={styles.page}>
      <BreadcrumbJsonLd items={[{ name: role.label, href: role.path }]} />
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

      {/* 一定要放在 <header> 外面（backdrop-filter 會把 fixed 關在 header 裡），見 SiteNav.tsx */}
      <SocialLinks variant="float" />

      <main>
        <section className={styles.section}>
          <div className={`${styles.container} ${styles.center} ${styles.stickyTitleWrap}`}>
            <span className={styles.eyebrow}>{role.eyebrow}</span>
            <h1 className={styles.sectionTitle}>{role.label}</h1>
          </div>
          <div className={`${styles.container} ${styles.center}`}>
            <p className={styles.sectionDesc}>{role.desc}</p>
          </div>

          <div className={styles.container}>
            {/* 大按鈕：整張卡就是連結，點哪裡都會過去。2～3 顆一排，剛好 4 顆排 2×2（見 RolePage.module.css 的 .twoUp） */}
            <div className={`${rp.grid} ${role.tools.length === 4 ? rp.twoUp : ""}`}>
              {role.tools.map((t) => (
                <Link key={t.href} href={t.href} className={rp.card}>
                  <span className={rp.icon} aria-hidden="true">
                    {t.icon}
                  </span>
                  <span className={rp.title}>{t.title}</span>
                  <span className={rp.desc}>{t.desc}</span>
                  <span className={rp.cta}>{t.cta}</span>
                </Link>
              ))}
            </div>

            <div className={rp.foot}>
              {other && (
                <Link href={other.path}>
                  {other.icon} {other.label} →
                </Link>
              )}
              <Link href="/#tools">全部免費小工具 →</Link>
              <Link href="/">← 回首頁</Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
