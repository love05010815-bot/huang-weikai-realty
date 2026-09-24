"use client";
/**
 * 首頁兩個自動彈窗的排隊器：中秋祝福影片彈窗 → 彈跳名片。
 *
 * 2026-09-24 系統擁有者指定順序「先跳出影片再跳出名片」（原本是名片先、影片等名片那套
 * 跑完才跳）。用「影片關閉後才掛載 CardPopup」排隊，**不是固定時間差**——影片什麼時候關
 * 不一定（手動關、Esc、點外面、自然播完都算，短則 1 秒長則影片全長），時間差會算不準；
 * CardPopup 本身完全沒改，維持它自己掛載後「500ms 開＋5000ms 倒數＋380ms 收合」那一套，
 * 只是現在改成由這支元件決定它什麼時候掛載。
 *
 * 中秋活動不在檔期內（midAutumnActive=false）或這次瀏覽已經跳過影片，都視為「影片已結束」，
 * CardPopup 照常立刻掛載——名片是常駐功能，不能被中秋活動耽誤或跳過。
 *
 * sessionStorage 鍵沿用之前的 mid-autumn-video-popup-seen-v1：同一分頁只跳一次影片，
 * 換頁再回首頁或重新整理都不再跳，直接進名片；分頁關掉才重置。
 */
import { useEffect, useState } from "react";
import CardPopup from "./CardPopup";
import MidAutumnVideoPopup from "./MidAutumnVideoPopup";

const SEEN_KEY = "mid-autumn-video-popup-seen-v1";

export default function HomePopups({ midAutumnActive }: { midAutumnActive: boolean }) {
  const [videoDone, setVideoDone] = useState(!midAutumnActive);

  useEffect(() => {
    if (!midAutumnActive || videoDone) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* 無痕／封鎖儲存：當作沒看過，照跳 */
    }
    if (seen) {
      setVideoDone(true);
      return;
    }
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* 存不進去就每次都跳，沒別的壞處 */
    }
    // 不需要 setVideoDone(false)：初始值已經是 false，這裡什麼都不用做，讓下面照常渲染 MidAutumnVideoPopup。
  }, [midAutumnActive, videoDone]);

  return (
    <>
      {midAutumnActive && !videoDone && <MidAutumnVideoPopup onDone={() => setVideoDone(true)} />}
      {videoDone && <CardPopup />}
    </>
  );
}
