/**
 * /admin/post591/keys —— 同事版外掛的授權碼（2026-09-11 他說的：同事版 9/20 後失效、要綁定不可外流）
 *
 * 一人一組碼、第一次啟用就綁那台 Chrome；這裡新增、停用／恢復、解除綁定（同事換電腦）、改到期日、刪除。
 * 外掛驗證走 /api/post591-ext/verify（不用登入）；這一頁跟其他後台頁一樣要 Google 登入白名單。
 * 純邏輯與存取在 src/lib/ext-license*.ts，動作在 src/lib/actions/ext-license.ts。
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { adminEmails } from "@/auth";
import AdminGateNotice from "@/app/admin/appointments/AdminGateNotice";
import { COMPARE_THEME } from "@/app/admin/compare/theme";
import { defaultExpiresDate, listLicenses, taiwanDate } from "@/lib/ext-license";
import KeysManager, { type LicenseView } from "./KeysManager";
import styles from "../post591.module.css";

export const dynamic = "force-dynamic";

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
  let loadError: string | null = null;
  const defaultExpires = defaultExpiresDate(); // 9/20 前一律 9/20，之後今天＋30 天
  try {
    const now = Date.now();
    rows = (await listLicenses()).map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      bound: !!r.installId,
      boundAt: r.boundAt ? r.boundAt.toISOString() : null,
      lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
      lastVersion: r.lastVersion,
      launchCount: r.launchCount,
      lastLaunchAt: r.lastLaunchAt ? r.lastLaunchAt.toISOString() : null,
      expiresDate: taiwanDate(r.expiresAt),
      expired: r.expiresAt.getTime() < now,
      revoked: !!r.revokedAt,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className={styles.page} style={COMPARE_THEME}>
      <header className={styles.head}>
        <h1 className={styles.h1}>🔑 同事授權碼</h1>
        <p className={styles.lede}>
          給同事的外掛（1.5.0 起）要有授權碼才能用：<b>一人一組</b>，第一次啟用就綁在那台 Chrome，別台電腦拿同一組碼會被擋。
          新增時預設到期日 <b>{defaultExpires}</b>（第一批統一到 2026-09-20，過了以後預設給 30 天；都是台灣時間當天結束），要改就先改日期再新增。
          <b>到期了不用換檔案</b>：改那一列的到期日、按「存」，同事重新打開外掛頁就恢復。
          同事換電腦或重裝 Chrome：按「解除綁定」再讓他填一次；要收回：按「停用」。
          {" "}
          <Link href="/admin/post591">← 回廣告刊登助手</Link>
        </p>
      </header>
      <KeysManager rows={rows} loadError={loadError} defaultExpires={defaultExpires} />
    </div>
  );
}
