/**
 * 建案 ↔ 太平洋在售物件的對照規則（src/lib/project-inventory.ts）回歸測試。
 *
 *   npm run check:inventory
 *
 * ⚠️ **不連網、不碰資料庫**。建案與座標是這裡自己造的小集合，物件也是；測的是「規則有沒有被改壞」。
 * 真實資料的對照率要看：node --experimental-strip-types --env-file=.env.local 自己寫一支載 lib/project-inventory-data.ts。
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const I = await import("@/lib/project-inventory.ts");

let pass = 0;
const fails = [];
function eq(name, got, want) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) pass++;
  else fails.push(`❌ ${name}\n     got  ${a}\n     want ${b}`);
}

// ── 假的建案總表（座標故意排成會撞的樣子）
const P = [
  { id: "lianyue-zhen", name: "聯悅臻", aliases: ["聯悦臻"] },
  { id: "lianyue-zhenpin", name: "聯悅臻品" },
  { id: "farglory-star5", name: "遠雄之星5" },
  { id: "farglory-star6", name: "遠雄之星6" },
  { id: "weifeng-yipin", name: "微風一品" },
  { id: "weifeng-yipin-2", name: "微風一品2" },
  { id: "yang-tiane", name: "漾天鵝" },
  { id: "sakura", name: "櫻花市鎮之櫻", alias: "市鎮之櫻" },
  { id: "jinpai", name: "金牌" },
  { id: "lone", name: "孤獨大樓" },
  { id: "nopin", name: "佳鏵樹璽" },
];
const C = {
  "lianyue-zhen": { lat: 24.2657, lng: 120.5306 },
  "lianyue-zhenpin": { lat: 24.2700, lng: 120.5400 },
  "farglory-star5": { lat: 24.2600, lng: 120.5500 },
  "farglory-star6": { lat: 24.26015, lng: 120.5500 }, // 離 star5 約 17 公尺（緊鄰）
  "weifeng-yipin": { lat: 24.2800, lng: 120.5600 },
  "weifeng-yipin-2": { lat: 24.2900, lng: 120.5700 },
  "yang-tiane": { lat: 24.3000, lng: 120.5800 },
  sakura: { lat: 24.3100, lng: 120.5900 },
  jinpai: { lat: 24.3200, lng: 120.6000 },
  lone: { lat: 24.3300, lng: 120.6100 },
};
const idx = I.buildInventoryIndex(P, C);

const src = (over) => ({
  id: "S1",
  title: "",
  type: "電梯大樓",
  district: "梧棲區",
  price: 1000,
  size: 30,
  rooms: 2,
  halls: 2,
  baths: 1,
  floor: "10/15",
  age: 3,
  images: ["https://hq.houseol.com.tw/x.jpg"],
  lat: null,
  lng: null,
  ...over,
});
const attr = (over) => I.attributeListing(idx, src(over));

console.log("=== 正規化 ===");
eq("悦→悅、去空白、全形數字", I.normalizeName("聯悦 臻 ２"), "聯悅臻2");
eq("間隔號與斜線拿掉", I.normalizeName("人文澄舍3｜捷運藍線B3站"), "人文澄舍3捷運藍線b3站");
eq("標題版把分隔符留成 |", I.normalizeTitle("【獨家】人文澄舍3｜捷運 B3站"), "|獨家|人文澄舍3|捷運b3站");
eq("括號裡的案名也對得到", attr({ title: "【聯悦臻】高樓兩房平車" }), { projectId: "lianyue-zhen", how: "title" });
eq("中文數字變體", I.nameVariants("遠雄之星5"), ["遠雄之星5", "遠雄之星五"]);
eq("沒序號就一個", I.nameVariants("聯悅臻"), ["聯悅臻"]);
eq("序號 11 以上不做中文變體", I.nameVariants("帝堡18"), ["帝堡18"]);

console.log("=== ① 標題 ===");
eq("標題開頭就是案名", attr({ title: "聯悦臻2房平車高樓海景戶" }), { projectId: "lianyue-zhen", how: "title" });
eq("長的案名先贏（聯悅臻品 不是 聯悅臻）", attr({ title: "聯悅臻品高樓三房" }), { projectId: "lianyue-zhenpin", how: "title" });
eq("案名在中間也認", attr({ title: "屋主急售市鎮之櫻邊間三房" }), { projectId: "sakura", how: "title" });
eq("alias 也認（市鎮之櫻→櫻花市鎮之櫻）", attr({ title: "市鎮之櫻次頂樓三房平車" }), { projectId: "sakura", how: "title" });
eq("中文數字：遠雄之星五 → 遠雄之星5", attr({ title: "遠雄之星五2房平車" }), { projectId: "farglory-star5", how: "title" });
eq("「微風一品2房」的 2 是格局，掛微風一品不是微風一品2", attr({ title: "微風一品2房平車" }), { projectId: "weifeng-yipin", how: "title" });
eq("「微風一品2 三房」才是微風一品2", attr({ title: "微風一品2三房平車" }), { projectId: "weifeng-yipin-2", how: "title" });
eq("兩個字的案名只認開頭（金牌）", attr({ title: "金牌社區三房" }), { projectId: "jinpai", how: "title" });
eq("兩個字的案名在中間不認", attr({ title: "海線金牌美三房" }), null);
eq("沒座標的建案（佳鏵樹璽）標題照認", attr({ title: "佳鏵樹璽4房別墅", type: "透天厝" }), { projectId: "nopin", how: "title" });

console.log("=== ① 的誤判保險 ===");
eq("「花漾天鵝」被「漾天鵝」吃到、又離 1.6 公里 → 不認", attr({ title: "花漾天鵝高樓層四改三房", lat: 24.3, lng: 120.596 }), null);
eq("同樣的字、但座標就在旁邊 → 認", attr({ title: "花漾天鵝高樓層四改三房", lat: 24.3001, lng: 120.5800 }), { projectId: "yang-tiane", how: "title" });
eq("案名在開頭、離很遠也照認（座標錯不是案名錯）", attr({ title: "聯悦臻邊間海景", lat: 24.33, lng: 120.61 }), { projectId: "lianyue-zhen", how: "title" });
eq("前一個字不是中文（｜）、離很遠也照認", attr({ title: "獨家｜漾天鵝三房", lat: 24.33, lng: 120.61 }), { projectId: "yang-tiane", how: "title" });

console.log("=== ② 座標 ===");
eq("20 公尺內、第二近 1 公里 → 認", attr({ title: "重劃區百萬裝潢3房平車", lat: 24.33015, lng: 120.61 }), { projectId: "lone", how: "near" });
eq("40 公尺就不認", attr({ title: "重劃區百萬裝潢3房平車", lat: 24.33036, lng: 120.61 }), null);
eq("兩棟緊鄰（17 公尺）→ 不認，寧可不掛", attr({ title: "次頂海景大3房平車", lat: 24.26003, lng: 120.55 }), null);
eq("土地不拿座標對", attr({ title: "方正建地", type: "土地", lat: 24.33015, lng: 120.61 }), null);
eq("廠房不拿座標對", attr({ title: "合法廠房", type: "廠房", lat: 24.33015, lng: 120.61 }), null);
eq("透天會拿座標對", attr({ title: "邊間美透天", type: "透天厝", lat: 24.33015, lng: 120.61 }), { projectId: "lone", how: "near" });
eq("店面會拿座標對", attr({ title: "黃金店面", type: "店面", lat: 24.33015, lng: 120.61 }), { projectId: "lone", how: "near" });
eq("沒座標、標題又沒案名 → null", attr({ title: "重劃區百萬裝潢3房平車" }), null);

console.log("=== 排除 ===");
eq("出租不掛", attr({ title: "租-聯悦臻3房平車傢俱電全配" }), null);
eq("土地就算標題有案名也不掛", attr({ title: "聯悅臻旁方正建地", type: "土地" }), null);

console.log("=== 整份 ===");
const sources = [
  src({ id: "S10", title: "聯悦臻2房平車", price: 1098 }),
  src({ id: "S11", title: "聯悦臻3房平車", price: 898 }),
  src({ id: "S12", title: "聯悦臻邊間海景視野兩房平車", price: 1038 }),
  src({ id: "s13", title: "聯悦臻無價格", price: 0 }),
  src({ id: "S14", title: "聯悦臻同價大坪", price: 898, size: 40 }),
  src({ id: "S20", title: "遠雄之星五2房平車", price: 700 }),
  src({ id: "S30", title: "方正農地", type: "土地" }),
];
const map = I.buildProjectInventory(
  idx,
  [
    ...sources,
    src({ id: "S40", title: "高樓景觀2房平車", price: 1500 }), // 標題沒案名、沒座標 → 只有後台知道它是誰
    src({ id: "S41", title: "次頂視野朝南2房平車", price: 1600, lat: 24.33015, lng: 120.61 }), // 座標說 lone，但後台說 sakura
    src({ id: "S42", title: "邊間海景視野兩房平車", price: 1700 }), // 用標題對回後台指定
  ],
  {
    // 他在後台指定的：S40／S41 → 櫻花市鎮之櫻；S10 標題明寫聯悦臻、他卻掛成 sakura（點錯）→ 聽官網標題
    overrides: new Map([
      ["S40", "sakura"],
      ["S41", "sakura"],
      ["S10", "sakura"],
    ]),
    titleOverrides: new Map([[I.normalizeName("邊間海景視野兩房平車"), "farglory-star5"]]),
  },
);
eq("三個建案有東西", Object.keys(map).sort(), ["farglory-star5", "lianyue-zhen", "sakura"]);
eq("S40（沒線索）、S41（座標說別棟）都聽後台的", map["sakura"].map((x) => [x.id, x.how]), [["S40", "owner"], ["S41", "owner"]]);
eq("S42 用標題對回後台的指定", map["farglory-star5"].map((x) => [x.id, x.how]), [["S20", "title"], ["S42", "owner"]]);
eq("S10 官網標題明寫聯悦臻 → 以官網為主，不聽後台", map["lianyue-zhen"].find((x) => x.id === "S10")?.how, "title");
eq("聯悅臻五戶：便宜的排前面、同價坪數大的先、沒價格墊底", map["lianyue-zhen"].map((x) => x.price), [898, 898, 1038, 1098, null]);
eq("小寫 s13 進來變大寫", map["lianyue-zhen"][4].id, "S13");
eq("inventoryCount", I.inventoryCount(map, "lianyue-zhen"), 5);
eq("沒有的建案 0", I.inventoryCount(map, "jinpai"), 0);
eq("同一個 S 編號出現兩次只進一次", Object.values(I.buildProjectInventory(idx, [sources[1], sources[1]])).flat().length, 1);
eq("後台指定優先於土地不掛的規則", I.attributeListing(idx, src({ id: "S99", title: "方正建地", type: "土地" }), { overrides: new Map([["S99", "lone"]]) }), { projectId: "lone", how: "owner" });
eq("土地就算標題有案名也不用標題（但後台指定照聽）", I.attributeListing(idx, src({ id: "S97", title: "聯悦臻旁建地", type: "土地" }), { overrides: new Map([["S97", "lone"]]) }), { projectId: "lone", how: "owner" });
eq("出租就算後台指定也不掛", I.attributeListing(idx, src({ id: "S98", title: "租-聯悦臻3房" }), { overrides: new Map([["S98", "lone"]]) }), null);

console.log("=== 顯示 ===");
const it = I.toInventoryItem(src({ price: 1038.4, size: 39.13, rooms: 2, halls: 2, baths: 1, floor: "12/15", type: "電梯大樓", age: 0, images: ["bad", "https://a/b.jpg"] }), "title");
eq("照片取第一個 http 的", it.photo, "https://a/b.jpg");
eq("屋齡 0 → null", it.age, null);
eq("價格文字", I.priceText(it.price), "1,038.4 萬");
eq("整數價格不帶小數", I.priceText(898), "898 萬");
eq("沒價格 → 空字串", I.priceText(null), "");
eq("規格那一行", I.specText(it), "39.13 坪・2房2廳1衛・12/15 樓・電梯大樓");
eq("土地那種沒房數不寫 0房", I.specText(I.toInventoryItem(src({ rooms: 0, halls: 0, baths: 0, floor: "", type: "店面" }), "near")), "30 坪・店面");
eq("B1 樓層", I.floorLabel("B1/14"), "B1/14 樓");

console.log("");
if (fails.length) {
  console.log(fails.join("\n"));
  console.log(`\n❌ ${fails.length} 項失敗（${pass} 項通過）`);
  process.exit(1);
}
console.log(`✅ 建案在售物件對照規則 ${pass} 項全過`);
