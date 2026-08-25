"use client";

/**
 * 👆 精選好案的點擊統計 —— 前台這一半
 *
 * ## 為什麼用「事件委派」而不是把每個連結包成元件
 *
 * 卡片上要記的東西有三種寫法：首頁是 `<Link>` 包整個文字區、
 * `/listings` 是兩顆 `<a target="_blank">` 加一顆 `<Link>`。
 * 如果每一種都改成自己的 client 元件，等於把三處 server component 拆掉，
 * 而且以後多一顆按鈕就要再包一次。
 *
 * 改成：**server component 只加兩個 data 屬性**
 * （`data-listing-slug`、`data-listing-action`），這裡在 document 上聽一次，
 * 用 `closest()` 往上找。連結行為完全不變，也不會擋到導頁。
 *
 * ## 為什麼用 sendBeacon
 *
 * 點「物件資訊」會開新分頁、點「預約看屋」會換頁。用一般的 `fetch` 送，
 * 瀏覽器可能在請求送出前就把頁面收掉，統計就少了一筆而且不會有人發現。
 * `sendBeacon` 就是為了這個情境存在的：交給瀏覽器背景送，不等回應。
 *
 * ## 用 capture 階段
 *
 * 有些元件會在自己的 handler 裡 `stopPropagation()`，事件就冒泡不到 document。
 * capture 是由外往內，一定先經過我們這裡。
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const ENDPOINT = "/api/listing-click";

function send(slug: string, action: string) {
  const payload = JSON.stringify({ slug, action });
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }
    // sendBeacon 不支援或被擋（例如佇列滿了）時的後路。
    // keepalive 讓請求在頁面關掉之後還能送完。
    void fetch(ENDPOINT, {
      method: "POST",
      body: payload,
      keepalive: true,
      headers: { "Content-Type": "application/json" },
    }).catch(() => {});
  } catch {
    // 統計而已，壞了就算了，不要影響使用者點連結
  }
}

export default function ListingClickTracker() {
  const pathname = usePathname();
  // 後台不算 —— 那是自己在看
  const skip = pathname?.startsWith("/admin") ?? false;

  useEffect(() => {
    if (skip) return;

    const onClick = (event: MouseEvent) => {
      // 只認左鍵。Ctrl/Cmd＋點擊（開新分頁）也算 —— 那一樣是想看
      if (event.button !== 0) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const el = target.closest<HTMLElement>("[data-listing-slug][data-listing-action]");
      if (!el) return;

      const slug = el.dataset.listingSlug;
      const action = el.dataset.listingAction;
      if (!slug || !action) return;

      send(slug, action);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [skip]);

  return null;
}
