"use client";
/**
 * 顯示客戶用 LINE 傳來的照片／影片／語音／檔案。
 *
 * 為什麼要做成 client component 而不是直接寫一個 <img>：
 *
 * ⚠️ **LINE 只保留內容一段時間**（官方文件沒寫明多久），過期後代理端點會回 410。
 *    直接放 <img> 的話，畫面上就是一張破圖 —— 而破圖跟「權限壞了」「網路斷了」
 *    長得一模一樣，你會去查錯的地方。這裡把過期接住，明講是過期。
 *
 * 網址一律是後台自己的代理端點（/api/admin/line/media/…），不是 LINE 的原始網址：
 * 客戶傳來的可能是身分證或權狀，每一次讀取都要先過登入。
 */
import { useState } from "react";
import { CIS } from "@/app/admin/_components/cis";

const LABEL: Record<string, string> = {
  image: "照片",
  video: "影片",
  audio: "語音訊息",
  file: "檔案",
};

export default function LineMedia({
  kind,
  url,
  maxHeight = 240,
}: {
  kind: "image" | "video" | "audio" | "file";
  url: string;
  /** 清單裡要小張一點，對話框裡可以大一點 */
  maxHeight?: number;
}) {
  const [failed, setFailed] = useState<null | "gone" | "error">(null);

  if (failed) {
    return (
      <div
        style={{
          marginTop: 8,
          padding: "9px 12px",
          border: `1px dashed ${CIS.cardBorder}`,
          borderRadius: 8,
          fontSize: 13.5,
          lineHeight: 1.7,
          color: CIS.textMute,
        }}
      >
        {failed === "gone" ? (
          <>
            這張{LABEL[kind] || "內容"}<b>已經被 LINE 刪掉了</b>，抓不回來。
            <br />
            LINE 只保留客戶傳來的檔案一段時間 —— 手機上的對話記錄還看得到。
          </>
        ) : (
          <>載入{LABEL[kind] || "內容"}失敗。重新整理看看，還是不行就跟我說。</>
        )}
      </div>
    );
  }

  // 語音與檔案沒有縮圖可看，給連結就好，不要為了「有東西可看」硬塞播放器
  if (kind === "audio") {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <audio
        src={url}
        controls
        preload="none"
        style={{ marginTop: 8, width: "100%", maxWidth: 320 }}
        onError={() => setFailed("error")}
      />
    );
  }

  if (kind === "file") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: "inline-block", marginTop: 8, fontSize: 14, color: CIS.blueSoft }}
      >
        下載客戶傳的檔案 ↗
      </a>
    );
  }

  if (kind === "video") {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        src={url}
        controls
        // preload="none"：沒按播放就完全不下載。客戶傳的影片可能很大，
        // 而收件匣一次會列出很多則。
        preload="none"
        style={{ marginTop: 8, maxWidth: "100%", maxHeight, borderRadius: 8, display: "block" }}
        onError={() => setFailed("error")}
      />
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: 8 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="客戶傳來的照片"
        loading="lazy"
        style={{
          maxWidth: "100%",
          maxHeight,
          borderRadius: 8,
          display: "block",
          border: `1px solid ${CIS.cardBorder}`,
        }}
        onError={async () => {
          // 分辨「過期」與「其他錯誤」—— 代理端點對過期回 410。
          // 講錯原因會害人去查錯的地方，這一輪已經吃過好幾次虧。
          try {
            const r = await fetch(url, { method: "GET", cache: "no-store" });
            setFailed(r.status === 410 ? "gone" : "error");
          } catch {
            setFailed("error");
          }
        }}
      />
    </a>
  );
}
