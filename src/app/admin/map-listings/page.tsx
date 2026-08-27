/**
 * /admin/map-listings —— 建案地圖物件後台
 *
 * 這裡上架的物件，會出現在 `/map` 上「點某個建案 → 建案資訊下方」的位置。
 * server action 會 revalidate `/map`，**改完不用重新部署**。
 *
 * ⚠️ 這是**跟「精選好案」完全分開的一套資料**（2026-08-23 系統擁有者拍板）。
 *    在這裡新增不會影響首頁與 /listings；在精選好案新增也不會出現在地圖上。
 *    兩邊要都出現就兩邊各建一筆。
 *
 * 照片上傳共用精選好案那支 API（`/api/admin/listings/photo`），
 * 一樣壓成 WebP 存進 Vercel Blob，不用進 repo 部署。
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { adminEmails } from "@/auth";
import { CIS } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import AdminGateNotice from "@/app/admin/appointments/AdminGateNotice";
import { listAllMapListings, type MapListingRecord } from "@/lib/map-listings";
import { loadHouseolInventory } from "@/lib/houseol-inventory";
import { getHouseolAddressMap } from "@/lib/houseol-address";
import { getListingClickStats, type ListingClickStats } from "@/lib/listing-clicks";
import { PROJECTS } from "@/data/port-projects";
import MapListingsManager from "./MapListingsManager";
import styles from "./map-listings-admin.module.css";

export const dynamic = "force-dynamic";

export default async function MapListingsAdminPage() {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    return <AdminGateNotice kind="no_provider" />;
  }
  if (adminEmails().length === 0) return <AdminGateNotice kind="no_whitelist" />;
  const { email } = await getAdminCheckArgs();
  if (!email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/admin/map-listings")}`);
  if (!(await isCurrentUserAdmin())) return <AdminGateNotice kind="not_allowed" email={email} />;

  // 資料庫連不上不要丟 500 白畫面 —— 講清楚是資料庫的問題，你才知道要看哪裡
  let rows: MapListingRecord[] = [];
  let loadError: string | null = null;
  try {
    rows = await listAllMapListings();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  // 點擊統計。讀不到就給空物件，畫面顯示 0 —— 統計壞掉不該讓整個後台打不開
  let clickStats: ListingClickStats = {};
  try {
    clickStats = await getListingClickStats();
  } catch {
    // 忽略：上面 loadError 已經會處理「資料庫整個連不上」那種情況
  }

  const active = rows.filter((r) => r.status === "active");
  const projectsWithListings = new Set(active.map((r) => r.projectId)).size;
  const noPhoto = active.filter((r) => r.photos.length === 0).length;

  // 建案下拉選單用。依「有沒有物件」再依名稱排，常用的排前面
  const options = PROJECTS.map((p) => ({
    id: p.id,
    name: p.name,
    builder: p.builder,
    count: rows.filter((r) => r.projectId === p.id).length,
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-Hant"));

  // 門牌地址存資料庫、不在庫存檔裡 —— 庫存檔有版控而這個 repo 是公開的。
  // 還沒跑過 `node tools/houseol/push-addresses.js` 就是每筆都沒地址，
  // 挑案清單照常運作，只是少一個便利功能。
  const addressMap = await getHouseolAddressMap();
  const inventory = loadHouseolInventory().map((it) => {
    const address = addressMap.get(it.caseId);
    return address ? { ...it, address } : it;
  });

  return (
    <main
      className={styles.page}
      style={{ background: CIS.bg, color: CIS.text, fontFamily: CIS.font }}
    >
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>
            <Icon name="map" /> 建案地圖物件
          </h1>
          <p className={styles.sub} style={{ color: CIS.textMute }}>
            這裡上架的物件會出現在
            <Link href="/map" target="_blank" rel="noopener noreferrer">
              {" 建案地圖 "}
            </Link>
            上，客戶點到該建案時看得到。存檔立刻生效，不用重新部署。
          </p>
        </div>
      </header>

      <p className={styles.notice}>
        ⚠️ <b>這裡跟「精選好案」是兩套資料。</b>
        在這裡新增<b>不會</b>出現在首頁或 <code>/listings</code>；在精選好案新增也<b>不會</b>出現在地圖上。
        兩邊都要就各建一筆。
      </p>

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
              <b>{rows.length}</b>
              <span>筆物件</span>
            </li>
            <li>
              <b>{active.length}</b>
              <span>上架中</span>
            </li>
            <li>
              <b>{projectsWithListings}</b>
              <span>個建案有物件</span>
            </li>
            <li>
              <b>{noPhoto}</b>
              <span>上架但沒照片</span>
            </li>
          </ul>

          <MapListingsManager initial={rows} projects={options} inventory={inventory} clickStats={clickStats} />
        </>
      )}
    </main>
  );
}
