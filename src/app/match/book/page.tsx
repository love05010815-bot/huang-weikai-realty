/**
 * /match/book —— 同事的客人從店官網「好案配對找房」勾完物件、按「前往預約看屋」跳回來的預約頁。
 *
 * 2026-10-06 晚上他在店官網那個視窗說：「所有同事的代客建檔都不要再經過我的個人網站。
 * 客戶預約後應該要將預約跳回業務的代客建檔裡面的預約。」—— 所以這一頁：
 *   - 只有店官網的品牌（太平洋房屋 梧棲新市鎮旗艦加盟店）與那位業務的名字，沒有凱心成家、沒有本人的頁首頁尾，
 *     也不會先給客人看一頁配對結果（之前走 /match?k=…&go=1&items=… 會先畫結果清單、再切到表單，他在手機上看到的就是那一頁）。
 *   - 網址帶 ?k=客人識別碼&items=S編號,S編號（店官網照契約接上 items=）。識別碼認人（哪位業務的客人、姓名電話先填好），
 *     物件在伺服器端就撈好，畫面一到就是預約表單。
 *   - 送出走原本的 /api/match/viewing：寫進那位業務的「預約」清單、推手機通知，本人不會收到。
 *   - 識別碼不認、或沒帶物件 → 講清楚、給店裡電話，不丟錯誤畫面。
 *
 * 本人自己的客人不走這裡（他們照舊是 /match 的專屬連結）。
 */
import type { Metadata } from "next";
import { BRANCH_SITE, OWNER } from "@/config/owner";
import { branchBookUrl, branchFiltersFromPreference, branchMatchUrl, parseItemIds } from "@/lib/match/colleague-link";
import { contactForOwner, type ColleagueContact } from "@/lib/match/colleagues";
import { publicListing, type PublicListing } from "@/lib/match/public";
import { getBuyer, getListings, type Buyer } from "@/lib/match/store";
import { verifyBuyerToken } from "@/lib/match/token";
import BranchBook from "./BranchBook";
import styles from "./book.module.css";

export const metadata: Metadata = {
  title: `預約看屋｜${BRANCH_SITE.name}`,
  description: `${BRANCH_SITE.name} 預約看屋`,
  // 客人專屬的頁，不給搜尋引擎收
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function Shell({ colleague, children }: { colleague: ColleagueContact | null; children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandName}>{BRANCH_SITE.name}</span>
          <span className={styles.brandSub}>預約看屋</span>
        </div>
        {colleague && (
          <p className={styles.agent}>
            您的專屬業務：<b>{colleague.name}</b>
          </p>
        )}
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <p>
          <b>{BRANCH_SITE.name}</b>
          <br />
          電話 <a href={`tel:${BRANCH_SITE.phone.replace(/\D/g, "")}`}>{BRANCH_SITE.phone}</a>
          <a href={BRANCH_SITE.url} target="_blank" rel="noopener noreferrer">
            店官網
          </a>
        </p>
        <p className={styles.legal}>
          {OWNER.brokerage}　不動產經紀人：{OWNER.brokerName}　{OWNER.brokerLicense}
        </p>
      </footer>
    </div>
  );
}

export default async function BranchBookPage({ searchParams }: { searchParams: Promise<{ k?: string; items?: string }> }) {
  const sp = await searchParams;
  const k = typeof sp.k === "string" && sp.k ? sp.k : null;
  const ids = parseItemIds(typeof sp.items === "string" ? sp.items : null);

  let buyer: Buyer | null = null;
  let colleague: ColleagueContact | null = null;
  if (k) {
    try {
      const buyerId = verifyBuyerToken(k);
      buyer = buyerId ? await getBuyer(buyerId) : null;
      colleague = buyer ? await contactForOwner(buyer.colleagueId) : null;
    } catch (e) {
      console.error("[match/book] 認人失敗:", e);
      buyer = null;
    }
  }

  if (!k || !buyer) {
    return (
      <Shell colleague={null}>
        <div className={styles.card}>
          <h1 className={styles.h1}>這個預約連結已經失效</h1>
          <p className={styles.muted}>請跟您的業務要一條新的連結，或直接撥電話到店裡，我們幫您安排看屋。</p>
          <a className={`${styles.btn} ${styles.btnPrimary}`} href={`tel:${BRANCH_SITE.phone.replace(/\D/g, "")}`}>
            撥電話 {BRANCH_SITE.phone}
          </a>
          <a className={`${styles.btn} ${styles.btnGhost}`} href={`${BRANCH_SITE.url}/#match`}>
            回店官網看物件
          </a>
        </div>
      </Shell>
    );
  }

  // 物件在伺服器端撈好；下架的剔除，順序照客人勾的順序
  let listings: PublicListing[] = [];
  try {
    const found = ids.length ? await getListings(ids) : [];
    const byId = new Map(found.filter((l) => l.status === "available").map((l) => [l.id, l]));
    listings = ids.flatMap((id) => {
      const l = byId.get(id);
      return l ? [publicListing(l)] : [];
    });
  } catch (e) {
    console.error("[match/book] 撈物件失敗:", e);
  }
  const missing = ids.length - listings.length;
  // 「回店官網再挑物件」：帶著業務原本設的條件與這位客人的預約連結（跟業務傳給他的是同一條）
  const backUrl = branchMatchUrl(branchBookUrl(k), branchFiltersFromPreference(buyer.preference));

  return (
    <Shell colleague={colleague}>
      <BranchBook token={k} name={buyer.name ?? ""} phone={buyer.phone ?? ""} listings={listings} missing={missing} colleague={colleague} backUrl={backUrl} />
    </Shell>
  );
}
