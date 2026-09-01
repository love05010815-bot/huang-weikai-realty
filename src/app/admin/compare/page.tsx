/**
 * /admin/compare —— 競品分析
 *
 * 貼上同社區在賣的 591 物件，產出可以直接傳給屋主的四段分析：
 * 比較表／貼身對手／體質檢測／判讀卡在哪，加一段 200 字以內的結論。
 *
 * 🔴 **這一頁不會去 591 抓資料，也不該加那種功能。** 591 服務條款明文禁止網路爬蟲
 *    與自動下載程式，違反者每一個刊登物件以 3,000 元計費求償。資料一律由使用者
 *    自己在瀏覽器複製後貼進來。細節見 `src/lib/rival-parser.ts` 檔頭。
 *
 * ⚠️ **全部在瀏覽器裡算完，沒有 server action、沒有 API、不進資料庫。**
 *    貼進來的東西關掉分頁就沒了。這是刻意的：591 的行情每週都在變，
 *    存起來的舊資料拿去跟屋主講，比沒有更糟。要加存檔功能之前先想清楚
 *    「這筆資料放三個禮拜還能用嗎」。
 */
import { redirect } from "next/navigation";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { adminEmails } from "@/auth";
import { Icon } from "@/app/admin/_ui/icons";
import AdminGateNotice from "@/app/admin/appointments/AdminGateNotice";
import CompareManager from "./CompareManager";
import styles from "./compare.module.css";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    return <AdminGateNotice kind="no_provider" />;
  }
  if (adminEmails().length === 0) return <AdminGateNotice kind="no_whitelist" />;
  const { email } = await getAdminCheckArgs();
  if (!email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/admin/compare")}`);
  if (!(await isCurrentUserAdmin())) return <AdminGateNotice kind="not_allowed" email={email} />;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.h1}>
          <Icon name="radar" size={22} /> 競品分析
        </h1>
        <p className={styles.lede}>
          貼上同社區在賣的 591 物件，產出可以直接傳給屋主的四段分析。
          資料只留在這個瀏覽器分頁，<b>不會上傳、不會存檔</b>。
        </p>
      </header>
      <CompareManager />
    </div>
  );
}
