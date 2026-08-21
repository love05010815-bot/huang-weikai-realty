/**
 * /admin/* 的共用外殼 —— 左側 menu 從這裡套到每一個後台頁面。
 *
 * 新增後台頁面時什麼都不用做：放進 src/app/admin/ 底下就自動有 menu，
 * 要讓它出現在選單裡再去 `_ui/nav.ts` 加一行。
 *
 * ⚠️ 沒權限的人不套外殼 —— 被擋下來的人不需要、也不該看到後台有哪些功能。
 *    真正的權限檢查在每一頁自己身上（這裡只決定「畫不畫 menu」）。
 */
import type { Metadata } from "next";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { OWNER } from "@/config/owner";
import AdminShell from "./_ui/AdminShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${OWNER.name}｜後台`,
  // 後台不給搜尋引擎收錄。
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isCurrentUserAdmin())) return <>{children}</>;
  return <AdminShell ownerName={OWNER.name}>{children}</AdminShell>;
}
