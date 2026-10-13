/**
 * /admin/owners —— 屋主建檔
 *
 * 接過的房子、屋主的聯絡資料統整在這裡。一筆＝一位屋主，底下掛他的房子與聯絡紀錄。
 * 手機從 weikaihouse.com/admin/owners 登入就能查，搜尋是純前端、打字立刻有結果。
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
import { listOwnersWithDetails } from "@/lib/owners";
import { taipeiDay } from "@/lib/site-visits";
import { CONTRACT_SOON_DAYS, STALE_CONTACT_DAYS } from "@/config/owners";
import { pickCommissionDay, type StatRow } from "@/lib/owners-stats";
import OwnersManager, { type AdminOwner } from "./OwnersManager";
import OwnersStats, { type StatCard } from "./OwnersStats";
import OwnersTabs from "./OwnersTabs";
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
        askingPrice: p.askingPrice,
        floorPrice: p.floorPrice,
        note: p.note,
        contractNo: p.contractNo,
        contractStart: p.contractStart,
        contractEnd: p.contractEnd,
        contractType: p.contractType,
        delistReason: p.delistReason,
        delistAmount: p.delistAmount,
        delistNote: p.delistNote,
        delistedAt: p.delistedAt,
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
  const contractSoonBy = minusDays(today, -CONTRACT_SOON_DAYS);

  const stats = {
    owners: owners.length,
    properties: owners.reduce((n, o) => n + o.properties.length, 0),
    listing: owners.reduce((n, o) => n + o.properties.filter((p) => p.status === "listing").length, 0),
    contractSoon: owners.reduce((n, o) => n + o.properties.filter((p) => p.contractEnd && p.contractEnd <= contractSoonBy).length, 0),
    stale: owners.filter((o) => !o.lastContactAt || o.lastContactAt < staleBefore).length,
    // 他要的三格：一般約／專約／土地，都只算「委託中」的——下架、成交的不算在手上的件數
    general: owners.reduce((n, o) => n + o.properties.filter((p) => p.status === "listing" && p.contractType === "general").length, 0),
    exclusive: owners.reduce((n, o) => n + o.properties.filter((p) => p.status === "listing" && p.contractType === "exclusive").length, 0),
    land: owners.reduce((n, o) => n + o.properties.filter((p) => p.status === "listing" && p.kind === "土地").length, 0),
  };

  const cards: StatCard[] = [
    { value: stats.owners, label: "位屋主" },
    { value: stats.properties, label: "間房子" },
    { value: stats.listing, label: "委託中" },
    { value: stats.general, label: "一般約（委託中）" },
    { value: stats.exclusive, label: "專約（委託中）" },
    { value: stats.land, label: "土地（委託中）" },
    { value: stats.contractSoon, label: `合約 ${CONTRACT_SOON_DAYS} 天內到期` },
    { value: stats.stale, label: `超過 ${STALE_CONTACT_DAYS} 天沒聯絡` },
  ];

  // 年／月委託數量用的精簡資料：只有日期與分類，不帶姓名地址（傳到客戶端的東西愈少愈好）
  const statRows: StatRow[] = owners.flatMap((o) =>
    o.properties.map((p) => ({
      ...pickCommissionDay({ contractStart: p.contractStart, dealDate: p.dealDate, createdAt: o.createdAt }),
      contractType: p.contractType,
      kind: p.kind,
      status: p.status,
    })),
  );

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
        // OwnersTabs 用 useSearchParams（?tab=stats），要包 Suspense 不然 build 會嫌
        <Suspense fallback={null}>
          <OwnersTabs
            list={<OwnersManager owners={owners} today={today} staleBefore={staleBefore} contractSoonBy={contractSoonBy} />}
            stats={<OwnersStats cards={cards} rows={statRows} today={today} />}
          />
        </Suspense>
      )}
    </main>
  );
}
