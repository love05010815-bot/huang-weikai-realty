/**
 * /match —— 買方自動配對找房 ＋ 預約看屋
 *
 * 版面沿用首頁那套（home.module.css 的 .page 定義了配色變數），互動流程在 MatchApp.tsx。
 * 物件來自愛屋店網自動同步（lib/match/sync.ts），要改配對規則看 config/match.ts 與 lib/match/matcher.ts。
 *
 * 從 LINE 卡片的「預約看屋」按鈕進來會帶 ?book=物件編號，MatchApp 會直接跳到那一戶的預約表單。
 *
 * ?k=識別碼&go=1（專員傳給客戶的專屬連結）：**在這裡、伺服器端就先配好**，結果跟著 HTML 一起送。
 *   2026-09-27 他反映客戶點開要等 5 秒才有物件、以為要自己重填 —— 原本是先畫一張空表單、
 *   再等瀏覽器打 /me 和 /search 兩趟。現在頁面殼先到、中間是「正在配對…」，物件一算好就接上；
 *   從頭到尾看不到空表單。識別碼不認就退回一般訪客。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { OWNER, SITE_URL } from "@/config/owner";
import SiteNav from "@/app/_ui/SiteNav";
import SocialLinks from "@/app/_ui/SocialLinks";
import SiteFooter from "@/app/_ui/SiteFooter";
import { runMatchSearch } from "@/lib/match/search";
import { getBuyer } from "@/lib/match/store";
import { verifyBuyerToken } from "@/lib/match/token";
import styles from "../home.module.css";
import matchStyles from "./match.module.css";
import MatchApp, { type MatchInitial } from "./MatchApp";

const TITLE = `自動配對找房｜台中海線房仲${OWNER.name}｜沙鹿梧棲清水龍井`;
const DESCRIPTION = `告訴${OWNER.alias}您的購屋條件（區域、預算、房數、坪數、類型），系統從目前在售的台中海線物件自動配對，看中意可直接預約看屋，並在 LINE 收到確認與新物件通知。`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  alternates: { canonical: "/match" },
  openGraph: { type: "website", url: `${SITE_URL}/match`, title: TITLE, description: DESCRIPTION, siteName: `${OWNER.name}｜台中海線房仲` },
};

export const dynamic = "force-dynamic";

/**
 * 專屬連結那條路：驗識別碼 → 讀他存的條件 → 配對 → 把結果當 initial 交給 MatchApp。
 * 任何一步出錯都退回一般流程（initial = null），不讓客戶看到錯誤畫面。
 */
async function PrefetchedMatch({ k }: { k: string }) {
  let initial: MatchInitial | null = null;
  try {
    const buyerId = verifyBuyerToken(k);
    const buyer = buyerId ? await getBuyer(buyerId) : null;
    if (buyer) {
      initial = {
        buyerId: buyer.id,
        token: k,
        preference: buyer.preference,
        name: buyer.name,
        phone: buyer.phone,
        result: buyer.preference ? await runMatchSearch(buyer.preference, buyer.id) : null,
      };
    }
  } catch (e) {
    console.error("[match] 專屬連結預先配對失敗（退回一般流程）:", e);
  }
  return <MatchApp initial={initial} />;
}

/** 配對還在算時的畫面。重點是講清楚「條件已經設好了」—— 不然客戶看到等待就以為要重填 */
function MatchLoading() {
  return (
    <div className={matchStyles.wrap}>
      <div className={`${matchStyles.card} ${matchStyles.loading}`} role="status" aria-live="polite">
        <span className={matchStyles.spinner} aria-hidden="true" />
        <p className={matchStyles.loadingTitle}>正在依您的條件配對物件…</p>
        <p className={matchStyles.hint}>條件已經幫您設定好了，不用重新填，馬上就好。</p>
      </div>
    </div>
  );
}

export default async function MatchPage({ searchParams }: { searchParams: Promise<{ k?: string; go?: string }> }) {
  const sp = await searchParams;
  const prefetchKey = sp.go === "1" && typeof sp.k === "string" && sp.k ? sp.k : null;
  return (
    <div className={styles.page}>
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
      </header>

      <SocialLinks variant="float" />
      <main>
        <section className={styles.section}>
          <div className={`${styles.container} ${styles.center}`}>
            <span className={styles.eyebrow}>MATCH</span>
            <h1 className={styles.sectionTitle}>自動配對找房</h1>
            <p className={styles.sectionDesc}>
              告訴我們您的購屋條件，系統會從目前在售的物件裡自動配對，看中意可以直接預約看屋。
              預約完成後在官方 LINE 收到確認，之後有符合條件的新物件也會第一時間通知您。
            </p>
          </div>
          <div className={styles.container}>
            {prefetchKey ? (
              <Suspense fallback={<MatchLoading />}>
                <PrefetchedMatch k={prefetchKey} />
              </Suspense>
            ) : (
              <MatchApp />
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
