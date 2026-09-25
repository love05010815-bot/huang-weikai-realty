/**
 * /admin/match/buyers/new —— 代客建檔：在外面接到買方來電，用手機把姓名、電話、需求記下來。
 *
 * 存好會跳到那位買方的詳情頁，配對結果跟「傳給客戶」都在那裡。
 * 表單選項（縣市、類型、屋齡…）跟 /match 用同一份（lib/match/meta.ts），兩邊永遠一致。
 */
import { redirect } from "next/navigation";
import { adminEmails } from "@/auth";
import { CIS } from "@/app/admin/_components/cis";
import AdminGateNotice from "@/app/admin/appointments/AdminGateNotice";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { buildMatchMeta } from "@/lib/match/meta";
import AdminBuyerForm from "../AdminBuyerForm";
import styles from "../buyer-form.module.css";

export const dynamic = "force-dynamic";

export default async function NewBuyerPage() {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) return <AdminGateNotice kind="no_provider" />;
  if (adminEmails().length === 0) return <AdminGateNotice kind="no_whitelist" />;
  const { email } = await getAdminCheckArgs();
  if (!email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/admin/match/buyers/new")}`);
  if (!(await isCurrentUserAdmin())) return <AdminGateNotice kind="not_allowed" email={email} />;

  const meta = await buildMatchMeta();

  return (
    <main style={{ background: CIS.bg, color: CIS.text, fontFamily: CIS.font, minHeight: "100vh", padding: "20px 16px 40px" }}>
      <div className={styles.wrap}>
        <a className={styles.back} href="/admin/match?tab=buyers">
          ← 買方配對
        </a>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>新增買方</h1>
        <p style={{ color: CIS.textMute, fontSize: 13, margin: "0 0 16px", lineHeight: 1.6 }}>
          接到來電就在這裡記。條件不用一次填齊，先存起來，之後在詳情頁隨時改。
          同一支電話已經有資料的話會直接更新那一筆，不會變成兩個人。
        </p>
      </div>
      <AdminBuyerForm meta={meta} />
    </main>
  );
}
