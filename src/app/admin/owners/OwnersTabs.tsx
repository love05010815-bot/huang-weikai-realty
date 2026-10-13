"use client";

/**
 * 屋主建檔的兩個分頁：「屋主資料」（清單＋操作）／「統計數據」。
 * 分頁狀態放網址 `?tab=stats`——存檔後 router.refresh()、或他重新整理，都還停在同一個分頁。
 * 用 useSearchParams 所以 page.tsx 那邊要包 Suspense（跟 /admin/leads 一樣）。
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/app/admin/_ui/icons";
import styles from "./owners-admin.module.css";

type Tab = "list" | "stats";

export default function OwnersTabs({ list, stats }: { list: React.ReactNode; stats: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const tab: Tab = sp.get("tab") === "stats" ? "stats" : "list";

  function go(next: Tab) {
    const q = new URLSearchParams(sp.toString());
    if (next === "stats") q.set("tab", "stats");
    else q.delete("tab");
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <>
      <div className={styles.tabBar} role="tablist">
        <button type="button" role="tab" aria-selected={tab === "list"} className={`${styles.tabBtn} ${tab === "list" ? styles.tabOn : ""}`} onClick={() => go("list")}>
          <Icon name="users" size={15} /> 屋主資料
        </button>
        <button type="button" role="tab" aria-selected={tab === "stats"} className={`${styles.tabBtn} ${tab === "stats" ? styles.tabOn : ""}`} onClick={() => go("stats")}>
          <Icon name="chart" size={15} /> 統計數據
        </button>
      </div>
      {/* 兩個都掛著、只切顯示：切回清單時搜尋字、展開的卡片都還在 */}
      <div hidden={tab !== "list"}>{list}</div>
      <div hidden={tab !== "stats"}>{stats}</div>
    </>
  );
}
