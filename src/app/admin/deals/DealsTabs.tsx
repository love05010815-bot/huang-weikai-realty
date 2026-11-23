"use client";

/**
 * 成交紀錄的兩個分頁：「成交紀錄」（清單＋建檔）／「統計數據」。跟屋主建檔同一套：
 * 分頁狀態放網址 `?tab=stats`，兩個面板都掛著只切顯示（切回清單時搜尋字、展開的卡片都還在）。
 * 用 useSearchParams 所以 page.tsx 那邊要包 Suspense。
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/app/admin/_ui/icons";
import styles from "./deals-admin.module.css";

type Tab = "list" | "stats";

export default function DealsTabs({ list, stats }: { list: React.ReactNode; stats: React.ReactNode }) {
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
          <Icon name="money" size={15} /> 成交紀錄
        </button>
        <button type="button" role="tab" aria-selected={tab === "stats"} className={`${styles.tabBtn} ${tab === "stats" ? styles.tabOn : ""}`} onClick={() => go("stats")}>
          <Icon name="chart" size={15} /> 統計數據
        </button>
      </div>
      <div hidden={tab !== "list"}>{list}</div>
      <div hidden={tab !== "stats"}>{stats}</div>
    </>
  );
}
