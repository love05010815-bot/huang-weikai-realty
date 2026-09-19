/**
 * /admin/leads —— 開發物件追蹤後台
 *
 * 一筆「物件」＝一個地址或 591／樂屋案件，屋主還沒簽給你。每接洽一次記一筆
 * 追蹤紀錄：什麼時候去的、屋主怎麼回、下次什麼時候再約。
 *
 * 純內部工具，沒有對外頁面吃這份資料，資料庫連不上也不要丟 500 白畫面。
 */
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

  let leads: AdminLead[] = [];
  let loadError: string | null = null;
  try {
    const rows = await listLeadsWithContacts();
    leads = rows.map((l) => ({
      id: l.id,
      address: l.address,
      source: l.source,
      sourceUrl: l.sourceUrl,
      ownerName: l.ownerName,
      ownerPhone: l.ownerPhone,
      note: l.note,
      createdAt: iso(l.createdAt),
      status: l.status,
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

  const today = taipeiDay();
  const dueSoonBy = addDays(today, FOLLOW_UP_SOON_DAYS);

  const stats = {
    total: leads.length,
    untouched: leads.filter((l) => l.status === "new").length,
    dueSoon: leads.filter((l) => l.nextFollowUpAt && l.nextFollowUpAt <= dueSoonBy).length,
    signedUs: leads.filter((l) => l.status === "signed_us").length,
    lost: leads.filter((l) => l.status === "signed_other" || l.status === "rejected").length,
  };

  return (
    <main className={styles.page} style={{ background: CIS.bg, color: CIS.text, fontFamily: CIS.font }}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>
            <Icon name="target" /> 開發物件追蹤
          </h1>
          <p className={styles.sub} style={{ color: CIS.textMute }}>
            有地址或 591／樂屋案件想去談屋主，先在這裡建一筆。每接洽一次加一筆紀錄，
            下次什麼時候再約、屋主怎麼回，都留得住。
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
              <span>待開發</span>
            </li>
            <li>
              <b>{stats.dueSoon}</b>
              <span>{FOLLOW_UP_SOON_DAYS} 天內待追蹤</span>
            </li>
            <li>
              <b>{stats.signedUs}</b>
              <span>已簽約（我方）</span>
            </li>
            <li>
              <b>{stats.lost}</b>
              <span>已流失</span>
            </li>
          </ul>

          <LeadsManager leads={leads} today={today} dueSoonBy={dueSoonBy} />
        </>
      )}
    </main>
  );
}
