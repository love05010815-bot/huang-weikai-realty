"use client";

/**
 * 「用瀏覽器開啟」＋「複製網址」兩顆按鈕。複製要用 clipboard API 所以是 client component。
 */
import { useState } from "react";

export default function OpenInBrowserActions({ externalUrl, fullUrl }: { externalUrl: string; fullUrl: string }) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  }

  const btn: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    boxSizing: "border-box",
    minHeight: 48,
    padding: "12px 16px",
    borderRadius: 999,
    fontSize: 16,
    fontWeight: 800,
    fontFamily: "inherit",
    textDecoration: "none",
    cursor: "pointer",
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <a href={externalUrl} style={{ ...btn, background: "#e00000", border: "1px solid #e00000", color: "#fff" }}>
        用瀏覽器開啟
      </a>
      <button
        type="button"
        onClick={copy}
        style={{ ...btn, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.14)", color: "#d0c6c4" }}
      >
        {copied === "ok" ? "已複製，貼到 Safari／Chrome 的網址列" : copied === "fail" ? "複製失敗，請長按下面的網址" : "複製網址"}
      </button>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: "#a69a97",
          wordBreak: "break-all",
          userSelect: "all",
          textAlign: "center",
        }}
      >
        {fullUrl}
      </p>
    </div>
  );
}
