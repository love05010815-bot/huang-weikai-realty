/**
 * npm run check:rental-sheet —— 租件圖片排版的排版規則（src/lib/rental-sheet.ts）。
 */
import assert from "node:assert/strict";
import { defaultCats, emptyDraft, layoutTable, printableCats, reviveDraft, MAX_PHOTOS } from "../src/lib/rental-sheet.ts";

let n = 0;
const t = (name, fn) => {
  fn();
  n += 1;
  console.log(`  ✓ ${name}`);
};
const cat = (name, items) => ({ id: name, name, items: items.map(([nm, on], i) => ({ id: `${name}${i}`, name: nm, qty: "1台", on })) });

t("預設品項全部沒勾 → 什麼都不印", () => {
  const cats = defaultCats();
  assert.ok(cats.length >= 8);
  assert.ok(cats.every((c) => c.items.every((i) => i.on === false)));
  assert.deepEqual(layoutTable(cats), { cols: 0, rows: [] });
});

t("只印有勾的；整組沒勾、品項沒名字的不印", () => {
  const out = printableCats([cat("客廳", [["電視", true], ["沙發", false]]), cat("餐廳", [["餐桌", false]]), cat("陽台", [["", true]])]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].items.map((i) => i.name), ["電視"]);
});

t("3 個分類 → 3 欄，短的欄補空格", () => {
  const { cols, rows } = layoutTable([cat("A", [["a1", true], ["a2", true]]), cat("B", [["b1", true]]), cat("C", [["c1", true]])]);
  assert.equal(cols, 3);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.length === 3));
  assert.deepEqual(rows[0].map((c) => c.kind), ["head", "head", "head"]);
  assert.deepEqual(rows[2].map((c) => c.kind), ["item", "empty", "empty"]);
});

t("超過 5 個分類 → 多的接在最短那一欄底下（一樣長取左邊）", () => {
  const cats = [
    cat("客廳", [["1", true], ["2", true], ["3", true]]),
    cat("餐廳", [["1", true], ["2", true]]),
    cat("主臥", [["1", true], ["2", true], ["3", true]]),
    cat("次臥", [["1", true], ["2", true]]),
    cat("陽台", [["1", true]]),
    cat("衛浴", [["1", true]]),
    cat("其他", [["1", true]]),
  ];
  const { cols, rows } = layoutTable(cats);
  assert.equal(cols, 5);
  // 陽台欄最短（2 格）→ 衛浴接在陽台下面；之後最短的是餐廳欄（3 格，最左）→ 其他接在餐廳下面
  assert.deepEqual(rows[2][4], { kind: "head", name: "衛浴" });
  assert.deepEqual(rows[3][1], { kind: "head", name: "其他" });
  const heads = rows.flat().filter((c) => c.kind === "head").length;
  const items = rows.flat().filter((c) => c.kind === "item").length;
  assert.equal(heads, 7);
  assert.equal(items, 13);
});

t("草稿讀回：壞資料補回預設、不炸", () => {
  assert.deepEqual(reviveDraft(null).layout, 6);
  const d = reviveDraft({ layout: 8, fit: "contain", captions: ["a", 3], cats: [{ name: "X", items: [{ name: "y", qty: 2, on: "yes" }, null] }], note: 5 });
  assert.equal(d.layout, 8);
  assert.equal(d.fit, "contain");
  assert.equal(d.captions.length, MAX_PHOTOS);
  assert.deepEqual(d.captions.slice(0, 2), ["a", ""]);
  assert.equal(d.cats.length, 1);
  assert.deepEqual({ ...d.cats[0].items[0], id: "" }, { id: "", name: "y", qty: "", on: false });
  assert.equal(d.note, "");
  assert.equal(reviveDraft({ cats: [] }).cats.length, emptyDraft().cats.length);
});

console.log(`\ncheck:rental-sheet 全部通過（${n} 項）`);
