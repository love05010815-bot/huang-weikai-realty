"use client";

/**
 * 單一物件頁的三件客戶端小事：
 *   ① 進頁時記一次「這戶的頁被打開」 → /api/listing-click，action = "page"。
 *      後台 /admin/listings 的點擊統計會多一格「單戶頁」，看得出哪戶被傳得最多。
 *      跟全站的 ListingClickTracker 走同一支 API、同一張表，只是它記的是「點擊」、這裡記的是「打開」。
 *   ② 「分享這戶」按鈕：手機用系統分享面板（LINE 就在裡面），桌機複製網址。
 *   ③ ❤️ 瀏覽足跡（2026-10-02）：同一個時間點也在**客戶自己的瀏覽器**記一筆「看過這戶」，
 *      給 /favorites 的「瀏覽足跡」頁籤用。不上傳、跟①那筆統計完全是兩回事（見 lib/favorites.ts）。
 */

import { useEffect, useState } from "react";
import { recordTrail } from "@/app/_ui/favorites/store";
import one from "./listing.module.css";

type Props = {
  slug: string;
  shareUrl: string;
  /** 分享用的全名「區域 標題」 */
  title: string;
  /** 足跡快照用：標題與區域分開存 */
  listingTitle: string;
  area: string;
};

const ENDPOINT = "/api/listing-click";

function recordPageView(slug: string): void {
  try {
    const payload = JSON.stringify({ slug, action: "page" });
    if (typeof navigator.sendBeacon === "function") {
      const ok = navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: "application/json" }));
      if (ok) return;
    }
    void fetch(ENDPOINT, {
      method: "POST",
      body: payload,
      keepalive: true,
      headers: { "Content-Type": "application/json" },
    }).catch(() => {});
  } catch {
    // 統計而已，壞了就算了
  }
}

export default function ListingPageView({ slug, shareUrl, title, listingTitle, area }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    recordPageView(slug);
    recordTrail({ kind: "listing", key: slug, title: listingTitle, sub: area });
  }, [slug, listingTitle, area]);

  async function share(): Promise<void> {
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // 使用者按了取消、或瀏覽器不給剪貼簿 —— 都不用報錯
    }
  }

  return (
    <button type="button" className={one.shareBtn} onClick={share} aria-live="polite">
      {copied ? "已複製網址 ✓" : "分享這戶 ↗"}
    </button>
  );
}
