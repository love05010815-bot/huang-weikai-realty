/**
 * /admin/fb —— FB社團廣告助手（粉專一稿多發；2026-10-13 他把後台名稱從「社團廣告發佈」改成這個、跟外掛同名，網址不動）
 *
 * 在後台寫一版廣告、勾好社團，交給 Chrome 外掛（tools/fb-group-poster）用你登入的粉專身分，
 * 在你自己的瀏覽器裡逐一打開社團、填好文案與圖片、替你按「發佈」（預設自動，「⚙️ 設定」可以關成半自動）。
 *
 * 🔴 Facebook 在 2024 年 4 月停用了社團發文 API，沒有官方 API 能發到社團；跟 591／樂屋一樣，
 *    真正「按按鈕」那段不可能在 Vercel 上跑，必須靠你瀏覽器裡的外掛。這一頁只是「大腦」。
 * 🔴 廣告內容與社團清單只存在你這台電腦的瀏覽器（IndexedDB），不進資料庫、不上雲。
 */
import { redirect } from "next/navigation";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { adminEmails } from "@/auth";
import { Icon } from "@/app/admin/_ui/icons";
import AdminGateNotice from "@/app/admin/appointments/AdminGateNotice";
import { COMPARE_THEME } from "@/app/admin/compare/theme";
import FbAdminManager from "./FbAdminManager";
import styles from "./fb.module.css";

export const dynamic = "force-dynamic";

export default async function FbPage() {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    return <AdminGateNotice kind="no_provider" />;
  }
  if (adminEmails().length === 0) return <AdminGateNotice kind="no_whitelist" />;
  const { email } = await getAdminCheckArgs();
  if (!email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/admin/fb")}`);
  if (!(await isCurrentUserAdmin())) return <AdminGateNotice kind="not_allowed" email={email} />;

  return (
    <div className={styles.page} style={COMPARE_THEME}>
      <header className={styles.head}>
        <h1 className={styles.h1}>
          <Icon name="megaphone" size={22} /> FB社團廣告助手
        </h1>
        <p className={styles.lede}>
          寫一版廣告、勾好要發的 Facebook 社團，交給你 Chrome 裡的「FB 社團廣告助手」外掛，用你的<b>粉專身分</b>
          逐一打開社團、填好文案和圖片、<b>替你按「發佈」</b>、隔幾秒換下一個；想自己按，到「⚙️ 設定」把「自動按發佈」關掉。
          內容只存在這台電腦、<b>不會上傳</b>。
        </p>
      </header>
      <FbAdminManager />
    </div>
  );
}
