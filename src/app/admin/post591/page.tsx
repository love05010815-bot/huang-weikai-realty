/**
 * /admin/post591 —— 591 刊登助手
 *
 * 貼上愛屋型錄（Ctrl+A 整頁）或 LINE 上的物件文字，產出 591 刊登表單每一格要填什麼：
 * 第①頁四連點、地址拆好、坪數價格、民國年、生活機能、廣告標題、固定版型的現況特色描述、
 * 照片下載指令，最後一顆「複製交接摘要」貼給 Claude，由它用 Chrome 填到第③步。
 *
 * 🔴 **這一頁不會去愛屋或 591 抓資料，也不該加那種功能。** 591 服務條款明文禁止爬蟲，
 *    每筆求償 3,000 元；愛屋是公司內部系統。資料一律由使用者自己複製貼進來。
 *
 * 🔴 **後台只是「大腦」，按 591 按鈕那一段（「手」）不在這裡。** 真正上 591 是 Claude 用
 *    Claude in Chrome 操作他已登入的瀏覽器，眉角在 .claude/memory/learning_591_posting_automation.md。
 *
 * ⚠️ **全部在瀏覽器裡算完，沒有 server action、沒有 API、不進資料庫。**
 *    貼進來的東西含屋主門牌，關掉分頁就沒了 —— 這是刻意的（repo 公開、個資不落地）。
 */
import { redirect } from "next/navigation";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { adminEmails } from "@/auth";
import { Icon } from "@/app/admin/_ui/icons";
import AdminGateNotice from "@/app/admin/appointments/AdminGateNotice";
import { COMPARE_THEME } from "@/app/admin/compare/theme";
import Post591Manager from "./Post591Manager";
import styles from "./post591.module.css";

export const dynamic = "force-dynamic";

export default async function Post591Page() {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    return <AdminGateNotice kind="no_provider" />;
  }
  if (adminEmails().length === 0) return <AdminGateNotice kind="no_whitelist" />;
  const { email } = await getAdminCheckArgs();
  if (!email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/admin/post591")}`);
  if (!(await isCurrentUserAdmin())) return <AdminGateNotice kind="not_allowed" email={email} />;

  return (
    <div className={styles.page} style={COMPARE_THEME}>
      <header className={styles.head}>
        <h1 className={styles.h1}>
          <Icon name="edit" size={22} /> 591 刊登助手
        </h1>
        <p className={styles.lede}>
          貼上愛屋型錄整頁、或你 LINE 上打的物件文字，產出 591 每一格要填什麼＋固定版型文案。
          最後按「複製交接摘要」貼給 Claude，它會用 Chrome 幫你填到第③步。資料只留在這個分頁，
          <b>不會上傳、不會存檔</b>。
        </p>
      </header>
      <Post591Manager />
    </div>
  );
}
