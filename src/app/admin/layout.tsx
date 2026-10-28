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
  // 2026-10-13 他要「加入主畫面」的圖示用凱心成家商標：白底方形（iOS 不吃透明）。
  // ⚠️ **只換圖示，不換桌面名稱**（他同日拍板）——所以這裡不設 appleWebApp.title，
  //    iOS 會沿用上面的 title，跟以前一樣。也刻意不設 appleWebApp.capable：standalone 模式
  //    在 iPhone 上是獨立的 cookie 空間，他會被迫再登入一次，而且 Google OAuth 在裡面會卡。
  icons: { apple: "/kaixing-touch-icon.png", icon: "/kaixing-touch-icon.png" },
  // 後台不給搜尋引擎收錄。
  robots: { index: false, follow: false },
};

/**
 * 主題（明亮／深色）在畫面畫出來前就掛到 <html data-adm-theme>，不會先閃一下另一個顏色。
 * 預設明亮（2026-10-28 他說黑的太暗）；色票在 _ui/adminShell.module.css，切換鈕在 AdminShell。
 * 擋門頁（沒權限）也跑這段，所以沒外殼也有正確的底色。
 */
const THEME_BOOT = `(function(){var t="light";try{var s=localStorage.getItem("adm-theme");if(s==="dark"||s==="light")t=s;}catch(e){}document.documentElement.setAttribute("data-adm-theme",t);})();`;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const boot = <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />;
  if (!(await isCurrentUserAdmin())) {
    return (
      <>
        {boot}
        {children}
      </>
    );
  }
  return (
    <>
      {boot}
      <AdminShell ownerName={OWNER.name}>{children}</AdminShell>
    </>
  );
}
