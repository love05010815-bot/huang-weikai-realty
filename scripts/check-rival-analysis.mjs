/**
 * 迴歸測試：競品分析的計算核心。
 * 用法：node --experimental-strip-types scripts/check-rival-analysis.mjs
 * ⚠️ 測試字串一律自己編，不要貼真實 591 內容 —— 這個 repo 是公開的。
 */
// 專案內部用 @/ 別名，node 不讀 tsconfig，所以先掛上 resolver 再動態載入
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const { parseMany, computeUnit, detectDupes } = await import("../src/lib/rival-parser.ts");
const { buildUnits, sortUnits, analyze, diagnose, buildConclusion, buildPlainText, MAXCHARS } =
  await import("../src/lib/rival-analysis.ts");

let pass = true;
const ok = (cond, label, got, want) => {
  if (!cond) pass = false;
  console.log(`${cond ? "  ✅" : "  ❌"} ${String(label).padEnd(26)} ${String(got).padEnd(14)}${cond ? "" : "應為 " + want}`);
};

/** 編一筆假的 591 貼上內容 */
const mk = (o) => `首頁 中古屋 台中市 測試區 住宅 750萬以下 當前房屋（S${o.id}）
${o.t ?? "測試標題"}
瀏覽人數：${o.v}
${o.p} 萬元${(o.p / o.a).toFixed(2)}萬/坪
2房2廳1衛格局${o.age}屋齡${o.a}坪${o.incl === false ? "" : "(含車位)"}權狀坪數樓層${o.f}F/12F社區測試社區
本社區“測試社區”
房屋資料型態：${o.bt ?? "電梯大樓"}車位：${o.park ?? "3.3坪，機械式，已含售金內"}
所屬公司：${o.ag ?? "某某房屋"}
屋況特色 別區 32.5坪 668萬 20.55萬/坪
社區資訊熱賣物件44間近半個月上架6間屋主刊登2間降價9間1820人瀏覽
全部 二房(19間) ~2425坪 570~898 萬 三房(25間) 3945坪 998~1,588 萬
實價登錄 總價： 1,553萬`;

const run = (mineOpt, rivalOpts, ans, tweak) => {
  const mine = parseMany(mk(mineOpt)).map(computeUnit);
  const rivals = parseMany(rivalOpts.map(mk).join("\n")).map(computeUnit);
  mine.forEach((r) => (r.isSelf = true));
  const rows = mine.concat(rivals);
  detectDupes(rows);
  if (tweak) tweak(rows);
  const units = buildUnits(rows);
  const A = analyze(units, rows);
  const dx = diagnose(A, ans);
  return { rows, units, A, dx, C: buildConclusion(A, dx) };
};

const SELF = { id: "20000001", v: 27, p: 698, a: 24.8, age: "1年", f: 7 };
const 六戶 = [
  { id: "20000002", v: 1, p: 738, a: 24.96, age: "1年", f: 9 },
  { id: "20000003", v: 28, p: 688, a: 25, age: "10個月", f: 3 },
  { id: "20000004", v: 48, p: 658, a: 24.96, age: "1個月", f: 3 },
  { id: "20000005", v: 51, p: 738, a: 30, age: "1年", f: 8, park: "8.55坪，平面式，已含售金內" },
  { id: "20000006", v: 21, p: 898, a: 30.22, age: "8個月", f: 10, park: "8.55坪，平面式，已含售金內" },
];

console.log("=== A 基本盤（6 戶、無重複）===");
{
  const { A, dx, C } = run(SELF, 六戶, { call: "yes", view: "no", offer: "no" });
  ok(A.realUnits === 6, "真實戶數", A.realUnits, 6);
  ok(sortUnits(A.units)[0].isSelf, "本案排第一列", sortUnits(A.units)[0].isSelf, true);
  const rest = sortUnits(A.units).slice(1).map((u) => u.unit);
  ok(rest.every((v, i) => i === 0 || rest[i - 1] <= v), "其餘依單價由低到高", rest.join("<"), "遞增");
  ok(A.othersMedian === 28, "其他戶瀏覽中位數", A.othersMedian, 28);          // 1,28,48,51,21 → 28
  ok(Math.round(A.ratio * 100) === 96, "本案佔中位數 %", Math.round(A.ratio * 100), 96);
  ok(A.heatLevel === "mid" && A.heatPass, "熱度：與同社區相當", A.heatLevel, "mid");
  ok(A.absMeaningless, "500 門檻無鑑別度", A.absMeaningless, true);
  ok(A.communityCuts === 9 && A.cutPct === 20, "降價 9 間＝在售 20%", `${A.communityCuts}/${A.cutPct}%`, "9/20%");
  ok(A.rival?.price === 688, "單價最接近＝688", A.rival?.price, 688);
  ok(A.twin?.price === 738 && A.twin?.area === 24.96, "條件最像＝738/24.96坪", `${A.twin?.price}/${A.twin?.area}`, "738/24.96");
  ok(!A.twinSameAsRival, "兩戶不同", A.twinSameAsRival, false);
  ok(dx.key === "price", "判讀＝價格問題", dx.key, "price");
  ok(C && C.count <= MAXCHARS, "結論字數 ≤200", C?.count, "≤200");
}

console.log("\n=== B 判讀四個分支 ===");
for (const [ans, want] of [
  [{ call: "yes", view: "no", offer: "no" }, "price"],
  [{ call: "no", view: "no", offer: "no" }, "inquiry"],
  [{ call: "yes", view: "yes", offer: "no" }, "product"],
  [{ call: "yes", view: "yes", offer: "yes" }, "negotiating"],
  [{ call: null, view: null, offer: null }, "needanswer"],
]) {
  const { dx, C } = run(SELF, 六戶, ans);
  ok(dx.key === want, `${ans.call ?? "-"}/${ans.view ?? "-"}/${ans.offer ?? "-"}`, dx.key, want);
  if (want !== "needanswer") ok(C.count <= MAXCHARS, "  └ 結論字數", C.count, "≤200");
}

console.log("\n=== C 熱度落後 → 曝光問題 ===");
{
  const { A, dx } = run({ ...SELF, v: 4 }, 六戶, { call: "yes", view: "no", offer: "no" });
  ok(Math.round(A.ratio * 100) === 14, "本案佔中位數 %", Math.round(A.ratio * 100), 14);
  ok(!A.heatPass && dx.key === "exposure", "判讀＝曝光問題", dx.key, "exposure");
}

console.log("\n=== D 去重：合併要取最低開價那一筆 ===");
{
  // 同 8 樓、坪數差 0.03，但開價差 50 萬 → 預設不合併
  const 兩筆 = [{ id: "20000007", v: 16, p: 788, a: 30.03, age: "1年", f: 8, park: "平面式，已含售金內" },
                { id: "20000008", v: 50, p: 738, a: 30, age: "1年", f: 8, park: "無", incl: false }];
  const 沒合併 = run(SELF, 兩筆, { call: "yes", view: "no", offer: "no" });
  ok(沒合併.A.realUnits === 3, "預設不合併→3 戶", 沒合併.A.realUnits, 3);

  // 使用者手動勾合併
  const 有合併 = run(SELF, 兩筆, { call: "yes", view: "no", offer: "no" },
    (rows) => rows.forEach((r) => { if (r.isDupFollower) r.merge = true; }));
  ok(有合併.A.realUnits === 2, "手動合併→2 戶", 有合併.A.realUnits, 2);
  const merged = 有合併.units.find((u) => u.listingCount === 2);
  ok(merged?.price === 738, "代表價＝較低那筆 738", merged?.price, 738);
  ok(merged?.views === 66, "瀏覽相加 16+50", merged?.views, 66);
  ok(merged?.otherPrices.join() === "788", "另一個開價有記下來", merged?.otherPrices.join(), "788");
}

console.log("\n=== E 型態混雜會汙染中位數 ===");
{
  const 含別墅 = [...六戶, { id: "20000009", v: 81, p: 570, a: 21.5, age: "1年", f: 2, bt: "別墅", park: "無", incl: false }];
  const A1 = run(SELF, 含別墅, { call: "yes", view: "no", offer: "no" });
  ok(A1.A.offType.length === 1, "抓到 1 戶不同產品", A1.A.offType.length, 1);
  ok(A1.A.othersMedian === 38, "中位數被拉高到 38", A1.A.othersMedian, 38);
  ok(A1.dx.key === "exposure", "判讀被帶偏成曝光問題", A1.dx.key, "exposure");

  const A2 = run(SELF, 六戶, { call: "yes", view: "no", offer: "no" });
  ok(A2.A.offType.length === 0 && A2.dx.key === "price", "刪掉別墅→價格問題", A2.dx.key, "price");
}

console.log("");
console.log("=== G 房型分佈接進分析 ===");
{
  const { A, C } = run(SELF, 六戶, { call: "yes", view: "no", offer: "no" });
  ok(A.roomTypes.length === 2, "抓到 2 種房型", A.roomTypes.length, 2);
  ok(A.selfRoomType?.rooms === 2 && A.selfRoomType?.count === 19, "本案是 2 房 → 19 間", A.selfRoomType?.count, 19);
  ok(A.selfRoomType?.low === 570 && A.selfRoomType?.high === 898, "價格帶 570~898",
     `${A.selfRoomType?.low}~${A.selfRoomType?.high}`, "570~898");
  // 本案 698 萬落在 570~898 之間 → (698-570)/(898-570) = 39%
  ok(A.bandPct === 39, "本案落在價格帶第 39%", A.bandPct, 39);
  // 🔴 實價登錄的「總價 1,553 萬」不可以被當成價格帶
  ok(!A.roomTypes.some((t) => t.high === 1553), "沒抓到實價登錄的 1,553 萬", "ok", "ok");
  ok(C.count <= MAXCHARS, "加了同房型那句仍 ≤200 字", C.count, "≤200");
  ok(C.body.includes("19 間"), "屋主結論有講同房型幾間", C.body.includes("19 間") ? "有" : "沒有", "有");
}

console.log("\n=== F 純文字版 ===");
{
  const { A, dx, C } = run(SELF, 六戶, { call: "yes", view: "no", offer: "no" });
  const txt = buildPlainText(A, dx, C);
  for (const seg of ["第一段：比較表", "第二段：貼身對手", "第三段：體質檢測", "第四段：判讀卡在哪", "給您的結論",
                     "【單價最接近】", "【條件最像】", "社區已降價戶數", "瀏覽量代表線上關注", "本案房型（二房）在售", "該房型的開價帶"]) {
    ok(txt.includes(seg), seg, txt.includes(seg) ? "有" : "缺", "要有");
  }
  ok(txt.split("\n").length > 30, "行數合理", txt.split("\n").length, ">30");
}

console.log("\n" + (pass ? "✅ 分析引擎全部通過" : "❌ 有錯，不要接畫面"));
process.exit(pass ? 0 : 1);
