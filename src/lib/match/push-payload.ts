/**
 * 推到同事手機的通知內容 —— 純函式，沒有副作用，scripts/check-match.mjs 測得到。
 *
 * 2026-10-05 他拍板：同事客人的預約通知**改走手機通知（Web Push）、不綁本人的官方 LINE**。
 * Web Push 的內容是加密後直接送到那支手機（Apple／Google 的推播服務看不到、本人也看不到），
 * 所以這裡可以放客人姓名、物件、時間 —— 跟之前走官方帳號時「只敢放編號」的理由相反。
 * 發送本體在 push.ts（要資料庫、要 web-push 套件）。
 */
export type ColleaguePush = {
  title: string;
  body: string;
  /** 點通知要開的頁面（同事自己的建檔頁「預約」） */
  url: string;
  /** 同一筆預約重送時手機只留一則 */
  tag: string;
};

type ViewingLike = { code: string; name: string; preferredAt: string };
type ListingLike = { title: string };

/** 「新預約看屋 BK-XXXXXX」／「陳小姐｜幸福成兩房低價 等 2 間｜10/6 上午」 */
export function colleagueViewingPush(viewing: ViewingLike, listings: ListingLike[], url: string): ColleaguePush {
  const first = listings[0];
  const what = first ? `${first.title}${listings.length > 1 ? ` 等 ${listings.length} 間` : ""}` : "物件";
  return {
    title: `新預約看屋 ${viewing.code}`,
    body: `${viewing.name}｜${what}｜${viewing.preferredAt || "時間待安排"}`,
    url,
    tag: `viewing-${viewing.code}`,
  };
}

/** 同事按「傳一則測試通知」時送的 */
export function testPush(url: string): ColleaguePush {
  return {
    title: "買方建檔 測試通知",
    body: "手機通知開好了，之後有新預約會像這樣跳出來。",
    url,
    tag: "test",
  };
}
