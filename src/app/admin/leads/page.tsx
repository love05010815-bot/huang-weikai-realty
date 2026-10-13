/**
 * /admin/leads —— 開發物件追蹤後台
 *
 * 他從各處（591、樂屋、FB、路上看到的地址）把連結或地址丟進來，一筆一張卡；
 * 卡片上一眼看到：丟進來的日期、第一次聯繫的日期、找到屋主沒、進度到哪，
 * 連結直接一顆大按鈕點開。依區域分組，網址帶 ?area=清水區 就是那一區的清單。
 *
 * 純內部工具，沒有對外頁面吃這份資料，資料庫連不上也不要丟 500 白畫面。
 */
import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { adminEmails } from "@/auth";
import { CIS } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import AdminGateNotice from "@/app/admin/appointments/AdminGateNotice";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { listLeadsWithContacts } from "@/lib/dev-leads";
import { taipeiDay } from "@/lib/site-visits";
import { FOLLOW_UP_SOON_DAYS } from "@/config/dev-leads";
import LeadsManager, { type AdminLead } from "./LeadsManager";
import styles from "./leads-admin.module.css";

export const dynamic = "force-dynamic";

/**
 * 2026-10-13 他要把這頁存到手機桌面、圖示用凱心成家商標、**名稱叫「開發追蹤」**。
 * 圖示由 admin/layout.tsx 統一給（kaixing-touch-icon.png），這裡只改名稱：
 * iOS 看 apple-mobile-web-app-title、Android Chrome 看 <title>，兩個都設成同一個字。
 * 只有這一頁改名——其他後台頁他同日拍板維持原本的桌面名稱（見 layout.tsx），不要往上搬。
 * 一樣不設 appleWebApp.capable（standalone 會被迫重登、Google OAuth 會卡）。
 */
export const metadata: Metadata = {
  title: "開發追蹤",
  appleWebApp: { title: "開發追蹤" },
};

/** "YYYY-MM-DD" 往後推 n 天，一樣用字串算，不繞去 DATE／時區 */
function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export default async function LeadsAdminPage() {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    return <AdminGateNotice kind="no_provider" />;
  }
  if (adminEmails().length === 0) return <AdminGateNotice kind="no_whitelist" />;
  const { email } = await getAdminCheckArgs();
  if (!email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/admin/leads")}`);
  if (!(await isCurrentUserAdmin())) return <AdminGateNotice kind="not_allowed" email={email} />;

  const today = taipeiDay();
  const dueSoonBy = addDays(today, FOLLOW_UP_SOON_DAYS);

  let leads: AdminLead[] = [];
  let loadError: string | null = null;
  try {
    const rows = await listLeadsWithContacts();
    leads = rows.map((l) => ({
      id: l.id,
      address: l.address,
      area: l.area,
      ownerFound: l.ownerFound,
      source: l.source,
      sourceUrl: l.sourceUrl,
      ownerName: l.ownerName,
      ownerPhone: l.ownerPhone,
      note: l.note,
      createdAt: iso(l.createdAt),
      // 「丟進來的日期」用台北時間的日曆日，跟 contacted_at 同一種字串，畫面上才能並排比
      createdDay: l.createdAt ? taipeiDay(l.createdAt) : null,
      status: l.status,
      firstContactAt: l.firstContactAt,
      lastContactAt: l.lastContactAt,
      nextFollowUpAt: l.nextFollowUpAt,
      contacts: l.contacts.map((c) => ({
        id: c.id,
        contactedAt: c.contactedAt,
        contactedTime: c.contactedTime,
        method: c.method,
        feedback: c.feedback,
        resultStatus: c.resultStatus,
        nextFollowUpAt: c.nextFollowUpAt,
      })),
    }));
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  const stats = {
    total: leads.length,
    untouched: leads.filter((l) => l.status === "new").length,
    dueSoon: leads.filter((l) => l.nextFollowUpAt && l.nextFollowUpAt <= dueSoonBy).length,
    ownerFound: leads.filter((l) => l.ownerFound).length,
    signedUs: leads.filter((l) => l.status === "signed_us").length,
  };

  return (
    <main className={styles.page} style={{ background: CIS.bg, color: CIS.text, fontFamily: CIS.font }}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>
            <Icon name="target" /> 開發物件追蹤
          </h1>
          <p className={styles.sub} style={{ color: CIS.textMute }}>
            看到的連結或地址直接丟進來，自動分區。每張卡看得到丟進來的日期、第一次聯繫、找到屋主沒、進度到哪。
          </p>
        </div>
      </header>

      {loadError ? (
        <p className={styles.error}>
          讀不到資料庫：{loadError}
          <br />
          先確認 <code>DATABASE_URL</code> 有沒有設，以及 TiDB 是不是在睡。
        </p>
      ) : (
        <>
          <ul className={styles.stats}>
            <li>
              <b>{stats.total}</b>
              <span>筆物件</span>
            </li>
            <li>
              <b>{stats.untouched}</b>
              <span>還沒聯繫</span>
            </li>
            <li>
              <b>{stats.dueSoon}</b>
              <span>{FOLLOW_UP_SOON_DAYS} 天內待追蹤</span>
            </li>
            <li>
              <b>{stats.ownerFound}</b>
              <span>找到屋主</span>
            </li>
            <li>
              <b>{stats.signedUs}</b>
              <span>已簽約（我方）</span>
            </li>
          </ul>

          {/* useSearchParams（?area=）要包 Suspense，不然 build 會嫌 */}
          <Suspense fallback={null}>
            <LeadsManager leads={leads} today={today} dueSoonBy={dueSoonBy} />
          </Suspense>
        </>
      )}
    </main>
  );
}
