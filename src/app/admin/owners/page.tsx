/**
 * /admin/owners —— 屋主建檔
 *
 * 接過的房子、屋主的聯絡資料統整在這裡。一筆＝一位屋主，底下掛他的房子與聯絡紀錄。
 * 手機從 weikaihouse.com/admin/owners 登入就能查，搜尋是純前端、打字立刻有結果。
 *
 * 純內部工具，沒有對外頁面吃這份資料，資料庫連不上也不要丟 500 白畫面。
 */
import { redirect } from "next/navigation";
import { adminEmails } from "@/auth";
import { CIS } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import AdminGateNotice from "@/app/admin/appointments/AdminGateNotice";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { listOwnersWithDetails } from "@/lib/owners";
import { taipeiDay } from "@/lib/site-visits";
import { STALE_CONTACT_DAYS } from "@/config/owners";
import OwnersManager, { type AdminOwner } from "./OwnersManager";
import styles from "./owners-admin.module.css";

export const dynamic = "force-dynamic";

/** "YYYY-MM-DD" 往前推 n 天，一樣用字串算，不繞去 DATE／時區 */
function minusDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export default async function OwnersAdminPage() {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    return <AdminGateNotice kind="no_provider" />;
  }
  if (adminEmails().length === 0) return <AdminGateNotice kind="no_whitelist" />;
  const { email } = await getAdminCheckArgs();
  if (!email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/admin/owners")}`);
  if (!(await isCurrentUserAdmin())) return <AdminGateNotice kind="not_allowed" email={email} />;

  let owners: AdminOwner[] = [];
  let loadError: string | null = null;
  try {
    const rows = await listOwnersWithDetails();
    owners = rows.map((o) => ({
      id: o.id,
      name: o.name,
      phone: o.phone,
      phone2: o.phone2,
      lineId: o.lineId,
      address: o.address,
      source: o.source,
      birthday: o.birthday,
      tags: o.tags,
      note: o.note,
      createdAt: iso(o.createdAt),
      updatedAt: iso(o.updatedAt),
      lastContactAt: o.lastContactAt,
      properties: o.properties.map((p) => ({
        id: p.id,
        address: p.address,
        community: p.community,
        kind: p.kind,
        layout: p.layout,
        area: p.area,
        floor: p.floor,
        status: p.status,
        dealDate: p.dealDate,
        price: p.price,
        note: p.note,
      })),
      contacts: o.contacts.map((c) => ({
        id: c.id,
        contactedAt: c.contactedAt,
        method: c.method,
        content: c.content,
      })),
    }));
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  const today = taipeiDay();
  const staleBefore = minusDays(today, STALE_CONTACT_DAYS);

  const stats = {
    owners: owners.length,
    properties: owners.reduce((n, o) => n + o.properties.length, 0),
    listing: owners.reduce((n, o) => n + o.properties.filter((p) => p.status === "listing").length, 0),
    stale: owners.filter((o) => !o.lastContactAt || o.lastContactAt < staleBefore).length,
  };

  return (
    <main className={styles.page} style={{ background: CIS.bg, color: CIS.text, fontFamily: CIS.font }}>
      <header className={styles.head}>
        <h1 className={styles.title}>
          <Icon name="users" /> 屋主建檔
        </h1>
        <p className={styles.sub} style={{ color: CIS.textMute }}>
          接過的房子、屋主的聯絡資料都放這裡。一位屋主一筆，底下掛他的房子跟聯絡紀錄；
          手機上直接搜姓名、電話、地址或社區。
        </p>
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
              <b>{stats.owners}</b>
              <span>位屋主</span>
            </li>
            <li>
              <b>{stats.properties}</b>
              <span>間房子</span>
            </li>
            <li>
              <b>{stats.listing}</b>
              <span>委託中</span>
            </li>
            <li>
              <b>{stats.stale}</b>
              <span>超過 {STALE_CONTACT_DAYS} 天沒聯絡</span>
            </li>
          </ul>

          <OwnersManager owners={owners} today={today} staleBefore={staleBefore} />
        </>
      )}
    </main>
  );
}
