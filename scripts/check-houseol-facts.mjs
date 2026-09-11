/**
 * 迴歸測試：愛屋型錄頁 → 物件比較表九欄（lib/houseol-facts.ts）＋比較網址規則（lib/map-compare.ts）。
 * 用法：npm run check:houseol
 *
 * ⚠️ 測試 HTML 一律自己編（假社區、假數字），不要貼真實型錄 —— 這個 repo 是公開的。
 *    版面結構照 2026-09-10 實測的型錄頁：每欄 `<div class="t-th">標籤</div>` ＋
 *    `<div class="t-td"><div class="title">標籤</div><p>值</p></div>`，標籤印兩次、值只有一個。
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const { formatAge, formatCompletion, formatFloor, formatLayout, formatParking, formatPing, houseolFieldMap, parseHouseolFacts } =
  await import("../src/lib/houseol-facts.ts");
const { COMPARE_MAX, compareHref, parseCompareIds } = await import("../src/lib/map-compare.ts");

let pass = true;
const ok = (cond, label, got, want) => {
  if (!cond) pass = false;
  console.log(`${cond ? "  ✅" : "  ❌"} ${String(label).padEnd(26)} ${String(got).padEnd(22)}${cond ? "" : "應為 " + want}`);
};
const eq = (label, got, want) => ok(JSON.stringify(got) === JSON.stringify(want), label, JSON.stringify(got), JSON.stringify(want));

/** 照型錄頁的結構組一頁。value 給 null ＝ 那格連 <p> 都沒有；給 "" ＝ 有 <p> 但空的 */
function page(fields, { priceHtml = '<p id="Price" class="red size22">1128萬</p>' } = {}) {
  const rows = Object.entries(fields)
    .map(
      ([label, value]) => `
<div class="t-th">${label}</div>
<div class="t-td">
  <div class="title">${label}</div>
  ${value == null ? "" : `<p${label === "建物面積" ? ' class="blue"' : ""}>${value}</p>`}
</div>`,
    )
    .join("\n");
  return `<!DOCTYPE html><html><head><title>測試</title></head><body>
<div class="TableBox">
<div class="t-tr">
<div class="t-th">委託總價</div>
<div class="t-td"><div class="title">委託總價</div>${priceHtml}</div>
</div>
${rows}
</div>
<div class="TableBox"><div class="t-tr"><div class="t-th mobile">環境特色</div></div></div>
</body></html>`;
}

/* ───── A. 大樓、有車位、成屋（版面照實測，含 &ensp; 與全形空白） ───── */
console.log("A. 大樓、有車位、成屋");
const A = parseHouseolFacts(
  page({
    登記坪數: "44.98 坪",
    "(含車位坪": "10.95坪)",
    建物面積: "34.03 坪",
    "主&ensp;+附屬": "22.8 坪",
    主建物坪: "20.818 坪",
    附屬建物: "1.987 坪",
    公設建坪: "11.23 坪",
    公設比: "33%",
    每坪單價: "25.08萬/坪",
    "樓別/樓高": "6 /15",
    "房/廳/衛": "3/ 2/ 2",
    車位型式: "坡道/平面",
    "車位/編號": "公設車位/B1-15",
    "類型/現況": "大樓 /空屋",
    社區: "測試花園",
    竣工日期: "2025/10/15",
    "屋　　齡": "未滿一年",
  }),
);
eq("price", A.price, 1128);
eq("community", A.community, "測試花園");
eq("floor", A.floor, { level: "6", total: 15 });
eq("regPing", A.regPing, 44.98);
eq("parkPing", A.parkPing, 10.95);
eq("mainPing", A.mainPing, 20.818);
eq("attPing", A.attPing, 1.987);
eq("mainAttPing（型錄印的）", A.mainAttPing, 22.8);
eq("layout", A.layout, { room: 3, hall: 2, bath: 2 });
eq("parking", A.parking, { has: true, type: "坡道/平面" });
eq("publicRatio", A.publicRatio, "33%");
eq("completion", A.completion, "2025/10/15");
eq("age（全形空白標籤）", A.age, "未滿一年");
eq("kind", A.kind, "大樓/空屋");
ok(A.fieldCount >= 17, "fieldCount", A.fieldCount, ">= 17");

/* ───── B. 預售華廈：沒竣工日期、沒屋齡、公設比空的、沒有含車位欄 ───── */
console.log("B. 預售華廈");
const B = parseHouseolFacts(
  page(
    {
      登記坪數: "20.95 坪",
      建物面積: "20.95 坪",
      "主&ensp;+附屬": "20.95 坪",
      主建物坪: "17.678 坪",
      附屬建物: "3.279 坪",
      公設建坪: "0 坪",
      公設比: null,
      "樓別/樓高": "3 /6",
      "房/廳/衛": "3/ 2/ 2",
      車位型式: "坡道/平面",
      "車位/編號": "公設車位/2F-8",
      "類型/現況": "華廈 /預售",
      社區: "測試山丘",
    },
    { priceHtml: '<p id="Price" class="red size22">1250萬</p>' },
  ),
);
eq("price", B.price, 1250);
eq("publicRatio 空 → null", B.publicRatio, null);
eq("completion 沒有 → null", B.completion, null);
eq("age 沒有 → null", B.age, null);
eq("parking（沒含車位欄，看型式）", B.parking, { has: true, type: "坡道/平面" });
eq("formatAge 預售", formatAge(B), "預售（尚未完工）");
// 公設比那格改成「有 <p> 但空的」也一樣是 null，而且不會偷抓到下一格的每坪單價
const B2 = parseHouseolFacts(page({ 公設比: "", 每坪單價: "59.65萬/坪" }));
eq("publicRatio <p></p> → null", B2.publicRatio, null);

/* ───── C. 沒車位：車位型式「無」、含車位面積 0 ───── */
console.log("C. 沒車位");
const C = parseHouseolFacts(
  page({
    登記坪數: "22.43 坪",
    "(含車位面積": "0坪)",
    主建物坪: "13.763 坪",
    附屬建物: "1.191 坪",
    公設比: "33.4%",
    "樓別/樓高": "9 /28",
    "房/廳/衛": "2/ 2/ 1",
    車位型式: "無",
    "車位/編號": "無/",
    公設車位: "0 坪",
    竣工日期: "2025/6/6",
    "屋　　齡": "1.3 年",
  }),
);
eq("parking 無", C.parking, { has: false, type: "" });
eq("parkPing 0", C.parkPing, 0);
eq("publicRatio 小數", C.publicRatio, "33.4%");
eq("mainAttPing（型錄沒印就相加）", C.mainAttPing, 14.95);
eq("age", C.age, "1.3 年");
eq("formatCompletion 沒補零的日期", formatCompletion(C.completion), "2025 年 6 月完工");
// 只有含車位面積、沒有車位型式 → 看數字
const C2 = parseHouseolFacts(page({ "(含車位面積": "0坪)" }));
eq("parking 只看含車位 0", C2.parking, { has: false, type: "" });
const C3 = parseHouseolFacts(page({ "(含車位面積": "8.5坪)" }));
eq("parking 只看含車位 8.5", C3.parking, { has: true, type: "" });

/* ───── D. 透天的樓別寫法 ───── */
console.log("D. 透天");
const D = parseHouseolFacts(page({ "樓別/樓高": "全棟/4", "房/廳/衛": "4/ 2/ 4" }));
eq("floor 全棟", D.floor, { level: "全棟", total: 4 });
eq("formatFloor 全棟", formatFloor(D.floor), "全棟／4F");
eq("formatFloor 1-2", formatFloor({ level: "1-2", total: 2 }), "1-2F／2F");
eq("formatFloor 6/15", formatFloor(A.floor), "6F／15F");
const D2 = parseHouseolFacts(page({ "樓別/樓高": "看不懂的寫法" }));
eq("floorRaw 留原文", D2.floorRaw, "看不懂的寫法");
eq("floor 拆不開 → null", D2.floor, null);

/* ───── E. 認不得的頁面：什麼都 null、fieldCount 0，不會丟例外 ───── */
console.log("E. 認不得的頁面");
const E = parseHouseolFacts("<html><body><h1>hello</h1><p>1128萬</p></body></html>");
eq("fieldCount", E.fieldCount, 0);
eq("price 沒錨點 → null", E.price, null);
eq("parking", E.parking, null);
eq("layout", E.layout, null);
eq("空字串", parseHouseolFacts("").fieldCount, 0);

/* ───── F. 標籤只認第一次；值裡有標籤也不會串到下一格 ───── */
console.log("F. 標籤/值配對");
const F = houseolFieldMap(page({ 社區: "甲社區", "類型/現況": "大樓 /空屋" }) + page({ 社區: "乙社區" }));
eq("同標籤只認第一次", F.get("社區"), "甲社區");
eq("委託總價值", F.get("委託總價"), "1128萬");
eq("類型/現況", F.get("類型/現況"), "大樓 /空屋");

/* ───── G. 顯示用 ───── */
console.log("G. 顯示用");
const now = new Date(Date.UTC(2026, 8, 10)); // 2026-09-10
eq("formatAge 型錄有印就用它", formatAge({ age: "1.3 年", completion: "2025/6/6", kind: null }, now), "1.3 年");
eq("formatAge 算：3.5 年", formatAge({ age: null, completion: "2023/3/1", kind: null }, now), "3.5 年");
eq("formatAge 算：未滿 1 年", formatAge({ age: null, completion: "2026/1/1", kind: null }, now), "未滿 1 年");
eq("formatAge 算：還沒完工", formatAge({ age: null, completion: "2027/1/1", kind: null }, now), "尚未完工");
eq("formatAge 什麼都沒有", formatAge({ age: null, completion: null, kind: "大樓/空屋" }, now), null);
eq("formatPing 20.818", formatPing(20.818), "20.82 坪");
eq("formatPing 22.8", formatPing(22.8), "22.8 坪");
eq("formatPing null", formatPing(null), null);
eq("formatLayout", formatLayout({ room: 3, hall: 2, bath: 2 }), "3房2廳2衛");
eq("formatParking 有", formatParking({ has: true, type: "坡道/平面" }), "有（坡道/平面）");
eq("formatParking 有（不知型式）", formatParking({ has: true, type: "" }), "有");
eq("formatParking 無", formatParking({ has: false, type: "" }), "無");
eq("formatParking null", formatParking(null), null);

/* ───── H. 比較網址 ───── */
console.log("H. 比較網址");
const u = (n) => `0000000${n}-0000-4000-8000-000000000000`;
eq("亂打的丟掉", parseCompareIds("abc,../etc,1"), []);
eq("去重＋小寫", parseCompareIds(`${u(1).toUpperCase()},${u(1)},${u(2)}`), [u(1), u(2)]);
eq("最多 COMPARE_MAX", parseCompareIds([u(1), u(2), u(3), u(4), u(5)]).length, COMPARE_MAX);
eq("undefined", parseCompareIds(undefined), []);
eq("compareHref", compareHref([u(1), u(2)]), `/map/compare?ids=${u(1)},${u(2)}`);

console.log(pass ? "\n全部通過" : "\n有失敗");
process.exit(pass ? 0 : 1);
