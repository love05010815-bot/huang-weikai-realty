/**
 * /tools —— 免費小工具（七個站上工具＋五個政府查詢系統的外部連結）
 *
 * 2026-11-11 系統擁有者：「把免費小工具另外單獨一個分頁」。之前這整塊長在首頁的 #tools 區塊，
 * 跟影音專區（2026-08-25）一樣改成獨立分頁；首頁只留一個入口（標題＋七顆工具連結＋「看全部」）。
 *
 * 清單在 config/tools.ts（TOOLS、TOOL_GROUPS、INFO_SITES），首頁入口跟這頁共用；
 * 卡片樣式借 home.module.css 的 .toolGrid／.toolCard／.toolDisclaimer／.infoSites，
 * 「買房常用／賣房常用」那兩張是 .toolGroups（同一個檔）。
 *
 * 這頁由上到下：買房常用｜賣房常用（2026-11-11 加，客戶先選身分）→ 其他（沒歸進那兩組、也沒放進
 * 資訊網的，目前兩張：租金補貼、坪數換算）→ 試算免責 → 房屋地產資訊網（站內的學區查詢＋五個政府網站）。
 * 七個工具每個只出現一次：在組裡或資訊網裡的，不再重複列在「其他」。
 *
 * ⚠️ 導覽列下拉選單（SiteNav.tsx 的 TOOLS_MENU）跟 /owner、/buyer 的按鈕（config/roles.ts）
 *    是各自一份，加工具時三處一起改。
 */
import Link from "next/link";
import type { Metadata } from "next";
import { OG_IMAGE, OWNER, SITE_URL } from "@/config/owner";
import { INFO_SITES, TOOL_GROUPS, toolsInGroup, ungroupedTools } from "@/config/tools";
import BreadcrumbJsonLd from "@/app/_ui/BreadcrumbJsonLd";
import SiteNav from "@/app/_ui/SiteNav";
import SocialLinks from "@/app/_ui/SocialLinks";
import SiteFooter from "@/app/_ui/SiteFooter";
import styles from "../home.module.css";
import tax from "../tax/tax.module.css";

const TITLE = `台中房產免費小工具｜房地合一稅・房貸・租金補貼・學區・坪數・行情試算｜台中海線房仲${OWNER.name}`;
const DESCRIPTION =
  "買賣房子會算到的都在這裡，不用跳到別的網站：房地合一稅試算、房貸月付金試算、租金補貼試算、新青安 3.0 資格檢測、國中小學區查詢、坪數與地籍面積換算、我的房子行情多少，算完看得到每一步怎麼來的。另整理台中市158空間資訊網、房屋稅籍編號查詢、土地使用分區、地籍圖、建築物套繪五個政府查詢系統的連結。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "房地合一稅試算",
    "房貸月付金試算",
    "租金補貼試算",
    "新青安 3.0",
    "台中學區查詢",
    "坪數換算",
    "房屋行情試算",
    "台中房屋稅籍編號查詢",
    "土地使用分區查詢",
    "地籍圖查詢",
    "建築物套繪查詢",
    "台中海線房仲",
    OWNER.name,
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: "/tools" },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/tools`,
    title: TITLE,
    description: DESCRIPTION,
    siteName: `${OWNER.name}｜台中海線房仲`,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

export default function ToolsPage() {
  return (
    <div className={styles.page}>
      <BreadcrumbJsonLd items={[{ name: "免費小工具", href: "/tools" }]} />
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

      {/* 一定要放在 <header> 外面——header 的 backdrop-filter 會把 position:fixed 的子元素關在裡面（見 SiteNav.tsx） */}
      <SocialLinks variant="float" />

      <main>
        <section className={styles.section}>
          <div className={`${styles.container} ${styles.center} ${styles.stickyTitleWrap}`}>
            <span className={styles.eyebrow}>TOOLS</span>
            <h1 className={styles.sectionTitle}>免費小工具</h1>
          </div>
          <div className={`${styles.container} ${styles.center}`}>
            <p className={styles.sectionDesc}>
              買賣房子最怕算漏了。這些試算都在站上，不用跳到別的網站，算完還看得到每一步怎麼來的。
            </p>
          </div>

          <div className={styles.container}>
            {/* 買房常用／賣房常用（2026-11-11 系統擁有者：「再多增加一區是買房常用/賣房常用」）：
                放在最前面讓客戶先選身分，四顆都是下面七個工具裡的，分組在 config/tools.ts 的 TOOL_GROUPS。 */}
            <div className={styles.toolGroups}>
              {TOOL_GROUPS.map((group) => (
                <section
                  key={group.key}
                  className={`${styles.toolGroup} ${group.key === "buy" ? styles.toolGroupBuy : styles.toolGroupSell}`}
                  aria-labelledby={`tool-group-${group.key}`}
                >
                  <div className={styles.toolGroupHead}>
                    <h2 id={`tool-group-${group.key}`} className={styles.toolGroupTitle}>
                      <span aria-hidden="true">{group.icon}</span> {group.title}
                    </h2>
                    <p className={styles.toolGroupDesc}>{group.desc}</p>
                  </div>
                  <div className={styles.toolGroupList}>
                    {toolsInGroup(group).map((tool) => (
                      <Link key={tool.href} className={styles.toolGroupItem} href={tool.href}>
                        <span className={styles.toolGroupIcon} aria-hidden="true">
                          {tool.icon}
                        </span>
                        <span className={styles.toolGroupBody}>
                          <span className={styles.toolGroupName}>{tool.title}</span>
                          <span className={styles.toolGroupHint}>{tool.brief}</span>
                        </span>
                        <span className={styles.toolGroupGo}>{tool.cta ?? "開始試算 →"}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {/* 其他：沒歸進買房／賣房的工具（2026-11-11 系統擁有者：「全部工具改其他，移除已歸類的項目」）。
                清單從 TOOL_GROUPS 反推（config/tools.ts 的 ungroupedTools），不是另一份手寫清單。 */}
            <h2 className={styles.toolsSubTitle}>其他</h2>
            <div className={styles.toolGrid}>
              {ungroupedTools().map((tool) => (
                <Link key={tool.title} className={styles.toolCard} href={tool.href}>
                  <div className={styles.toolIcon}>{tool.icon}</div>
                  <h3>{tool.title}</h3>
                  <p>{tool.desc}</p>
                  <span className={styles.toolSource}>依據：{tool.source}</span>
                  <span className={styles.toolGo}>{tool.cta ?? "開始試算 →"}</span>
                </Link>
              ))}
            </div>
            <p className={styles.toolDisclaimer}>
              ⚠️ 試算<strong>僅供參考</strong>。房地合一稅之<strong>實際稅額以國稅局核定為準</strong>；
              貸款條件與利率以各銀行實際審核結果為準。稅率與相關法規會調整，
              試算頁面上有標明法規核對日期與法源出處。試算結果不構成稅務或財務意見。
            </p>

            {/* 房屋地產資訊網：站內的學區查詢（2026-11-11 系統擁有者「國中小學區查詢移到房屋地產資訊網」）
                ＋五個政府查詢系統的外部連結（清單在 config/tools.ts 的 INFO_SITES）。
                站內的用 <Link> 同分頁開、卡底寫「開始查詢 →」；外部的 <a target="_blank">、寫「另開新視窗 ↗」。 */}
            <div className={styles.infoSites}>
              <h2 className={styles.infoSitesTitle}>房屋地產資訊網</h2>
              <p className={styles.infoSitesDesc}>
                買賣前常要查的學區、地籍、稅籍、土地使用分區，整理在這裡不用再找。學區在站上直接查；政府系統點了會另開新視窗。
              </p>
              <div className={styles.infoGrid}>
                {INFO_SITES.map((site) => {
                  const body = (
                    <>
                      <span className={styles.infoIcon} aria-hidden="true">
                        {site.icon}
                      </span>
                      <span className={styles.infoBody}>
                        <span className={styles.infoName}>{site.title}</span>
                        <span className={styles.infoDesc}>{site.desc}</span>
                        <span className={styles.infoMeta}>
                          {site.agency}・{site.internal ? "開始查詢 →" : "另開新視窗 ↗"}
                        </span>
                      </span>
                    </>
                  );
                  return site.internal ? (
                    <Link key={site.href} className={styles.infoCard} href={site.href}>
                      {body}
                    </Link>
                  ) : (
                    <a key={site.href} className={styles.infoCard} href={site.href} target="_blank" rel="noopener noreferrer">
                      {body}
                    </a>
                  );
                })}
              </div>
              <p className={styles.infoNote}>
                學區查詢是本站整理教育局公告的工具，其餘為各政府機關的查詢系統，查詢結果以各機關為準。
                查到的資料看不懂、或想知道對買賣有什麼影響，直接問我。
              </p>
            </div>

            <Link href="/" className={tax.backLink}>
              ← 回首頁
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
