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

console.log(pass ? "\n✅ 全部通過" : "\n❌ 有失敗");
process.exit(pass ? 0 : 1);
