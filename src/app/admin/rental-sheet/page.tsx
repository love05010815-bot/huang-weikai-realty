/**
 * /admin/rental-sheet —— 租件圖片排版
 *
 * 租約附件「房屋內部傢俱項目」：上傳 6 或 8 張照片、勾傢俱品項，照他原本那份 Excel 的版面排好，
 * 按「列印／存成 PDF」輸出 A4 兩頁（第 1 頁照片、第 2 頁項目列表＋備註＋甲乙方＋簽約日期）。
 *
 * ⚠️ **純前端：照片不上傳、不進資料庫**（屋內照片跟租客資料沒必要離開他的電腦，
 *    也避開 Vercel 4.5MB 上傳上限）。文字草稿存 localStorage，照片重新整理就沒了。
 *    排版規則在 `src/lib/rental-sheet.ts`，改完跑 `npm run check:rental-sheet`。
 */
import { redirect } from "next/navigation";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { adminEmails } from "@/auth";
import { Icon } from "@/app/admin/_ui/icons";
import AdminGateNotice from "@/app/admin/appointments/AdminGateNotice";
import RentalSheetManager from "./RentalSheetManager";
import styles from "./rentalSheet.module.css";

export const dynamic = "force-dynamic";

export default async function RentalSheetPage() {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    return <AdminGateNotice kind="no_provider" />;
  }
  if (adminEmails().length === 0) return <AdminGateNotice kind="no_whitelist" />;
  const { email } = await getAdminCheckArgs();
  if (!email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/admin/rental-sheet")}`);
  if (!(await isCurrentUserAdmin())) return <AdminGateNotice kind="not_allowed" email={email} />;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.h1}>
          <Icon name="image" size={22} /> 租件圖片排版
        </h1>
        <p className={styles.lede}>
          放照片、勾傢俱，排成租約附件「房屋內部傢俱項目」。照片只留在這個瀏覽器分頁，<b>不會上傳</b>。
        </p>
      </header>
      <RentalSheetManager />
    </div>
  );
}
