/**
 * /admin/post591/keys —— 同事版外掛的授權碼。
 * 2026-09-11 上午「一人一組綁第一台」→ 同天下午「一批共用一組」→ **2026-10-05 他拍板（外掛 1.6.4 起）：一人一組、綁定單一台電腦**。
 *
 * 現在：新增一組＝一位同事（名稱填同事名字，上限 1 台）；第一台貼碼的 Chrome 就綁定，第二台被擋（bound_elsewhere）；
 * 同事換電腦 → 這裡按「解除綁定」再貼一次。舊的共用碼（上限 > 1）照舊跑到到期／停用，畫面標「舊的共用碼」。
 * 這裡新增、停用／恢復、改到期日、解除綁定、刪除，並看每組碼綁了沒、上架幾次。FB 社團廣告助手的碼也在這裡發（同一張表）。
 * 外掛驗證走 /api/post591-ext/verify（不用登入）；這一頁跟其他後台頁一樣要 Google 登入白名單。
 * 純邏輯與存取在 src/lib/ext-license*.ts，動作在 src/lib/actions/ext-license.ts。
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { adminEmails } from "@/auth";
import AdminGateNotice from "@/app/admin/appointments/AdminGateNotice";
import { COMPARE_THEME } from "@/app/admin/compare/theme";
import { LICENSE_DEFAULT_MAX_INSTALLS, defaultExpiresDate, listInstalls, listLicenses, taiwanDate } from "@/lib/ext-license";
import KeysManager, { type InstallView, type LicenseView } from "./KeysManager";
import styles from "../post591.module.css";

export const dynamic = "force-dynamic";

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export default async function LicenseKeysPage() {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    return <AdminGateNotice kind="no_provider" />;
  }
  if (adminEmails().length === 0) return <AdminGateNotice kind="no_whitelist" />;
  const { email } = await getAdminCheckArgs();
  if (!email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/admin/post591/keys")}`);
  if (!(await isCurrentUserAdmin())) return <AdminGateNotice kind="not_allowed" email={email} />;

  // 資料庫連不上不要丟 500 白畫面 —— 講清楚是資料庫的問題（跟影音後台同一個原則）
  let rows: LicenseView[] = [];
  const installs: Record<string, InstallView[]> = {};
  let loadError: string | null = null;
  const defaultExpires = defaultExpiresDate(); // 批次日期都過了就是今天＋30 天（LICENSE_BATCH_EXPIRES 加新日期才會變）
  try {
    const now = Date.now();
    rows = (await listLicenses()).map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      installs: r.installs,
      launchedInstalls: r.launchedInstalls,
      maxInstalls: r.maxInstalls,
      lastSeenAt: iso(r.lastSeenAt),
      lastVersion: r.lastVersion,
      launchCount: r.launchCount,
      lastLaunchAt: iso(r.lastLaunchAt),
      expiresDate: taiwanDate(r.expiresAt),
      expired: r.expiresAt.getTime() < now,
      revoked: !!r.revokedAt,
      createdAt: r.createdAt.toISOString(),
    }));
    for (const i of await listInstalls()) {
      (installs[i.licenseId] ||= []).push({
        id: i.id,
        firstSeenAt: i.firstSeenAt.toISOString(),
        lastSeenAt: i.lastSeenAt.toISOString(),
        lastVersion: i.lastVersion,
        launchCount: i.launchCount,
        lastLaunchAt: iso(i.lastLaunchAt),
      });
    }
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className={styles.page} style={COMPARE_THEME}>
      <header className={styles.head}>
        <h1 className={styles.h1}>🔑 同事授權碼</h1>
        <p className={styles.lede}>
          給同事的外掛要有授權碼才能用。<b>2026-10-05 起（外掛 1.6.4 起）一人一組、只能綁一台電腦</b>：新增時填同事名字，把下面組好的訊息私訊給他；
          他在哪一台 Chrome 第一次貼碼、按儲存，那一台就綁定了，別台貼同一組碼會被擋（畫面寫「已經綁在另一台電腦上了」）。
          同事換電腦或重灌 → 按那一列的「解除綁定」，他在新電腦再貼一次就好。這裡看得到每個人<b>綁了沒、上架幾次、最近什麼時候用</b>。
          新增時預設到期日 <b>{defaultExpires}</b>（可以改成任何日期；台灣時間當天結束）。
          <b>到期了不用換檔案</b>：改那一列的到期日、按「存」，同事重新打開外掛頁就恢復。要收回：按「停用」。
          {" "}
          <Link href="/admin/post591">← 回廣告刊登助手</Link>
        </p>
      </header>
      <KeysManager rows={rows} installs={installs} loadError={loadError} defaultExpires={defaultExpires} defaultMax={LICENSE_DEFAULT_MAX_INSTALLS} />
    </div>
  );
}
