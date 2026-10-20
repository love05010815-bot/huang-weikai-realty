/**
 * 迴歸測試：我的最愛／瀏覽足跡的純規則（src/lib/favorites.ts）。
 * 用法：npm run check:favorites
 *
 * 測的是「客戶瀏覽器裡那份清單」的整理規則：壞資料要丟、重複要合、上限要砍、
 * 收藏鈕按一下是加還是減。這些壞掉都不會報錯，只會讓收藏頁默默少東西或多東西。
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const F = await import("../src/lib/favorites.ts");

let pass = true;
const ok = (cond, label, got) => {
  if (!cond) pass = false;
  console.log(`${cond ? "  ✅" : "  ❌"} ${String(label).padEnd(40)} ${got === undefined ? "" : String(got)}`);
};

const proj = (key, at = 1) => ({ kind: "project", key, title: "建案" + key, sub: "建商・梧棲區", at });
const lst = (key, at = 1) => ({ kind: "listing", key, title: "物件" + key, sub: "沙鹿區", at });

console.log("=== A sanitizeItem：不可信輸入 ===");
ok(F.sanitizeItem(null) === null, "null → null");
ok(F.sanitizeItem("x") === null, "字串 → null");
ok(F.sanitizeItem({ kind: "video", key: "a" }) === null, "不認識的 kind → null");
ok(F.sanitizeItem({ kind: "project", key: "" }) === null, "空 key → null");
ok(F.sanitizeItem({ kind: "project", key: "a b" }) === null, "key 帶空白 → null");
ok(F.sanitizeItem({ kind: "listing", key: "Shalu_01" }) === null, "listing slug 不准底線與大寫 → null");
ok(F.sanitizeItem({ kind: "listing", key: "SHALU-01" }) === null, "listing slug 大寫 → null（存的時候就該是小寫）");
{
  const r = F.sanitizeItem({ kind: "project", key: "changhong-tianqing", title: " 長虹天擎 ", sub: "長虹建設・梧棲區", at: 123.9 });
  ok(r && r.title === "長虹天擎" && r.at === 123, "正常的一筆：title trim、at 取整", JSON.stringify(r));
}
{
  const r = F.sanitizeItem({ kind: "project", key: "x", title: 42, sub: null, at: "昨天" });
  ok(r && r.title === "" && r.sub === "" && r.at === 0, "title/sub 不是字串 → 空；at 壞掉 → 0", JSON.stringify(r));
}
{
  const long = "🏠".repeat(200);
  const r = F.sanitizeItem({ kind: "project", key: "x", title: long, sub: "", at: 1 });
  const chars = Array.from(r.title);
  ok(chars.length === 120 && chars.every((c) => c === "🏠"), "標題超長照「字元」截、emoji 不切半", chars.length);
}

console.log("=== B parseSaved：整份清單 ===");
ok(F.parseSaved(null, 10).length === 0, "不是陣列 → 空");
ok(F.parseSaved("[]", 10).length === 0, "字串（還沒 JSON.parse）→ 空");
{
  const r = F.parseSaved([proj("a", 3), "垃圾", proj("a", 2), lst("b"), { kind: "listing", key: "B" }], 10);
  ok(r.length === 2 && r[0].key === "a" && r[0].at === 3 && r[1].key === "b", "壞的丟、重複留第一筆（＝最新）", r.map((x) => x.key).join(","));
}
{
  const many = Array.from({ length: 150 }, (_, i) => proj("p" + i));
  ok(F.parseSaved(many, F.FAV_MAX).length === F.FAV_MAX, `超過上限砍到 ${F.FAV_MAX}`);
}

console.log("=== C pushTop／removeSaved ===");
{
  const list = [proj("a"), proj("b"), lst("c")];
  const r = F.pushTop(list, lst("c", 9), 10);
  ok(r.length === 3 && r[0].key === "c" && r[0].at === 9, "已經在清單裡 → 移到最上面、時間更新", r.map((x) => x.key).join(","));
  ok(list.length === 3 && list[0].key === "a", "原陣列沒被改");
  const r2 = F.pushTop(list, proj("d"), 3);
  ok(r2.length === 3 && r2[0].key === "d" && r2[2].key === "b", "塞滿了就砍最舊的那筆", r2.map((x) => x.key).join(","));
  const r3 = F.pushTop(list, proj("c"), 10);
  ok(r3.length === 4, "同 key 不同 kind 是兩件事（建案 c ≠ 物件 c）", r3.length);
  ok(F.removeSaved(list, "project", "a").length === 2, "removeSaved 拿掉一筆");
  ok(F.removeSaved(list, "listing", "a").length === 3, "kind 對不上就不動");
}

console.log("=== D toggleSaved：收藏鈕 ===");
{
  const r1 = F.toggleSaved([], proj("a"), 10, 777);
  ok(r1.added === true && r1.list.length === 1 && r1.list[0].at === 777, "空清單按一下 → 加入、時間用傳進來的");
  const r2 = F.toggleSaved(r1.list, proj("a"), 10);
  ok(r2.added === false && r2.list.length === 0, "再按一下 → 移除");
  const full = Array.from({ length: 3 }, (_, i) => proj("p" + i));
  const r3 = F.toggleSaved(full, proj("new"), 3);
  ok(r3.added === true && r3.list.length === 3 && r3.list[0].key === "new" && !r3.list.some((x) => x.key === "p2"), "滿了再加 → 最舊的被擠掉");
}

console.log("=== E parseKeyList：網址參數 ===");
{
  // 逗號或空白都當分隔（跟 /map/compare 的 parseCompareIds 一樣寬鬆），所以「x y」是兩個 key
  const r = F.parseKeyList("changhong-tianqing, jiatai-zhuoyue ,changhong-tianqing,../etc,x y", "project", 10);
  ok(
    r.length === 4 && r[0] === "changhong-tianqing" && r[1] === "jiatai-zhuoyue" && r[2] === "x" && r[3] === "y",
    "去重、丟掉亂打的（../etc）、空白也是分隔",
    r.join(","),
  );
  const l = F.parseKeyList("Shalu-01,shalu-01,UNDER_SCORE", "listing", 10);
  ok(l.length === 1 && l[0] === "shalu-01", "listing 轉小寫後去重、底線的丟掉", l.join(","));
  ok(F.parseKeyList(null, "project", 10).length === 0, "null → 空");
  ok(F.parseKeyList("a,b,c,d", "project", 2).length === 2, "最多 max 個");
}

console.log("=== F favoritesApiHref ===");
ok(F.favoritesApiHref([]) === null, "沒有東西 → null（不用打 API）");
{
  const h = F.favoritesApiHref([proj("a"), lst("b"), proj("a"), lst("c")]);
  ok(h === "/api/favorites?p=a&l=b%2Cc", "建案與物件分開、去重", h);
  ok(F.favoritesApiHref([proj("a")]) === "/api/favorites?p=a", "只有建案就沒有 l 參數");
}

console.log("=== G 精選好案比較：favoritesCompareHref／parseCompareSlugs／splitListingArea ===");
{
  const MC = await import("../src/lib/map-compare.ts");
  ok(F.favoritesCompareHref(["a-1", "b-2"]) === "/favorites/compare?l=a-1,b-2", "比較頁網址", F.favoritesCompareHref(["a-1", "b-2"]));
  const r = F.parseCompareSlugs("Shalu-01, wuqi-02,shalu-01,../etc,UNDER_SCORE");
  ok(r.length === 2 && r[0] === "shalu-01" && r[1] === "wuqi-02", "轉小寫、去重、丟掉亂打的", r.join(","));
  const arr = F.parseCompareSlugs(["a-1", "b-2"]);
  ok(arr.join(",") === "a-1,b-2", "重複的 ?l=a&l=b（陣列）也認", arr.join(","));
  ok(F.parseCompareSlugs(null).length === 0, "null → 空");
  ok(F.parseCompareSlugs(undefined).length === 0, "undefined → 空");
  const many = Array.from({ length: 10 }, (_, i) => "s-" + i).join(",");
  ok(F.parseCompareSlugs(many).length === MC.COMPARE_MAX, `最多 COMPARE_MAX（${MC.COMPARE_MAX}）件`, F.parseCompareSlugs(many).length);
  const a1 = F.splitListingArea("梧棲區・隱玉2");
  ok(a1.district === "梧棲區" && a1.name === "隱玉2", "「行政區・建案名」拆開", JSON.stringify(a1));
  const a2 = F.splitListingArea("聯悅聚 / 清水區");
  ok(a2.district === "清水區" && a2.name === "聯悅聚", "順序反過來、用斜線也認", JSON.stringify(a2));
  const a3 = F.splitListingArea("沙鹿區・台中港市鎮中心・德光四季");
  ok(a3.district === "沙鹿區" && a3.name === "台中港市鎮中心・德光四季", "三段：行政區拿掉、其餘併成建案名", JSON.stringify(a3));
  const a4 = F.splitListingArea("隱玉2");
  ok(a4.district === null && a4.name === "隱玉2", "沒分隔 → 整段當建案名", JSON.stringify(a4));
  const a5 = F.splitListingArea("梧棲區");
  ok(a5.district === "梧棲區" && a5.name === "", "只有行政區 → 建案名空（畫面退回型錄的社區）", JSON.stringify(a5));
  const a6 = F.splitListingArea("");
  ok(a6.district === null && a6.name === "", "空字串", JSON.stringify(a6));
  // 線上真的有這筆：後台只打「梧棲」沒打「區」
  const a7 = F.splitListingArea("梧棲・和築好好窩");
  ok(a7.district === "梧棲區" && a7.name === "和築好好窩", "區名沒帶「區」也認，顯示時補成「梧棲區」", JSON.stringify(a7));
  const a8 = F.splitListingArea("太平洋・隱玉");
  ok(a8.district === null && a8.name === "太平洋・隱玉", "「太平洋」不是「太平」區（整段比對，不是前綴）", JSON.stringify(a8));
  const a9 = F.splitListingArea("北・某某建案");
  ok(a9.district === null && a9.name === "北・某某建案", "單字「北」不帶「區」不當行政區", JSON.stringify(a9));
  const a10 = F.splitListingArea("北區・某某建案");
  ok(a10.district === "北區" && a10.name === "某某建案", "「北區」帶「區」就認", JSON.stringify(a10));
}

console.log(pass ? "\n✅ 全部通過" : "\n❌ 有失敗");
process.exit(pass ? 0 : 1);
