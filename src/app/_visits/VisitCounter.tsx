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
 *
 * ## 為什麼要重試一次
 *
 * 2026-08-25 線上實測：資料庫連線池被搶光（`P2024`）時 API 會回
 * `available:false`，計數器就整頁消失，而且**不報錯**。這站流量低、
 * `/api/visits` 又是獨立的 serverless function，冷啟動搶不到連線是常態，
 * 所以這裡等一下再試一次。伺服器那邊也有各自的重試（見 `site-visits.ts`）。
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

function alreadyCountedToday(day: string): boolean {
  // localStorage 在隱私模式／被封鎖時存取會直接丟例外，包起來
  try {
    return window.localStorage.getItem(STORAGE_KEY) === day;
  } catch {
    return false;
  }
}

async function fetchOnce(day: string): Promise<Counts | null> {
  const counted = alreadyCountedToday(day);
  try {
    const res = await fetch("/api/visits", {
      method: counted ? "GET" : "POST",
      cache: "no-store",
    });
    const data = (await res.json()) as ApiResponse;

    // ⚠️ 旗標只在 `available:true` 時才寫 —— 那是「伺服器真的加進去了」的唯一訊號。
    //    寫太早（只看 res.ok）：POST 其實失敗卻標記成算過了，這個人今天就漏掉。
    //    寫太晚（等解析完數字）：回應格式一有問題就提早跳出、旗標沒寫到，
    //    下次重新整理又 POST 一次，人氣會一路灌上去。
    if (!counted && data.available) {
      try {
        window.localStorage.setItem(STORAGE_KEY, day);
      } catch {
        // 存不進去就算了（隱私模式），最多下次重新整理再算一次
      }
    }

    if (!data.available || typeof data.today !== "number" || typeof data.total !== "number") {
      return null;
    }
    return { today: data.today, total: data.total };
  } catch {
    // 計數器是裝飾品，連不上就當作沒有這個東西，不要影響頁面
    return null;
  }
}

/** 同一次載入裡共用的請求，避免 silent 版與顯示版各打一次 */
let inflight: Promise<Counts | null> | null = null;

function loadCounts(): Promise<Counts | null> {
  if (inflight) return inflight;

  inflight = (async () => {
    const day = taipeiDay();
    const first = await fetchOnce(day);
    if (first) return first;
    // 連線池搶不到是暫時的，等一下再試一次。
    // 第一次如果 POST 成功，旗標已經寫了，這次會走 GET —— 不會重複計數。
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return fetchOnce(day);
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
