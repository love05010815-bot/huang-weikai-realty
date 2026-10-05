/**
 * /intake?key=… —— 手機快速建檔，不用登入。
 *
 * 他在外面接到買方來電時要「馬上打開就能輸入」。這條連結加到手機桌面，一按就是表單；
 * 存好原地看到符合幾間、一鍵把客戶專屬連結傳給他。資料跟後台「買方」是同一張表。
 *
 * 金鑰在網址上（見 lib/match/intake-key.ts）：不對就只給一句「連結無效」，什麼都不透露。
 * 不給搜尋引擎收錄、不放進任何選單。
 *
 * 同事版（2026-10-05）：同一個頁面，金鑰分本人的跟同事的（match_colleague）。同事看到的是自己的名單，
 * 畫面上的署名、客人看到的聯絡方式都換成同事（見 lib/match/colleagues.ts）；
 * 桌面圖示也不一樣（generateMetadata）：本人的是凱心成家商標，同事的是他 2026-10-05 給的那張插畫。
 */
import type { Metadata } from "next";
import { cache } from "react";
import { OWNER } from "@/config/owner";
import { resolveIntakeActor, type IntakeActor } from "@/lib/match/intake-key";
import { buildMatchMeta } from "@/lib/match/meta";
import { getPushPublicKey } from "@/lib/match/push";
import IntakeApp from "./IntakeApp";
import styles from "./intake.module.css";

export const dynamic = "force-dynamic";

const BASE_METADATA: Metadata = {
  title: "買方建檔",
  // Android Chrome「加到主畫面」沒有 manifest 時看這個（沒有就拿分頁標題）；iPhone 看下面 appleWebApp.title
  applicationName: "買方建檔",
  robots: { index: false, follow: false },
  // 加到 iPhone 主畫面時像個 app：名稱「買方建檔」（他 2026-09-25 指定）、全螢幕、桌面圖示用凱心成家的商標
  appleWebApp: { capable: true, title: "買方建檔", statusBarStyle: "default" },
  icons: { apple: "/kaixing-mark.png" },
};

/**
 * 同事的桌面圖示（2026-10-05 他說「同事加入到桌面的圖示不要用我的 logo」，最後指定用他給的那張
 * 「買方／梧棲新市鎮店」插畫）。檔案是從他給的圖切掉白邊、補好四角、縮成 512×512 的（public/）。
 * 名稱一樣叫「買方建檔」。
 */
const COLLEAGUE_ICON = "/intake-colleague-icon.png";

/** generateMetadata 跟頁面本體都要認人；同一個請求只查一次 */
const actorFor = cache((key: string | undefined) => resolveIntakeActor(key));

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ key?: string }> }): Promise<Metadata> {
  const { key } = await searchParams;
  let actor: IntakeActor | null = null;
  try {
    actor = await actorFor(key);
  } catch {
    // 資料庫連不上：頁面本體會顯示錯誤，圖示用本人的就好
  }
  if (!actor || !key) return BASE_METADATA;
  // manifest 每條連結一份（start_url 要帶金鑰）：iPhone 的手機通知要它、Android 加到主畫面也照它（intake/manifest/route.ts）
  const manifest = `/intake/manifest?key=${encodeURIComponent(key)}`;
  return actor.kind === "colleague" ? { ...BASE_METADATA, manifest, icons: { icon: COLLEAGUE_ICON, apple: COLLEAGUE_ICON } } : { ...BASE_METADATA, manifest };
}

export default async function IntakePage({ searchParams }: { searchParams: Promise<{ key?: string; v?: string }> }) {
  const { key, v } = await searchParams;

  let actor: IntakeActor | null = null;
  try {
    actor = await actorFor(key);
  } catch (e) {
    return (
      <div className={styles.page}>
        <div className={styles.invalid}>資料庫暫時連不上，請稍後再開一次。{e instanceof Error ? "" : ""}</div>
      </div>
    );
  }
  if (!actor || !key) {
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
  // 同事才有手機通知；公鑰第一次用到時會自己產生（lib/match/push.ts）。拿不到就給空字串，畫面會說通知服務沒準備好
  let pushPublicKey = "";
  if (actor.kind === "colleague") {
    try {
      pushPublicKey = await getPushPublicKey();
    } catch (e) {
      console.error("[intake] 拿不到推播公鑰:", e);
    }
  }
  return (
    <>
      <IntakeApp
        intakeKey={key}
        meta={meta}
        who={{ colleague: actor.kind === "colleague", name: actor.colleague?.name ?? OWNER.alias, pushPublicKey }}
        // 手機通知點開會帶 ?v=viewings，直接落在「預約」
        initialView={v === "viewings" ? "viewings" : undefined}
      />
      <p style={{ textAlign: "center", fontSize: 11, color: "#8a9aa2", margin: "0 0 16px" }}>
        {actor.colleague ? `${actor.colleague.name}（${OWNER.company}）` : OWNER.name}｜內部工具
      </p>
    </>
  );
}
