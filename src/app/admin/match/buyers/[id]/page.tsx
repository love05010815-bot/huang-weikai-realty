/**
 * /admin/match/buyers/[id] —— 一位買方：資料、需求、目前符合的物件、怎麼傳給他。
 *
 * 配對、專屬連結、建議訊息都由 lib/match/intake.ts 的 buildBuyerBrief 算（跟手機快速建檔同一支），
 * 所以他在後台看到的幾間，跟客戶點開連結看到的一模一樣。
 */
import { redirect } from "next/navigation";
import { adminEmails } from "@/auth";
import { CIS } from "@/app/admin/_components/cis";
import AdminGateNotice from "@/app/admin/appointments/AdminGateNotice";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { buildBuyerBrief } from "@/lib/match/intake";
import { buildMatchMeta } from "@/lib/match/meta";
import { getBuyer } from "@/lib/match/store";
import BuyerDetail from "../BuyerDetail";
import styles from "../buyer-form.module.css";

export const dynamic = "force-dynamic";

export default async function BuyerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) return <AdminGateNotice kind="no_provider" />;
  if (adminEmails().length === 0) return <AdminGateNotice kind="no_whitelist" />;
  const { email } = await getAdminCheckArgs();
  const { id } = await params;
  if (!email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(`/admin/match/buyers/${id}`)}`);
  if (!(await isCurrentUserAdmin())) return <AdminGateNotice kind="not_allowed" email={email} />;

  const shell = (children: React.ReactNode) => (
    <main style={{ background: CIS.bg, color: CIS.text, fontFamily: CIS.font, minHeight: "100vh", padding: "20px 16px 40px" }}>{children}</main>
  );

  let buyer;
  try {
    buyer = await getBuyer(id);
  } catch (e) {
    return shell(<p className={styles.error}>資料庫讀不到：{e instanceof Error ? e.message : String(e)}</p>);
  }
  if (!buyer) {
    return shell(
      <div className={styles.wrap}>
        <a className={styles.back} href="/admin/match?tab=buyers">
          ← 買方配對
        </a>
        <p className={styles.muted}>找不到這位買方，可能已經被刪掉了。</p>
      </div>,
    );
  }

  // 幾個查詢循序做：連線池只有 3 條
  const meta = await buildMatchMeta();
  const brief = await buildBuyerBrief(buyer);

  return shell(
    <BuyerDetail
      buyer={{
        id: buyer.id,
        name: buyer.name || buyer.displayName || "（未填姓名）",
        phone: buyer.phone ?? "",
        note: buyer.note,
        displayName: buyer.displayName,
        linked: Boolean(buyer.lineUserId),
        followed: buyer.followed,
        notify: buyer.notify,
        preference: buyer.preference,
      }}
      brief={brief}
      meta={meta}
    />,
  );
}
