/**
 * 📋 太平洋分享連結 → `/map/compare` 要的九個欄位（跟愛屋型錄同一個 `HouseolFacts` 形狀）
 *
 * 分享 API 給的：總價、登記坪、格局、完工日（見 lib/prim-share.ts）。
 * 樓層／車位／型態／屋齡的現成數字：拿 S 編號去 `match_listing` 查（官網 API 每 30 分鐘同步進來的那張表）。
 * 公設比、主＋附屬、含車位坪：兩邊都沒有 → null，畫面顯示「型錄未載」—— **不要用猜的補**。
 *
 * ⚠️ 伺服器專用（碰資料庫）。client component 要的型別與格式化工具在 lib/houseol-facts.ts，
 *    純規則（`primFactsFrom`）在 lib/prim-share.ts，這支只負責「抓＋查」。
 */
import type { HouseolFacts } from "@/lib/houseol-facts";
import { getListing } from "@/lib/match/store";
import { fetchPrimShare, primFactsFrom, primShareCode } from "@/lib/prim-share";

/**
 * 這顆「物件介紹」連結（太平洋分享連結）對應的九個欄位。
 * 不是分享連結、API 讀不到、或一條分享包好幾筆（不知道是哪一間）→ null，畫面整欄「—」；**永遠不 throw**。
 */
export async function fetchPrimFacts(href: string): Promise<HouseolFacts | null> {
  const code = primShareCode(href);
  if (!code) return null;
  const got = await fetchPrimShare(code, { revalidate: 3600, timeoutMs: 6000 });
  if (!got.ok || got.share.items.length !== 1) return null;
  const item = got.share.items[0];
  let m = null;
  try {
    m = await getListing(item.objNo);
  } catch {
    // 官網同步表讀不到就只用分享 API 的欄位，樓層／車位那幾格會是「型錄未載」
    m = null;
  }
  return primFactsFrom(item, m);
}
