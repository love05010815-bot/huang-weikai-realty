"use client";

/**
 * 👁 文章點閱次數的前台觸發端
 *
 * 文章沒有「按下播放」那種明確動作——**打開這篇內頁本身就是訊號**，
 * 所以掛載時送一次就好，不用等使用者做什麼。做法跟 `video-views.ts`／
 * `ListingClickTracker.tsx` 同一套：sendBeacon 優先，不等回應、換頁也送得出去；
 * 不去重「同一人今天只算一次」——算的是人次，按幾次算幾次。
 *
 * ⚠️ 草稿頁在 `getPublicPost()` 就已經 404 了，能渲染到這個元件的一定是
 *    已發佈的文章，這裡不用再判斷一次狀態。
 */

import { useEffect } from "react";

const ENDPOINT = "/api/posts/view";

export default function PostViewBeacon({ postId }: { postId: string }) {
  useEffect(() => {
    const payload = JSON.stringify({ id: postId });
    try {
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        const blob = new Blob([payload], { type: "application/json" });
        if (navigator.sendBeacon(ENDPOINT, blob)) return;
      }
      void fetch(ENDPOINT, {
        method: "POST",
        body: payload,
        keepalive: true,
        headers: { "Content-Type": "application/json" },
      }).catch(() => {});
    } catch {
      // 統計而已，壞了就算了，不要影響使用者看文章
    }
  }, [postId]);

  return null;
}
