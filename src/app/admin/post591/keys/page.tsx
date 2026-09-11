/**
 * /admin/post591/keys —— 同事版外掛的授權碼（2026-09-11 他說的：同事版 9/20 後失效、不可外流；
 * 同天下午改成「一批同事共用一組碼、不記是誰，只要知道幾個人在用、上架幾次」）
 *
 * 一組碼一批人共用；每台 Chrome 第一次驗證成功就登記一台，超過「電腦數上限」就擋。
 * 這裡新增、停用／恢復、改到期日、改上限、重設電腦清單、刪除，並看每組碼幾台在用、幾台上架過、上架幾次。
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
  const defaultExpires = defaultExpiresDate(); // 9/20 前一律 9/20，之後今天＋30 天
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
          給同事的外掛（1.5.0 起）要有授權碼才能用：<b>一組碼這批同事共用</b>，每台 Chrome 第一次驗證會登記一台，超過「電腦數上限」（預設 {LICENSE_DEFAULT_MAX_INSTALLS} 台，可改）就擋，
          這是防外流的閘，不記是誰。這裡看得到每組碼<b>幾台電腦在用、其中幾台上架過、上架幾次</b>。
          新增時預設到期日 <b>{defaultExpires}</b>（第一批統一到 2026-09-20，過了以後預設給 30 天；都是台灣時間當天結束）。
          <b>到期了不用換檔案</b>：改那一列的到期日、按「存」，同事重新打開外掛頁就恢復。要收回：按「停用」。
          {" "}
          <Link href="/admin/post591">← 回廣告刊登助手</Link>
        </p>
      </header>
      <KeysManager rows={rows} installs={installs} loadError={loadError} defaultExpires={defaultExpires} defaultMax={LICENSE_DEFAULT_MAX_INSTALLS} />
    </div>
  );
}
