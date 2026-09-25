/**
 * /intake?key=… —— 手機快速建檔，不用登入。
 *
 * 他在外面接到買方來電時要「馬上打開就能輸入」。這條連結加到手機桌面，一按就是表單；
 * 存好原地看到符合幾間、一鍵把客戶專屬連結傳給他。資料跟後台「買方」是同一張表。
 *
 * 金鑰在網址上（見 lib/match/intake-key.ts）：不對就只給一句「連結無效」，什麼都不透露。
 * 不給搜尋引擎收錄、不放進任何選單。
 */
import type { Metadata } from "next";
import { OWNER } from "@/config/owner";
import { verifyIntakeKey } from "@/lib/match/intake-key";
import { buildMatchMeta } from "@/lib/match/meta";
import IntakeApp from "./IntakeApp";
import styles from "./intake.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "買方建檔",
  // Android Chrome「加到主畫面」沒有 manifest 時看這個（沒有就拿分頁標題）；iPhone 看下面 appleWebApp.title
  applicationName: "買方建檔",
  robots: { index: false, follow: false },
  // 加到 iPhone 主畫面時像個 app：名稱「買方建檔」（他 2026-09-25 指定）、全螢幕、桌面圖示用凱心成家的商標
  appleWebApp: { capable: true, title: "買方建檔", statusBarStyle: "default" },
  icons: { apple: "/kaixing-mark.png" },
};

export default async function IntakePage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams;

  let valid = false;
  try {
    valid = await verifyIntakeKey(key);
  } catch (e) {
    return (
      <div className={styles.page}>
        <div className={styles.invalid}>資料庫暫時連不上，請稍後再開一次。{e instanceof Error ? "" : ""}</div>
      </div>
    );
  }
  if (!valid || !key) {
    return (
      <div className={styles.page}>
        <div className={styles.invalid}>
          <strong>這個連結無效</strong>
          <br />
          可能是後台重新產生過快速建檔連結。到後台「買方配對 → 買方」重新拿一次，再加到手機桌面。
        </div>
      </div>
    );
  }

  const meta = await buildMatchMeta();
  return (
    <>
      <IntakeApp intakeKey={key} meta={meta} />
      <p style={{ textAlign: "center", fontSize: 11, color: "#8a9aa2", margin: "0 0 16px" }}>
        {OWNER.name}｜內部工具
      </p>
    </>
  );
}
