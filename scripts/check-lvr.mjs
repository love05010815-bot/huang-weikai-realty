/**
 * 實價登錄解析器的檢查（src/lib/lvr-parse.ts）—— 純函式、不進資料庫。
 * 用法：node --experimental-strip-types scripts/check-lvr.mjs
 *      加 --live 會真的向內政部下載本期 zip（約 2MB），印出四區筆數與期程。
 * 改到欄位對應、日期換算、備註標籤、型態分類前後都跑一次。
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const P = await import("../src/lib/lvr-parse.ts");

let pass = true;
const ok = (cond, label, got, want) => {
  if (!cond) pass = false;
  console.log(`${cond ? "  ✅" : "  ❌"} ${String(label).padEnd(36)} ${String(got).padEnd(22)}${cond ? "" : "應為 " + want}`);
};
const eq = (label, got, want) => ok(JSON.stringify(got) === JSON.stringify(want), label, JSON.stringify(got), JSON.stringify(want));

console.log("=== A 日期 ===");
eq("民國 7 碼 → ISO", P.rocDateToIso("1150825"), "2026-08-25");
eq("民國 6 碼（99 年）", P.rocDateToIso("991231"), "2010-12-31");
eq("空白回 null", P.rocDateToIso(""), null);
eq("壞月份回 null", P.rocDateToIso("1151325"), null);
eq("完成年月只留到月", P.rocYmToIso("0740131"), "1985-01");
eq("ISO → 民國顯示", P.isoToRoc("2026-08-25"), "115/08/25");

console.log("=== B 門牌全形轉半形 ===");
eq("全形數字", P.toHalfWidth("臺中市梧棲區大同街２８８號七樓之２"), "臺中市梧棲區大同街288號七樓之2");
eq("全形字母與空白", P.toHalfWidth("Ｂ棟　０７Ｆ－０２號"), "B棟 07F-02號");

console.log("=== C CSV 解析 ===");
const csv = '﻿鄉鎮市區,交易標的,備註,編號\nThe district,sign,note,serial\n梧棲區,土地,"有逗號,在裡面 ""引號""",RP1\n清水區,房地(土地+建物),,RP2\n';
const recs = P.csvRecords(csv);
eq("兩行表頭跳過、兩列資料", recs.length, 2);
eq("引號內逗號與雙引號", recs[0]["備註"], '有逗號,在裡面 "引號"');
eq("BOM 不會黏在第一個欄名", Object.keys(recs[0])[0], "鄉鎮市區");
eq("空欄位是空字串", recs[1]["備註"], "");

console.log("=== D 一列買賣 → LvrDeal ===");
const HEADER =
  "鄉鎮市區,交易標的,土地位置建物門牌,土地移轉總面積平方公尺,都市土地使用分區,非都市土地使用分區,非都市土地使用編定,交易年月日,交易筆棟數,移轉層次,總樓層數,建物型態,主要用途,主要建材,建築完成年月,建物移轉總面積平方公尺,建物現況格局-房,建物現況格局-廳,建物現況格局-衛,建物現況格局-隔間,有無管理組織,總價元,單價元平方公尺,車位類別,車位移轉總面積平方公尺,車位總價元,備註,編號,主建物面積,附屬建物面積,陽台面積,電梯,移轉編號";
const ROW =
  "梧棲區,房地(土地+建物)+車位,臺中市梧棲區大同街２８８號七樓之２,19.24,都市：其他:第一種商業區,,,1150820,土地1建物1車位1,七層,十二層,住宅大樓(11層含以上有電梯),住家用,鋼筋混凝土造,1140626,133.66,3,2,2,有,有,7650000,57235,坡道平面,28.25,0,,RPROMLPLQHLGFFB88DA,61.32,0.0,8.34,有,0017";
const OTHER = "西屯區,房地(土地+建物),臺中市西屯區某路１號,10,,,,1150820,土地1建物1車位0,三層,五層,公寓(5樓含以下無電梯),住家用,,0800101,80,2,1,1,有,無,5000000,62500,,0,0,,RPXX,80,0,0,無,";
const deals = P.parseDeals(`${HEADER}\nenglish header\n${ROW}\n${OTHER}\n`, "sale");
eq("西屯區被丟掉、只留四區", deals.length, 1);
const d = deals[0];
eq("id = 編號-移轉編號", d.id, "RPROMLPLQHLGFFB88DA-0017");
eq("交易日 ISO", d.dealDate, "2026-08-20");
eq("門牌半形", d.address, "臺中市梧棲區大同街288號七樓之2");
eq("完成年月", d.builtYm, "2025-06");
eq("單價元/m²", d.unitPriceM2, 57235);
eq("格局 3/2/2", [d.rooms, d.halls, d.baths], [3, 2, 2]);
eq("電梯有", d.hasElevator, true);
eq("車位類別", d.parkingType, "坡道平面");

console.log("=== E 換算 ===");
eq("133.66 m² → 坪", P.m2ToPing(133.66), 40.43);
eq("57235 元/m² → 萬/坪", P.unitPriceToWanPerPing(57235), 18.9);
eq("null 單價", P.unitPriceToWanPerPing(null), null);
eq("7,650,000 → 765 萬", P.yuanToWan(7650000), 765);
eq("432,750 → 43.3 萬", P.yuanToWan(432750), 43.3);
eq("屋齡：2025-06 在 2026-09 → 1.3 年", P.buildingAge("2025-06", new Date(2026, 8, 30)), 1.3);
eq("屋齡：沒有完成年月", P.buildingAge(null), null);

console.log("=== F 樓層 ===");
eq("七層 → 7F", P.floorLabel("七層"), "7F");
eq("十二層 → 12F", P.floorLabel("十二層"), "12F");
eq("二十層 → 20F", P.floorLabel("二十層"), "20F");
eq("十層 → 10F", P.floorLabel("十層"), "10F");
eq("全 原樣", P.floorLabel("全"), "全");
eq("預售的阿拉伯數字 14 → 14F", P.floorLabel("14"), "14F");
eq("期程精簡版拿掉租賃", P.periodTextForDisplay("登記日期 115年9月1日至 115年9月10日之買賣案件，及訂約日期 115年8月1日至 115年8月10日之租賃案件，及交易日期115年8月1日至 115年8月10日之預售屋案件"), "登記日期 115年9月1日至115年9月10日之買賣案件；交易日期 115年8月1日至115年8月10日之預售屋案件");
eq("多層原樣", P.floorLabel("一層，二層"), "一層，二層");

console.log("=== G 備註標籤 ===");
eq("親友", P.noteFlags("親友、員工、共有人或其他特殊關係間之交易；"), ["親友／特殊關係"]);
eq("增建", P.noteFlags("本件買賣含其他增建；"), ["含增建"]);
eq("沒有特殊字眼", P.noteFlags("雙方約訂地上農舍併同交付"), []);
eq("空備註", P.noteFlags(""), []);

console.log("=== H 型態分類 ===");
eq("住宅大樓 → apt", P.categorize({ kind: "sale", target: "房地(土地+建物)+車位", buildingType: "住宅大樓(11層含以上有電梯)" }), "apt");
eq("華廈 → apt", P.categorize({ kind: "sale", target: "房地(土地+建物)", buildingType: "華廈(10層含以下有電梯)" }), "apt");
eq("透天 → house", P.categorize({ kind: "sale", target: "房地(土地+建物)", buildingType: "透天厝" }), "house");
eq("土地 → land（建物型態寫其他）", P.categorize({ kind: "sale", target: "土地", buildingType: "其他" }), "land");
eq("預售 → presale", P.categorize({ kind: "presale", target: "房地(土地+建物)", buildingType: "透天厝" }), "presale");
eq("店面 → shop", P.categorize({ kind: "sale", target: "房地(土地+建物)", buildingType: "店面(店鋪)" }), "shop");
eq("短名", P.buildingTypeShort("住宅大樓(11層含以上有電梯)"), "住宅大樓");

console.log("=== I 期程 ===");
const XML =
  "<?xml version=\"1.0\"?><lvr_land><lvr_time>資料內容：登記日期 115年9月1日至 115年9月10日之買賣案件，及訂約日期 115年8月1日至 115年8月10日之租賃案件，及交易日期115年8月1日至 115年8月10日之預售屋案件</lvr_time></lvr_land>";
const period = P.parsePeriodText(XML);
ok(period.startsWith("登記日期 115年9月1日至 115年9月10日之買賣案件"), "期程去掉「資料內容：」", period.slice(0, 20), "登記日期 115年9月1日…");
eq("買賣登記日範圍", P.salePeriodRange(period), { from: "115年9月1日", to: "115年9月10日" });
const L = await import("../src/lib/lvr.ts").catch(() => null);
if (L) {
  eq("本期標籤", L.batchLabelFromPeriod(period, "2026-09-30"), "登記 115/9/1–9/10");
  eq("解析不出來用日期", L.batchLabelFromPeriod("", "2026-09-30"), "期別 2026-09-30");
  console.log("=== I2 前期清單 ===");
  const HIST = `<tr><td>發布日期 20260711<span class="i_desc" desc="資料內容：登記日期 115年6月21日至 115年6月30日之買賣案件，及訂約日期 115年5月21日至 115年5月31日之租賃案件"><img/></span></td>
    <td><span onclick="javaScript:downloadLast('20260711');">下載</span></td></tr>
    <tr><td>發布日期 20260701<span class="i_desc" desc="資料內容：登記日期 115年6月11日至 115年6月20日之買賣案件"><img/></span></td>
    <td><span onclick="javaScript:downloadLast('20260701');">下載</span></td></tr>`;
  const hist = P.parseHistoryList(HIST);
  eq("兩旬、由舊到新", hist.map((h) => h.publishDate), ["20260701", "20260711"]);
  eq("期程去掉「資料內容：」", hist[0].periodText, "登記日期 115年6月11日至 115年6月20日之買賣案件");
  eq("空 HTML 回空陣列", P.parseHistoryList("<table></table>"), []);
  eq("前期 zip 網址", P.lvrHistoryZipUrl("20260701"), "https://plvr.land.moi.gov.tw//DownloadHistory?type=history&fileName=20260701");

  console.log("=== I3 期間篩選（實價登入主要顯示半年、依年度查詢）===");
  eq("近 6 個月的起算日", L.monthsAgoIso(6, "2026-09-30"), "2026-03-30");
  eq("預設（不給 period）＝近 6 個月", L.periodWhere(undefined, "2026-09-30"), { sql: "deal_date >= ?", params: ["2026-03-30"] });
  eq("recent6m 顯式給也一樣", L.periodWhere("recent6m", "2026-09-30"), { sql: "deal_date >= ?", params: ["2026-03-30"] });
  eq("給民國年＝那一整年", L.periodWhere("115", "2026-09-30"), {
    sql: "deal_date BETWEEN ? AND ?",
    params: ["2026-01-01", "2026-12-31"],
  });
  eq("114 年＝2025 整年", L.periodWhere("114", "2026-09-30"), {
    sql: "deal_date BETWEEN ? AND ?",
    params: ["2025-01-01", "2025-12-31"],
  });
  eq("亂打的字串 fallback 回近 6 個月", L.periodWhere("abc", "2026-09-30"), { sql: "deal_date >= ?", params: ["2026-03-30"] });
  eq("HTML 不是 zip", L.looksLikeZip(new TextEncoder().encode("<table>…</table>")), false);
  eq("PK 檔頭是 zip", L.looksLikeZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0])), true);
}

console.log("=== J zip（stored 與 deflate）===");
{
  const { deflateRawSync } = await import("node:zlib");
  const name = Buffer.from("b_lvr_land_a.csv");
  const content = Buffer.from(`${HEADER}\nen\n${ROW}\n`);
  const comp = deflateRawSync(content);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(name.length, 26);
  const cdir = Buffer.alloc(46);
  cdir.writeUInt32LE(0x02014b50, 0);
  cdir.writeUInt16LE(8, 10);
  cdir.writeUInt32LE(comp.length, 20);
  cdir.writeUInt32LE(content.length, 24);
  cdir.writeUInt16LE(name.length, 28);
  cdir.writeUInt32LE(0, 42);
  const cdOffset = local.length + name.length + comp.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cdir.length + name.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  const zip = Buffer.concat([local, name, comp, cdir, name, eocd]);
  const parsed = P.parseLvrZip(new Uint8Array(zip));
  eq("自製 zip 解得出一筆", parsed.deals.length, 1);
  eq("沒有 build_time.xml 期程是空字串", parsed.periodText, "");
}

if (process.argv.includes("--live")) {
  console.log("=== LIVE 下載本期 zip ===");
  const res = await fetch(P.LVR_CURRENT_ZIP_URL);
  const bytes = new Uint8Array(await res.arrayBuffer());
  console.log(`  HTTP ${res.status}，${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB`);
  const { deals: live, periodText } = P.parseLvrZip(bytes);
  console.log(`  期程：${periodText}`);
  const by = {};
  for (const x of live) by[`${x.district}/${x.kind}`] = (by[`${x.district}/${x.kind}`] || 0) + 1;
  console.log("  四區筆數：", by);
  const noDate = live.filter((x) => !x.dealDate).length;
  ok(live.length > 0, "四區至少有一筆", live.length, ">0");
  ok(noDate === 0, "每筆都有交易日", noDate, "0");
}

console.log(pass ? "\n全部通過 ✅" : "\n有失敗 ❌");
process.exit(pass ? 0 : 1);
