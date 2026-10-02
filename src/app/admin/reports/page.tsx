/**
 * /admin/reports —— 社區銷售報告書後台
 *
 * 流程（免費路線，跟待產文案同一套）：
 *   ① 選建案 → ② 複製指令、貼進他自己的 ChatGPT → ③ 把回覆（JSON）貼回來 → 解析預覽 → 存草稿／發佈。
 * 發佈後：/map 點到那個建案會出現「社區銷售報告書」入口，前台頁在 /map/report/<建案 id>，
 * 同時進 sitemap。server action 會 revalidate，**不用重新部署**。
 *
 * 建案本身的資料（建商、完工、戶數…）來自建案總表 port-projects.ts，前台以總表為準；
 * ChatGPT 只補總表沒有的欄位跟文字段落。
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { adminEmails } from "@/auth";
import { CIS } from "@/app/admin/_components/cis";
import { Icon } from "@/app/admin/_ui/icons";
import AdminGateNotice from "@/app/admin/appointments/AdminGateNotice";
import { AREA_LABEL, PROJECTS } from "@/data/port-projects";
import { getMapListingsByProject, type PublicMapListing } from "@/lib/map-listings";
import { REPORT_LABEL } from "@/lib/project-report";
import { listReports, type ReportRecord } from "@/lib/project-reports";
import { SITE_URL } from "@/config/owner";
import ReportsManager, { type ReportProjectOption } from "./ReportsManager";
import styles from "@/app/admin/listings/listings-admin.module.css";

export const dynamic = "force-dynamic";

export default async function ReportsAdminPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    return <AdminGateNotice kind="no_provider" />;
  }
  if (adminEmails().length === 0) return <AdminGateNotice kind="no_whitelist" />;
  const { email } = await getAdminCheckArgs();
  if (!email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/admin/reports")}`);
  if (!(await isCurrentUserAdmin())) return <AdminGateNotice kind="not_allowed" email={email} />;

  const { project: focus } = await searchParams;

  // 資料庫連不上不要丟 500 白畫面 —— 講清楚是資料庫的問題
  let reports: ReportRecord[] = [];
  let loadError: string | null = null;
  try {
    reports = await listReports();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  // 在售物件：預覽裡「我在這個社區的在售物件」那段要用；讀不到就空，不影響其他功能
  const listingsByProject: Record<string, PublicMapListing[]> = {};
  try {
    for (const [id, list] of await getMapListingsByProject()) listingsByProject[id] = list;
  } catch {
    // 忽略
  }

  const hasReport = new Set(reports.map((r) => r.projectId));
  const options: ReportProjectOption[] = PROJECTS.map((p) => ({
    id: p.id,
    name: p.name,
    builder: p.builder,
    areaLabel: AREA_LABEL[p.area],
    mineCount: listingsByProject[p.id]?.length ?? 0,
  })).sort(
    (a, b) =>
      Number(hasReport.has(b.id)) - Number(hasReport.has(a.id)) ||
      b.mineCount - a.mineCount ||
      a.name.localeCompare(b.name, "zh-Hant"),
  );

  return (
    <main className={styles.page} style={{ background: CIS.bg, color: CIS.text, fontFamily: CIS.font }}>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>
          <Icon name="book" /> {REPORT_LABEL}
        </h1>
      </div>
      <p className={styles.subtitle} style={{ color: CIS.textMute }}>
        客戶在
        <Link href="/map" target="_blank" rel="noopener noreferrer">
          {" 海線建案一覽 "}
        </Link>
        點到建案，就能開這個社區的完整介紹（建商與建築團隊、地段價值、社區特色、我在售的物件、實價登錄入口、同區競品、買方輪廓）。
        發佈立刻生效，不用重新部署。
      </p>

      <p className={styles.notice}>
        <b style={{ color: CIS.text }}>怎麼做（免費）</b>：① 選社區 → ② 按 <b>複製指令</b>、開 ChatGPT 貼上送出 → ③ 把它回的整段（一個 JSON）複製、貼回
        <b>貼回結果</b> → <b>解析並預覽</b> 看一遍 → 存草稿或 <b>發佈到前台</b>。
        指令裡已經帶了建案總表的資料跟不能寫的字（價格、最／第一／保證），ChatGPT 查不到的會填「待確認」，前台顯示成標籤。
      </p>

      {loadError ? (
        <p className={styles.msg} style={{ color: "#fb7185" }}>
          讀不到資料庫：{loadError}
          <br />
          先確認 <code>DATABASE_URL</code> 有沒有設，以及 TiDB 是不是在睡。
        </p>
      ) : (
        <ReportsManager reports={reports} options={options} listingsByProject={listingsByProject} focus={focus ?? null} siteUrl={SITE_URL} />
      )}
    </main>
  );
}
