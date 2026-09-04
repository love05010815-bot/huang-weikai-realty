/**
 * 迴歸測試：591 刊登助手的辨識器與對應規則。
 * 用法：node --experimental-strip-types scripts/check-post591.mjs
 * ⚠️ 測試字串一律自己編（假社區、假地址、假電話），不要貼真實型錄 —— 這個 repo 是公開的。
 */
// 專案內部用 @/ 別名，node 不讀 tsconfig，所以先掛上 resolver 再動態載入（同 check-rival-analysis）
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const { detectSource, parseListing, splitFeatureLines } = await import("../src/lib/post591-parser.ts");
const { buildDescription, buildRows, derive, photoCommand, post591Risks, splitAddress, titleCheck } =
  await import("../src/lib/post591-map.ts");

let pass = true;
const ok = (cond, label, got, want) => {
  if (!cond) pass = false;
  console.log(`${cond ? "  ✅" : "  ❌"} ${String(label).padEnd(22)} ${String(got).padEnd(16)}${cond ? "" : "應為 " + want}`);
};
const eq = (label, got, want) => ok(got === want, label, JSON.stringify(got), JSON.stringify(want));

/* ───── A. 愛屋型錄：電梯大樓、有車位、門牌被藏 ───── */
const 型錄大樓 = `不顯示行銷人員 測試店 王小明 李小華
2026/09/01 印
不動產電子型錄
測試花園三房配B1平車
沙鹿區測試路顯示
委託總價
1128萬

登記坪數
44.98 坪
(含車位坪
10.95坪)
建物面積
34.03 坪
主建物坪
20.818 坪
附屬建物
1.987 坪
公設建坪
11.23 坪
土地登記
7.31 坪
樓別/樓高
6 /15
房/廳/衛
3/ 2/ 2
車位型式
坡道/平面
車位/編號
公設車位/B1-15
類別/謄本用途
住家/集合住宅
類型/現況
大樓 /空屋
社區
測試花園
管理費|車位管理費
2342元/月繳| /
竣工日期
2025/10/15
鄰近公園
測試公園
鄰近市場

鄰近學校
市立測試國小
物件編號
ZZ0000001
環境特色
✨測試花園，一層四戶雙梯。
✨近測試國小。
[地圖](x) [更多照片](https://example.invalid/EInfos.aspx?picstr=https://example.invalid/a.jpg,https://example.invalid/b.jpg)
經紀人員：測試
電話：0900-000-000
僅供參考詳細內容以謄本記載為準 經紀證照:測試`;

console.log("A. 愛屋型錄（大樓）");
{
  eq("來源", detectSource(型錄大樓), "houseol");
  const d = parseListing(型錄大樓);
  eq("標題", d.rawTitle, "測試花園三房配B1平車");
  eq("地址（門牌藏）", d.addr, "沙鹿區測試路");
  eq("總價", d.price, 1128);
  eq("權狀", d.regPing, 44.98);
  eq("車位坪", d.parkPing, 10.95);
  eq("主建物", d.mainPing, 20.818);
  eq("樓層", `${d.floor}/${d.total}`, "6/15");
  eq("房廳衛", `${d.room}/${d.hall}/${d.bath}`, "3/2/2");
  eq("社區", d.community, "測試花園");
  eq("管理費", `${d.fee} ${d.feeCycle}`, "2342 月繳");
  eq("竣工", `${d.y}/${d.m}/${d.dd}`, "2025/10/15");
  eq("鄰近市場是空的", d.market, "");
  eq("照片數", d.photos.length, 2);
  eq("特色行數", d.features.length, 2);
  ok(!d.features[0].startsWith("✨"), "特色行去掉 ✨", d.features[0], "測試花園，一層四戶雙梯。");
  const o = derive(d, 2026);
  eq("四連點", `${o.adType}→${o.legal}→${o.status}→${o.type}`, "出售→住家用→住宅→電梯大樓");
  eq("民國年", o.rocY, 114);
  eq("出售樓層", o.sellFloor, 6);
  eq("面積選項", o.areaOpt, "含車位面積");
  eq("車位型式", o.parkSel, "平面式停車位");
  eq("自備款", o.down, 226);
  eq("生活機能", o.life.join("、"), "近學校、近公園綠地");
  eq("整串地址補台中市", o.fullAddr, "台中市沙鹿區測試路");
  eq("鄉鎮", o.parts.town, "沙鹿區");
  eq("街道", o.parts.road, "測試路");
  const rows = buildRows(d, o);
  const need = rows.filter((r) => r.need).map((r) => r.label);
  ok(need.includes("號"), "門牌被藏→號標紅", need.join("、"), "含「號」");
  ok(need.includes("裝潢程度"), "裝潢永遠要人選", need.join("、"), "含「裝潢程度」");
  ok(!need.includes("社區名稱"), "社區有值不標紅", need.join("、"), "不含社區名稱");
  ok(photoCommand(d.photos, d.no).includes("photos_ZZ0000001"), "照片指令資料夾", "photos_ZZ0000001", "photos_ZZ0000001");
}

/* ───── B. 愛屋型錄：透天、住商用、門牌完整、全形數字 ───── */
const 型錄透天 = `不動產電子型錄
測試學區、公園旁大透天
台中市測試區測試路三段７３４巷５６號隱藏
委託總價
698萬
登記坪數
31.13 坪
主建物坪
31.13 坪
附屬建物
0 坪
公設建坪
0 坪
土地登記
20.56 坪
使用分區
第三種住宅區
樓別/樓高
1-2 /2
房/廳/衛
5/ 3/ 2
類別/謄本用途
住家/住商用
類型/現況
透天 /空屋
物件座向
座西 朝東
竣工日期
1978/6/30
屋　　齡
48.3 年
鄰近公園
測試公園
鄰近學校
市立測試國小,市立測試國中
物件編號
ZZ0000002
環境特色
①1樓有重新整理
②方正格局
經紀人員：測試`;

console.log("B. 愛屋型錄（透天）");
{
  const d = parseListing(型錄透天);
  eq("地址（全形轉半形、砍隱藏）", d.addr, "台中市測試區測試路三段734巷56號");
  eq("樓別原文", d.floorRaw, "1-2");
  eq("總樓層", d.total, 2);
  eq("竣工單位數月份", `${d.y}/${d.m}/${d.dd}`, "1978/6/30");
  eq("特色去掉①②", d.features.join("|"), "1樓有重新整理|方正格局");
  const o = derive(d, 2026);
  eq("四連點（住商用）", `${o.legal}→${o.type}`, "住商用→透天厝");
  eq("透天出售樓層 0", o.sellFloor, 0);
  eq("沒車位→不含", o.areaOpt, "不含車位面積");
  eq("朝向", o.facing, "坐西朝東");
  eq("民國年", o.rocY, 67);
  const p = splitAddress(d.addr);
  eq("拆地址", `${p.city}|${p.town}|${p.road}|${p.lane}|${p.no}|${p.sub}`, "台中市|測試區|測試路三段|734|56|");
  eq("之2 也拆得到", splitAddress("台中市測試區中山路100巷5弄12之3號").sub, "3");
  const rows = buildRows(d, o);
  ok(!rows.some((r) => r.label === "社區名稱" && r.need), "透天社區不標紅", "ok", "ok");
  ok(!rows.some((r) => r.label === "號" && r.need), "門牌完整不標紅", "ok", "ok");
}

/* ───── C. LINE 文字（他 2026-09-04 的格式） ───── */
const LINE文字 = `新接🌟測試天廈

「測試天廈輕裝視野四房住辦合一」
地址：梧棲區測試路７１巷２號１２樓之１

售價：８６８萬
格局：４房/２廳/４衛
______________________

總建坪：51.16坪
主建：40.08坪
附屬：0.895坪
公設：10.183坪
屋齡：33年
________________________

帶看方式：鑰匙在店，空屋好帶看。
✨測試天廈，總戶數74戶，小社區，四房室內40坪，大空間超舒適。
✨屋主有整理過，全室鋪設木地板。
✨每間有獨立分錶，投報5%起。
✨下樓就是便利商店。
✨車程2分鐘到醫院。
✨鄰台61。`;

console.log("C. LINE 文字");
{
  eq("來源", detectSource(LINE文字), "freeform");
  const d = parseListing(LINE文字);
  eq("標題", d.rawTitle, "測試天廈輕裝視野四房住辦合一");
  eq("地址只留到號", d.addr, "梧棲區測試路71巷2號");
  eq("樓層", `${d.floor} 之${d.floorSub}`, "12 之1");
  eq("售價", d.price, 868);
  eq("格局", `${d.room}/${d.hall}/${d.bath}`, "4/2/4");
  eq("權狀", d.regPing, 51.16);
  eq("主建", d.mainPing, 40.08);
  eq("附屬", d.attPing, 0.895);
  eq("公設", d.pubPing, 10.183);
  eq("屋齡", d.ageYears, 33);
  eq("總戶數", d.households, 74);
  eq("社區猜的", `${d.community}/${d.communityGuessed}`, "測試天廈/true");
  eq("特色 6 行", d.features.length, 6);
  eq("沒車位", d.parkType, "");
  const o = derive(d, 2026);
  eq("型態", o.type, "電梯大樓");
  eq("屋齡反推民國年", `${o.rocY}/${o.rocYEstimated}`, "82/true");
  eq("出售樓層", `${o.sellFloor}`, "12");
  eq("自備款", o.down, 174);
  eq("地址補台中市", o.fullAddr, "台中市梧棲區測試路71巷2號");
  const rows = buildRows(d, o);
  const need = rows.filter((r) => r.need).map((r) => r.label);
  ok(need.includes("出售總樓層"), "沒總樓層→標紅", need.join("、"), "含出售總樓層");
  ok(need.includes("　└ 管理費有無"), "沒管理費→標紅", need.join("、"), "含管理費有無");
  ok(rows.some((r) => r.label === "樓 之" && r.value === "1"), "樓之1 有一列", "ok", "ok");
  ok(d.warnings.some((w) => w.includes("謄本")), "提醒法定用途要自己選", d.warnings.length, ">0");
}

/* ───── D. 標題／描述／風險 ───── */
console.log("D. 標題、描述、風險字");
{
  eq("標題太短", titleCheck("五個字喔").ok, false);
  eq("標題 OK", titleCheck("測試天廈輕裝視野四房住辦合一").ok, true);
  eq("標題 31 字太長", titleCheck("一".repeat(31)).ok, false);
  const desc = buildDescription(["第一行", "✨第二行"]);
  ok(desc.startsWith("☆主推特色介紹:\n\n✨第一行\n✨第二行\n\n※歡迎來電"), "版型頭＋✨行＋尾", desc.slice(0, 30), "☆主推特色介紹:…");
  ok(desc.includes("經紀人:嚴意情"), "版型尾有經紀人", "ok", "ok");
  ok([...desc].length < 2500, "全文在 2500 內", [...desc].length, "<2500");
  const risks = post591Risks("住辦合一", "投報5%起，唯一七店直營，未來捷運藍線");
  const words = risks.map((r) => r.word);
  ok(words.includes("投報率"), "抓到投報", words.join("、"), "含投報率");
  ok(words.includes("住辦合一"), "抓到住辦合一", words.join("、"), "含住辦合一");
  ok(words.includes("未通車捷運"), "沿用站上的捷運規則", words.join("、"), "含未通車捷運");
  eq("splitFeatureLines 去符號", splitFeatureLines("✨甲\n①乙\n▪ 丙\n\n").join("|"), "甲|乙|丙");
  eq("環境特色下面那排連結字要丟掉", splitFeatureLines("✨甲\n地圖 街景 成交行情\n[地圖](x) [街景](y)\n成交行情").join("|"), "甲");
}

/* ───── E. 標題以「社區」開頭時不能把標題當社區名（2026-09-04 德光耀那則踩到） ───── */
console.log("E. 社區欄位不吃標題");
{
  const 型錄 = `不動產電子型錄
社區最便宜全新美兩房平車
沙鹿區測試街顯示
委託總價
838萬
登記坪數
33.88 坪
(含車位坪
9.75坪)
樓別/樓高
3 /15
房/廳/衛
2/ 2/ 1
車位型式
坡道/平面
類別/謄本用途
住家/集合住宅
類型/現況
大樓 /空屋
社區
測試耀
管理費|車位管理費
元/月繳| /
竣工日期
2026/5/13
物件編號
ZZ0000003
環境特色
✨測試耀，社區總戶數99戶。
地圖 街景 成交行情
經紀人員：測試`;
  const d = parseListing(型錄);
  eq("標題", d.rawTitle, "社區最便宜全新美兩房平車");
  eq("社區名是欄位不是標題", d.community, "測試耀");
  eq("管理費空白→null", d.fee, null);
  eq("特色只有一行", d.features.join("|"), "測試耀，社區總戶數99戶。");
  const o = derive(d, 2026);
  eq("車位型式對 591 選項", o.parkSel, "平面式停車位");
  eq("民國年", o.rocY, 115);
}

console.log("");
console.log(pass ? "✅ 591 刊登助手：辨識器與對應規則全部一致" : "❌ 有差異，不要往下做");
process.exit(pass ? 0 : 1);
