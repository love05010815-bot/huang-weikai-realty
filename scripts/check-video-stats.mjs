/**
 * 影片觀看數排行（/admin/inbox/videos）的迴歸測試。
 *
 *   npm run check:video-stats
 *
 * 驗的是 lib/video-stats-types.ts 裡不碰網路、不碰資料庫的純函式：
 *   ・titleKey     —— 各平台的標題／內文開頭取出來的比對鍵
 *   ・groupVideos  —— 同一支影片在各平台的那幾筆併成一列、觀看數加總、排名
 *   ・withinDays   —— 只留最近 N 天發佈的
 *
 * 為什麼要測：併錯是靜默的 —— 兩支不相干的影片被併在一起，排行第一名的數字就是假的；
 * 拿不到觀看數的平台（views=null）被當成 0 加進去，也不會報錯。
 *
 * ⚠️ 假資料的寫法照他真實的發片格式（同一句開頭、YouTube 接 #標籤、FB／IG 接內文），內容自己編。
 */
import assert from "node:assert/strict";
import { titleKey, groupVideos, withinDays, displayTitle } from "../src/lib/video-stats-types.ts";

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};

const v = (platform, id, title, publishedAt, views, extra = {}) => ({
  platform, id, title, publishedAt, permalink: null, views, likes: null, comments: null, ...extra,
});

console.log("titleKey");
ok("YouTube 標題（後面接 #標籤）與 FB 內文（後面換行接內文）取到同一個鍵", () => {
  const yt = titleKey("⚠️ 毒駕新制上路這3種人注意！ #毒駕 #新制");
  const fb = titleKey("⚠️ 毒駕新制上路這3種人注意！\n🚨重大消息！明年起…");
  assert.equal(yt, "毒駕新制上路這3種人");
  assert.equal(fb, yt);
});
ok("表情符號、標點、空白不影響", () => {
  assert.equal(titleKey("🏠 明明住一戶，房屋稅卻算兩戶？"), titleKey("明明住一戶 房屋稅卻算兩戶"));
});
ok("前面有空行也取得到第一個有字的行", () => {
  assert.equal(titleKey("\n\n老了最怕的其實是這件事"), "老了最怕的其實是這件事".slice(0, 10));
});
ok("不到 4 個字回 null（太短會亂併）", () => {
  assert.equal(titleKey("🏠 開箱"), null);
  assert.equal(titleKey(""), null);
  assert.equal(titleKey("#房仲 #台中"), null); // 通用標籤湊出來只有 4 個字，不夠
});
ok("整句都是 #標籤 的舊影片：退一步用整行（拿掉 #）當鍵，6 個字以上才算", () => {
  assert.equal(titleKey("#沙鹿大樓價買翻修美透天"), "沙鹿大樓價買翻修美透");
  assert.equal(titleKey("#清水 #微風一品3 #買房賣房"), "清水微風一品3買房賣");
  assert.equal(titleKey("#清水 #微風一品3 #買房賣房"), titleKey("#清水 #微風一品3 #買房賣房 #房產找瑋凱"));
});
ok("displayTitle 只留第一行、# 之前，過長截斷", () => {
  assert.equal(displayTitle("容積率越高房子分越多？ #都更\n第二行"), "容積率越高房子分越多？");
  assert.equal(Array.from(displayTitle("一二三四五六七八九十", 5)).length, 6); // 5 字＋…
  assert.equal(displayTitle(""), "（沒有標題）");
});

console.log("groupVideos");
const A = "⚠️ 毒駕新制上路這3種人注意！";
const B = "🏠 明明住一戶房屋稅卻算兩戶？";
ok("同一支影片四個平台併成一列，觀看數加總", () => {
  const g = groupVideos([
    v("youtube", "y1", `${A} #毒駕`, "2026-11-19T04:25:16Z", 77),
    v("facebook", "f1", `${A}\n🚨重大消息`, "2026-11-19T04:23:55+0000", 198),
    v("instagram", "i1", `${A}\n🚨重大消息`, "2026-11-19T04:24:41+0000", null),
    v("threads", "t1", A, "2026-11-19T05:00:00+0000", null),
  ]);
  assert.equal(g.length, 1);
  assert.equal(g[0].items.length, 4);
  assert.equal(g[0].totalViews, 275);
  assert.equal(g[0].countedPlatforms, 2); // IG、Threads 拿不到（null）不算，也不當成 0
});
ok("全部平台都拿不到觀看數：countedPlatforms=0（畫面顯示「—」不是 0）", () => {
  const g = groupVideos([v("instagram", "i1", A, "2026-11-19T04:24:41Z", null)]);
  assert.equal(g[0].countedPlatforms, 0);
});
ok("依加總觀看數由高到低排", () => {
  const g = groupVideos([
    v("youtube", "y1", A, "2026-11-19T04:00:00Z", 77),
    v("youtube", "y2", `${B} #打通`, "2026-11-18T05:00:00Z", 540),
    v("facebook", "f2", B, "2026-11-18T04:22:31Z", 339),
    v("facebook", "f1", A, "2026-11-19T04:23:55Z", 198),
  ]);
  assert.deepEqual(g.map((x) => x.totalViews), [879, 275]);
});
ok("同一句開頭但隔了一個月：不併（重發的舊題材是兩支）", () => {
  const g = groupVideos([
    v("youtube", "y1", A, "2026-10-01T04:00:00Z", 100),
    v("facebook", "f1", A, "2026-11-19T04:00:00Z", 200),
  ]);
  assert.equal(g.length, 2);
});
ok("同平台同一句開頭三天內發兩支：不硬併成一支", () => {
  const g = groupVideos([
    v("youtube", "y1", A, "2026-11-18T04:00:00Z", 100),
    v("youtube", "y2", A, "2026-11-19T04:00:00Z", 50),
    v("facebook", "f1", A, "2026-11-18T04:10:00Z", 30),
  ]);
  assert.equal(g.length, 2);
  assert.equal(g[0].totalViews, 130); // y1＋f1（先發的那支收走 FB）
  assert.equal(g[1].totalViews, 50);
});
ok("標題太短（鍵是 null）的各自一列，不會全部併成一坨", () => {
  const g = groupVideos([
    v("youtube", "y1", "開箱", "2026-11-19T04:00:00Z", 10),
    v("facebook", "f1", "開箱", "2026-11-19T04:00:00Z", 20),
  ]);
  assert.equal(g.length, 2);
});
ok("windowDays=0（單一平台的排行）一支一列", () => {
  const g = groupVideos(
    [v("youtube", "y1", A, "2026-11-19T04:00:00Z", 10), v("youtube", "y2", A, "2026-11-19T04:00:00Z", 20)],
    0,
  );
  assert.equal(g.length, 2);
});

console.log("withinDays");
ok("只留最近 N 天；null 不濾", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");
  const list = [v("youtube", "a", A, "2026-11-10T00:00:00Z", 1), v("youtube", "b", B, "2026-09-01T00:00:00Z", 1)];
  assert.equal(withinDays(list, 30, now).length, 1);
  assert.equal(withinDays(list, 90, now).length, 2);
  assert.equal(withinDays(list, null, now).length, 2);
});

console.log(`\n✅ check:video-stats 全過（${n} 項）`);
