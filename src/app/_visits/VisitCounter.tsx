"use client";

/**
 * 📊 「今日人氣 / 統計人氣」計數器
 *
 * 一個元件兩種用法：
 *
 *   <VisitCounter silent />   放在 layout —— 只負責「記一次」，畫面上什麼都不畫
 *   <VisitCounter />          放在頁尾 —— 顯示數字
 *
 * 首頁上兩個會同時掛載，但**只會送出一次請求** —— 底下 `inflight` 是模組層級的
 * 共用 Promise，先掛載的那個發請求，後掛載的直接沿用同一個結果。
 * 沒有這個的話兩邊會各自 POST 一次，人氣一次跳兩格（而且不會報錯）。
 *
 * ## 「同一個人今天只算一次」在這裡判斷，不在伺服器
 *
 * localStorage 存一個「上次算到哪一天」的旗標，同一天再回來就只打 GET 讀數字。
 * 伺服器端不存任何識別碼，所以判斷只能在這裡做。
 * 清掉瀏覽器資料或換一台裝置會重新算一次 —— 這是這類計數器本來就有的誤差，
 * 不是壞掉。
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "site_visit_day_v1";

type Counts = { today: number; total: number };
type ApiResponse = { available: boolean; today?: number; total?: number };

/** 台北時間的今天，要跟伺服器端 `taipeiDay()` 算出同一個值 */
function taipeiDay(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 同一次載入裡共用的請求，避免 silent 版與顯示版各打一次 */
let inflight: Promise<Counts | null> | null = null;

function loadCounts(): Promise<Counts | null> {
  if (inflight) return inflight;

  inflight = (async () => {
    const today = taipeiDay();

    // localStorage 在隱私模式／被封鎖時存取會直接丟例外，包起來
    let counted = false;
    try {
      counted = window.localStorage.getItem(STORAGE_KEY) === today;
    } catch {
      counted = false;
    }

    try {
      const res = await fetch("/api/visits", {
        method: counted ? "GET" : "POST",
        cache: "no-store",
      });

      // ⚠️ 旗標要在「POST 成功」當下就存，不能等下面解析完數字才存 ——
      // 伺服器那邊已經加過了，如果因為回應格式怪怪的就提早 return，
      // 旗標沒存到，下次重新整理又會再 POST 一次，人氣會一路灌上去。
      if (!counted && res.ok) {
        try {
          window.localStorage.setItem(STORAGE_KEY, today);
        } catch {
          // 存不進去就算了（隱私模式），最多下次重新整理再算一次
        }
      }

      const data = (await res.json()) as ApiResponse;
      if (!data.available || typeof data.today !== "number" || typeof data.total !== "number") {
        return null;
      }
      return { today: data.today, total: data.total };
    } catch {
      // 計數器是裝飾品，連不上就當作沒有這個東西，不要影響頁面
      return null;
    }
  })();

  return inflight;
}

export default function VisitCounter({ silent = false }: { silent?: boolean }) {
  const pathname = usePathname();
  const [counts, setCounts] = useState<Counts | null>(null);

  // 後台不算人氣 —— 那是自己在看，混進去會讓數字失真
  const skip = pathname?.startsWith("/admin") ?? false;

  useEffect(() => {
    if (skip) return;
    let alive = true;
    loadCounts().then((data) => {
      if (alive) setCounts(data);
    });
    return () => {
      alive = false;
    };
  }, [skip]);

  if (silent || skip || !counts) return null;

  return (
    <p aria-label="網站人氣統計">
      今日人氣：{counts.today}人
      <br />
      統計人氣：{counts.total}人
    </p>
  );
}
