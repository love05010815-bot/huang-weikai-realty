/**
 * 迴歸測試：591 刊登助手的辨識器與對應規則。
 * 用法：node --experimental-strip-types scripts/check-post591.mjs
 * ⚠️ 測試字串一律自己編（假社區、假地址、假電話），不要貼真實型錄 —— 這個 repo 是公開的。
 */
// 專案內部用 @/ 別名，node 不讀 tsconfig，所以先掛上 resolver 再動態載入（同 check-rival-analysis）
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const { combinePhotos, detectSource, extractPhotoUrls, extractPhotosFromHtml, isHouseolPage, listingNoFromUrl, parseListing, photoLinkReport, splitFeatureLines } = await import("../src/lib/post591-parser.ts");
const { buildDescription, buildPayload, buildRows, derive, descToHtml, encodePayload, photoCommand, post591Risks, splitAddress, titleCheck } =
  await import("../src/lib/post591-map.ts");
const { buildRakuya, rakuyaDesc, rakuyaParkKind, RAKUYA_TITLE_MAX } = await import("../src/lib/rakuya-map.ts");

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

  /* F. 給外掛的資料包：確認表上改過的值要蓋掉解析結果，編碼要能解回來 */
  console.log("F. 外掛資料包");
  const rows = buildRows(d, o).map((r) => (r.label === "號" ? { ...r, value: "88" } : r.label === "裝潢程度" ? { ...r, value: "簡易裝潢" } : r.label === "　└ 管理費有無" ? { ...r, value: "有" } : r.label === "管理費" ? { ...r, value: "1500" } : r));
  const p = buildPayload(d, o, rows, "測試標題六個字", buildDescription(d.features));
  eq("第①頁", `${p.first.legal}/${p.first.status}/${p.first.type}`, "住家用/住宅/電梯大樓");
  eq("號吃到確認表的改法", p.addr.no, "88");
  eq("預設隱藏門號", p.addr.hide, true);
  eq("裝潢吃到改法", p.deco, "簡易裝潢");
  eq("管理費有＋金額", `${p.fee.has}/${p.fee.amount}`, "true/1500");
  eq("樓層", `${p.floor.sell}/${p.floor.total}`, "3/15");
  eq("車位型式", p.area.parkType, "平面式停車位");
  eq("生活機能是陣列", Array.isArray(p.life) && p.life.length, 0);
  const enc = encodePayload(p);
  const back = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(enc)))));
  eq("編碼解回來一致", back.addr.no + back.title, "88測試標題六個字");
  ok(enc.length < 12000, "網址長度合理", enc.length, "<12000");
}

/* ───── G. 照片連結：兩條連結直接接在一起、其中一條沒有 picstr、另一條 URL 編碼過（2026-09-05 少三張那次） ───── */
{
  console.log("G. 照片連結");
  const a = "https://es.houseol.com.tw/Ecatalog.aspx?UID=SP1&UAID=H2&No=AA0000001&AID=H2";
  const b = "https://es.houseol.com.tw/EInfos.aspx?type=3&picstr=https://hq.houseol.com.tw/p/1.jpg,https://hq.houseol.com.tw/p/2.jpg,https://hq.houseol.com.tw/p/3.jpg,https://hq.houseol.com.tw/p/4.jpg,https://hq.houseol.com.tw/p/5.jpg,https://hq.houseol.com.tw/p/6.jpg&x=1";
  const c = "https://es.houseol.com.tw/EInfos.aspx?type=1&picstr=" + encodeURIComponent("https://hq.houseol.com.tw/p/7.jpg,https://hq.houseol.com.tw/p/8.jpg,https://hq.houseol.com.tw/p/6.jpg");
  const r = photoLinkReport(a + b + c);
  eq("三條連結都認得", r.links.length, 3);
  eq("每條各幾張", r.perLink.join("/"), "0/6/3");
  eq("合計去重後 8 張", r.photos.length, 8);
  eq("順序保留、第一張是 1.jpg", r.photos[0], "https://hq.houseol.com.tw/p/1.jpg");
  eq("單一連結照舊", extractPhotoUrls(b).length, 6);
  eq("沒有 picstr 就是空的", extractPhotoUrls(a).length, 0);
  eq("用逗號或換行分開貼也行", photoLinkReport(b + String.fromCharCode(10) + c).photos.length, 8);
  eq("型錄頁要去掃", isHouseolPage(a), true);
  eq("更多照片連結不用掃", isHouseolPage(b), false);
  eq("型錄頁網址裡的物件編號", listingNoFromUrl(a), "AA0000001");
  const html = `<img src="https://hq.houseol.com.tw/images/pictures/4817_3.jpg"><img src="https://hq.houseol.com.tw/images/pictures/H2AA0000001a.jpg"><img src="//hq.houseol.com.tw/images/pictures/H2AA0000001d.jpg"><img src="https://hq.houseol.com.tw/images/pictures/H2AA0000001A.JPG">`;
  eq("型錄頁照片排掉 logo、// 補 https、大小寫去重", extractPhotosFromHtml(html, "AA0000001").map((u) => u.slice(u.lastIndexOf("/") + 1)).join("|"), "H2AA0000001a.jpg|H2AA0000001d.jpg");
  const all = combinePhotos(a + b, { [a]: extractPhotosFromHtml(html, "AA0000001") });
  eq("型錄頁 2 張＋更多照片 6 張", all.length, 8);
  eq("順序：型錄頁的先", all[0].endsWith("H2AA0000001a.jpg"), true);
  eq("沒掃到的型錄頁先算 0 張、pages 會列出來", photoLinkReport(a + b).pages.length + "/" + photoLinkReport(a + b).perLink.join("/"), "1/0/6");
}
/* ───── H. 描述樣式：18px 粗體、指定段落顏色／底色、貼心提醒整段紅（2026-09-07 他指定） ───── */
{
  console.log("H. 描述樣式");
  const html = descToHtml(buildDescription(["測試一行", "測試二行"]));
  const paras = html.split("</p>").filter(Boolean);
  ok(paras.every((p) => p.startsWith("<p>")), "每行一個 <p>", paras.length, ">0");
  ok(paras.filter((p) => p !== "<p><br>").every((p) => p.includes("font-size:18px") && p.includes("<strong>")), "每行 18px 粗體", "ok", "ok");
  const find = (t) => paras.find((p) => p.includes(t)) || "";
  ok(find("☆主推特色介紹").includes("background-color:#ffff00"), "標頭黃底", find("☆主推特色介紹").slice(0, 60), "bg");
  ok(!find("✨測試一行").includes("background-color") && !find("✨測試一行").includes("color:#"), "✨ 行不上色", find("✨測試一行").slice(0, 60), "plain");
  ok(find("※歡迎來電預約看屋").includes("background-color:#ffff00") && find("官方LINE").includes("background-color:#ffff00"), "聯絡兩行黃底", "ok", "ok");
  ok(find("YouTube").includes("color:#9035cc"), "影音行紫", find("YouTube").slice(0, 60), "#9035cc");
  ok(find("★★★歡迎屋主").includes("color:#AF551B"), "委託行褐", "ok", "ok");
  ok(find("小凱專營").includes("color:#AF551B"), "專營行褐（2026-09-07 補）", find("小凱專營").slice(0, 60), "#AF551B");
  ok(find("你的期待由我來達成").includes("color:#246AED") && find("✅房屋打造專屬空拍影音").includes("color:#246AED"), "⚜️✅ 區塊藍", "ok", "ok");
  ok(find("海線破億團隊").includes("color:#951919") && find("廣告行銷最大").includes("color:#951919"), "｜｜行深紅", "ok", "ok");
  ok(find("貼心提醒").includes("color:#ff0207") && find("最適合的家").includes("color:#ff0207"), "貼心提醒整段紅到最後", "ok", "ok");
  ok(!find("太平洋房屋").includes("color:#") && !find("經紀人:").includes("color:#"), "店名／經紀人不上色", "ok", "ok");
  eq("空行變空段落", paras.includes("<p><br>"), true);
  eq("HTML 跳脫", descToHtml("a<b>&c").includes("a&lt;b&gt;&amp;c"), true);
  const p2 = buildPayload(parseListing(型錄大樓), derive(parseListing(型錄大樓), 2026), [], "標題六個字啊", buildDescription(["x"]));
  eq("資料包帶 descHtml", typeof p2.descHtml === "string" && p2.descHtml.includes("font-size:18px"), true);
}
/* ───── I. 出租型錄（2026-09-09 幸福成那份的格式：租金／押金、含車位面積、沒竣工日、環境特色寫租住條件） ───── */
{
  console.log("I. 出租型錄");
  const 租屋 = `不動產電子型錄\n租-測試成4房傢俱電全配\n梧棲區測試東路 顯示\n登記坪數	52.05 坪\n(含車位面積	7.48坪)\n租　　金	2.5萬\n押　　金	2個月\n建物面積	44.57 坪\n主 +附屬	29.67 坪\n主建物坪	26.66 坪\n附屬建物	3.01 坪\n公設建坪	14.9 坪\n公設比	33.4%\n樓別/樓高	24 /28\n房/廳/衛	4/ 2/ 2\n車位型式	坡道/平面\n車位/編號	公設車位/A30355\n現況類別/謄本用途	住家/\n類型/現況	大樓 /空屋\n社區	測試幸福成\n管理費用| 車位管理費	| /\n建物外觀	二丁掛\n建物結構	鋼筋混凝土RC\n物件編號	ZZ0000021\n鑰匙/帶看	/ 聯絡承辦人員\n環境特色\n禁菸、寵\n租金含管含車\n地圖 街景 更多照片 成交行情\n經紀人員：測試`;
  const d = parseListing(租屋);
  eq("來源", d.source, "houseol");
  eq("是出租", d.deal, "rent");
  eq("標題", d.rawTitle, "租-測試成4房傢俱電全配");
  eq("租金 2.5萬 → 25000", d.rent, 25000);
  eq("押金原文", d.deposit, "2個月");
  eq("含車位面積也吃", d.parkPing, 7.48);
  eq("主+附屬", d.mainAttPing, 29.67);
  eq("登記坪數", d.regPing, 52.05);
  eq("樓層", d.floor + "/" + d.total, "24/28");
  eq("房廳衛", [d.room, d.hall, d.bath].join("/"), "4/2/2");
  eq("社區", d.community, "測試幸福成");
  eq("管理費空", d.fee, null);
  eq("沒竣工日", d.y, null);
  eq("租住條件：禁寵", d.rentCond.noPets, true);
  eq("租住條件：禁菸", d.rentCond.noSmoking, true);
  eq("租住條件：含管", d.rentCond.feeIncluded, true);
  eq("租住條件：含車", d.rentCond.parkIncluded, true);
  eq("開伙沒寫", d.rentCond.cook, null);
  eq("特色行", d.features.join("|"), "禁菸、寵|租金含管含車");
  const o = derive(d, 2026);
  eq("第①頁三連點", [o.adType, o.legal, o.status, o.type].filter(Boolean).join("→"), "出租→整層住家→電梯大樓");
  eq("電梯", o.elevator, "有");
  eq("押金 2 個月", o.rentDeposit, "2個月");
  eq("租金含管理費", o.rentIncludes.join(), "管理費");
  eq("不可養寵物", o.pets, "不可");
  eq("可開伙（預設）", o.cook, "可");
  eq("有車位（含車）", o.hasPark, true);
  eq("可使用坪數", o.usePing, 29.67);
  const rows = buildRows(d, o);
  const lab = (l) => (rows.find((r) => r.label === l) || {}).value;
  eq("出租樓層列", lab("出租樓層"), "24");
  eq("租金列", lab("租金"), "25000");
  eq("身份三個", lab("身份要求"), "學生、上班族、家庭");
  ok(rows.some((r) => r.label === "提供設備" && r.need), "設備標紅給他勾", "ok", "ok");
  ok(!rows.some((r) => r.label === "售價" || r.label === "自備款"), "沒有售價／自備款列", "ok", "ok");
  const p = buildPayload(d, o, rows.map((r) => (r.label === "裝潢程度" ? { ...r, value: "中檔裝潢" } : r.label === "裝潢時間" ? { ...r, value: "1年內" } : r)), "測試四房傢俱電全配", buildDescription(d.features));
  eq("資料包 deal", p.deal, "rent");
  eq("資料包第①頁", p.first.adType + "/" + p.first.legal + "/" + p.first.status + "/" + p.first.type, "出租//整層住家/電梯大樓");
  eq("月租金", p.rent.monthly, 25000);
  eq("押金", p.rent.deposit, "2個月");
  eq("租金包含", p.rent.includes.join(), "管理費");
  eq("身份", p.rent.identity.join(), "學生,上班族,家庭");
  eq("寵物／開伙", p.rent.pets + "/" + p.rent.cook, "不可/可");
  eq("水電", p.rent.water + "/" + p.rent.power, "台水繳費/台電繳費");
  eq("車位有", p.rent.park, true);
  eq("裝潢時間吃改法", p.rent.decoTime, "1年內");
  eq("裝潢程度吃改法", p.deco, "中檔裝潢");
  eq("完工年空 → 屋齡不詳", p.done.y, null);
  eq("管理費：含管但金額不明", p.fee.has + "/" + p.fee.amount, "null/null");
  const line = parseListing("「測試出租三房」\n地址：梧棲區測試路10號5樓\n租金：18,000元\n押金：2個月\n格局：3房/2廳/2衛\n總建坪：35坪\n✨近學校");
  eq("LINE 文字也認得出租", line.deal + "/" + line.rent + "/" + line.deposit, "rent/18000/2個月");
}
/* ───── J. 樂屋對應（2026-09-10 實測 member.rakuya.com.tw 出售／出租表單） ───── */
{
  console.log("J. 樂屋對應");
  const d = parseListing(型錄大樓); const o = derive(d, 2026);
  const p = buildPayload(d, o, buildRows(d, o), "這個標題故意寫得很長很長超過二十五個字看會不會被截掉喔喔喔", buildDescription(d.features));
  const rk = buildRakuya(d, o, p, 2026);
  eq("法定用途", rk.legal, "住家用");
  eq("現況型式／類型", rk.usecode + "/" + rk.typecode, "住宅/電梯大廈");
  eq("屋齡", rk.ageYears, 1);
  eq("新屋（≤3 年）", rk.ageType, "新屋");
  eq("單層", rk.floorsType + "/" + rk.floorsMax, "單層/null");
  eq("有社區", rk.isCommunity, true);
  eq("有管理費 → 管理員", rk.manage + "/" + rk.manageFee, "管理員(警衛)/2342");
  eq("車位", rk.parkStatus + "/" + rk.parkKind, "有車位/坡道平面式");
  eq("標題截 25 字", [...rk.title25].length + "/" + rk.titleTruncated, "25/true");
  eq("周圍環境帶學校", rk.env.elementary, d.school);
  eq("聯絡人", rk.contactName, "黃瑋凱");
  eq("沒有出租段", rk.rent, undefined);
  const d2 = parseListing(型錄透天); const o2 = derive(d2, 2026);
  const rk2 = buildRakuya(d2, o2, buildPayload(d2, o2, buildRows(d2, o2), "透天標題六個字", "x"), 2026);
  eq("透天 → 多層 1～總樓層", rk2.typecode + "/" + rk2.floorsType + "/" + rk2.floorsMax, "透天厝/多層/2");
  eq("透天沒車位", rk2.parkStatus, "無車位");
  eq("中古屋", rk2.ageType, "中古屋");
  eq("法定用途 住商用", rk2.legal, "住商用");
  eq("車位字：升降機械", rakuyaParkKind("升降/機械"), "昇降機械式");
  eq("車位字：平面", rakuyaParkKind("平面"), "平面式車位");
  eq("上限常數", RAKUYA_TITLE_MAX, 25);
  // 2026-09-10 他說的：樂屋文案不要「貼心提醒」那段（講的是 591 的問答訊息、我的店舖）；591 那邊照舊
  const full = buildDescription(d.features);
  const cut = rakuyaDesc(full);
  ok(full.includes("貼心提醒") && p.desc.includes("貼心提醒"), "591 文案照舊帶貼心提醒", "有", "有");
  ok(!cut.includes("貼心提醒") && !cut.includes("最適合的家"), "樂屋文案砍掉貼心提醒整段", cut.slice(-24), "…依正式謄本為準▲▲▲");
  ok(cut.endsWith("▲▲▲房屋刊登資料若有誤，依正式謄本為準▲▲▲"), "樂屋文案停在謄本那行、尾巴沒空行", JSON.stringify(cut.slice(-6)), "\"謄本為準▲▲▲\"");
  ok(cut.startsWith("☆主推特色介紹:") && cut.includes("✨"), "樂屋文案前面的版型與 ✨ 行都在", "在", "在");
  eq("沒有貼心提醒就原樣（同事版尾段是空的）", rakuyaDesc("☆主推特色介紹:\n\n✨甲\n✨乙"), "☆主推特色介紹:\n\n✨甲\n✨乙");
}
console.log("");
console.log(pass ? "✅ 591 刊登助手：辨識器與對應規則全部一致" : "❌ 有差異，不要往下做");
process.exit(pass ? 0 : 1);
