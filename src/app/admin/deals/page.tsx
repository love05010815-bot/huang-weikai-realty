/**
 * /admin/deals —— 成交紀錄
 *
 * 他原本用 Excel 記每一件成交（日期／方式／金額／服務費／點數／業績＋買賣雙方資料），
 * 另外手算每月每年的件數。搬進後台：一筆一張卡，統計分頁自動加總。
 *
 * 純內部工具，沒有對外頁面吃這份資料，資料庫連不上也不要丟 500 白畫面。
 */
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { adminEmails } from "@/auth";
import { CIS } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import AdminGateNotice from "@/app/admin/appointments/AdminGateNotice";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { listDeals, listLegacyCounts } from "@/lib/deals";
import type { DealStatRow, LegacyCount } from "@/lib/deals-text";
import { taipeiDay } from "@/lib/site-visits";
import DealsManager, { type AdminDeal } from "./DealsManager";
import DealsStats from "./DealsStats";
import DealsTabs from "./DealsTabs";
import styles from "./deals-admin.module.css";

export const dynamic = "force-dynamic";

export default async function DealsAdminPage() {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    return <AdminGateNotice kind="no_provider" />;
  }
  if (adminEmails().length === 0) return <AdminGateNotice kind="no_whitelist" />;
  const { email } = await getAdminCheckArgs();
  if (!email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/admin/deals")}`);
  if (!(await isCurrentUserAdmin())) return <AdminGateNotice kind="not_allowed" email={email} />;

  let deals: AdminDeal[] = [];
  let legacy: LegacyCount[] = [];
  let loadError: string | null = null;
  try {
    // createdAt（Date）不往客戶端送，其餘欄位原樣
    deals = (await listDeals()).map(({ createdAt: _createdAt, ...d }) => d);
    // 循序查（連線池只有 3 條）
    legacy = await listLegacyCounts();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  const today = taipeiDay();
  // 統計分頁只拿日期、方式與金額，不帶姓名地址
  const statRows: DealStatRow[] = deals.map((d) => ({
    day: d.dealDate,
    method: d.method,
    priceWan: d.priceWan,
    feeWan: d.feeWan,
    perfWan: d.perfWan,
  }));

  return (
    <main className={styles.page} style={{ background: CIS.bg, color: CIS.text, fontFamily: CIS.font }}>
      <header className={styles.head}>
        <h1 className={styles.title}>
          <Icon name="money" /> 成交紀錄
        </h1>
        <p className={styles.sub} style={{ color: CIS.textMute }}>
          每成交一件記一筆：成交金額、服務費、分得點數與買賣雙方資料。每月、每年的件數與金額在「統計數據」自動加總。
        </p>
      </header>

      {loadError ? (
        <p className={styles.error}>
          讀不到資料庫：{loadError}
          <br />
          先確認 <code>DATABASE_URL</code> 有沒有設，以及 TiDB 是不是在睡。
        </p>
      ) : (
        <Suspense fallback={null}>
          <DealsTabs list={<DealsManager deals={deals} today={today} />} stats={<DealsStats rows={statRows} legacy={legacy} today={today} />} />
        </Suspense>
      )}
    </main>
  );
}
