/**
 * /admin/match —— 買方配對後台：預約看屋、買方條件、物件同步
 *
 * 三塊都在同一頁切分頁：
 *   - 預約看屋：誰要看哪一戶、什麼時候、有沒有綁 LINE；狀態改「已確認／已取消」會推播通知買方。
 *   - 買方：留過條件的人，以及誰綁了 LINE（綁了才收得到新物件推播）。
 *   - 物件同步：愛屋店網同步狀態、立即同步、目前在售幾戶。
 *
 * 資料庫連不上不要丟 500 白畫面 —— 講清楚是資料庫的問題。
 * 幾個查詢一律**循序**，這個專案的連線池只有 3 條。
 */
import { redirect } from "next/navigation";
import { adminEmails } from "@/auth";
import { MATCH } from "@/config/match";
import { CIS } from "@/app/admin/_components/cis";
import AdminGateNotice from "@/app/admin/appointments/AdminGateNotice";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { describePreference } from "@/lib/match/matcher";
import { countListings, getListings, listBuyersForAdmin, listListingsForAdmin, listViewingsForAdmin } from "@/lib/match/store";
import { getLastSyncResult, type SyncSummary } from "@/lib/match/sync";
import MatchAdmin, { type AdminBuyer, type AdminListing, type AdminViewing } from "./MatchAdmin";

export const dynamic = "force-dynamic";

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export default async function MatchAdminPage() {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) return <AdminGateNotice kind="no_provider" />;
  if (adminEmails().length === 0) return <AdminGateNotice kind="no_whitelist" />;
  const { email } = await getAdminCheckArgs();
  if (!email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/admin/match")}`);
  if (!(await isCurrentUserAdmin())) return <AdminGateNotice kind="not_allowed" email={email} />;

  let viewings: AdminViewing[] = [];
  let buyers: AdminBuyer[] = [];
  let listings: AdminListing[] = [];
  let counts = { available: 0, hidden: 0 };
  let lastSync: SyncSummary | null = null;
  let loadError: string | null = null;
  try {
    const rawViewings = await listViewingsForAdmin(300);
    // 一筆預約可能包含好幾間，標題一次撈齊（一個 IN 查詢，不要每筆各問一次）
    const titleById = new Map(
      (await getListings([...new Set(rawViewings.flatMap((v) => v.listingIds))])).map((l) => [l.id, l.title]),
    );
    viewings = rawViewings.map((v) => ({
      id: v.id,
      code: v.code,
      listingId: v.listingId,
      listingTitle: v.listingTitle,
      listingTitles: v.listingIds.map((id) => titleById.get(id) ?? id),
      listingArea: `${v.listingCity}${v.listingDistrict}`,
      listingPrice: v.listingPrice,
      name: v.name,
      phone: v.phone,
      preferredAt: v.preferredAt,
      note: v.note,
      status: v.status,
      agentNote: v.agentNote,
      lineUserId: v.lineUserId,
      buyerDisplayName: v.buyerDisplayName,
      createdAt: iso(v.createdAt),
    }));
    buyers = (await listBuyersForAdmin(300)).map((b) => ({
      id: b.id,
      displayName: b.displayName,
      name: b.name,
      phone: b.phone,
      linked: Boolean(b.lineUserId),
      followed: b.followed,
      notify: b.notify,
      summary: b.preference ? describePreference(b.preference) : null,
      note: b.note,
      updatedAt: iso(b.updatedAt),
    }));
    listings = (await listListingsForAdmin(80)).map((l) => ({
      id: l.id,
      title: l.title,
      area: `${l.city}${l.district}`,
      price: l.price,
      rooms: l.rooms,
      size: l.size,
      type: l.type,
      status: l.status,
      sourceUrl: l.sourceUrl,
      syncedAt: iso(l.syncedAt),
    }));
    counts = await countListings();
    lastSync = await getLastSyncResult();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  return (
    <main style={{ background: CIS.bg, color: CIS.text, fontFamily: CIS.font, minHeight: "100vh", padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>買方配對</h1>
        <p style={{ color: CIS.textMute, fontSize: 13, margin: "0 0 18px" }}>
          買方在 /match 留條件、預約看屋；物件每 {MATCH.syncIntervalMin} 分鐘從愛屋店網（storeid {MATCH.houseolStoreId}）自動同步。
        </p>
        {loadError ? (
          <div style={{ padding: 16, borderRadius: CIS.radiusSm, background: "rgba(244,63,94,0.12)", border: "1px solid rgba(244,63,94,0.35)" }}>
            資料庫讀不到：{loadError}
          </div>
        ) : (
          <MatchAdmin viewings={viewings} buyers={buyers} listings={listings} counts={counts} lastSync={lastSync} />
        )}
      </div>
    </main>
  );
}
