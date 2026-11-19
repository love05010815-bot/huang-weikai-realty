/**
 * 迴歸測試：統一發票兌獎（src/lib/invoice-lottery.ts）。
 * 用法：node --experimental-strip-types scripts/check-invoice-lottery.mjs
 * 改解析或對獎規則前後都跑一次。樣本是 2026-11-19 從財政部抓下來的原始頁：
 *   fixtures/invoice-latest.html（115 年 7–8 月）、invoice-previous.html（115 年 5–6 月）、invoice-rss.xml（近六期）
 */
import fs from "node:fs";
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const L = await import("../src/lib/invoice-lottery.ts");

const read = (name) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

let pass = true;
const ok = (cond, label, got = "") => {
  if (!cond) pass = false;
  console.log(`${cond ? "  ✅" : "  ❌"} ${label}${cond ? "" : "　→ 拿到 " + JSON.stringify(got)}`);
};
const eq = (got, want, label) => ok(JSON.stringify(got) === JSON.stringify(want), label, got);

console.log("=== A 解析官方中獎號碼單 ===");
const latestR = L.parseInvoiceHtml(read("invoice-latest.html"));
const prevR = L.parseInvoiceHtml(read("invoice-previous.html"));
ok(latestR.ok, "最新一期解析成功", latestR);
ok(prevR.ok, "上一期解析成功", prevR);
const latest = latestR.value;
const prev = prevR.value;
eq([latest.rocYear, latest.firstMonth, latest.label], [115, 7, "115 年 7–8 月"], "最新一期是 115 年 7–8 月");
eq(latest.special, "89996565", "特別獎 89996565");
eq(latest.grand, "91098182", "特獎 91098182");
eq(latest.firsts, ["54348835", "44991397", "06595111"], "頭獎三組（前 5 碼＋末 3 碼兩個 span 要接起來、開頭的 0 不能掉）");
eq(latest.extraSixth, [], "這一期沒有增開六獎");
eq([latest.claimFrom, latest.claimTo], ["2026-10-06", "2027-01-05"], "領獎期間 115/10/06～116/01/05");
eq([prev.rocYear, prev.firstMonth], [115, 5], "上一期是 115 年 5–6 月（兩頁選單一樣，靠 etw-on 認）");
eq(prev.firsts, ["24121106", "28589937", "83663333"], "上一期頭獎三組");
eq([prev.claimFrom, prev.claimTo], ["2026-08-06", "2026-11-05"], "上一期領獎期間 115/08/06～115/11/05");

console.log("=== B 官方改版要壞得很明顯 ===");
ok(!L.parseInvoiceHtml("<html><body>維護中</body></html>").ok, "不是號碼單 → 失敗");
ok(!L.parseInvoiceHtml(read("invoice-latest.html").replace(/etw-on/g, "etw-off")).ok, "認不出期別 → 失敗");
ok(!L.parseInvoiceHtml(read("invoice-latest.html").replace(/89996565/g, "8999656")).ok, "特別獎只有 7 碼 → 失敗");
ok(!L.parseInvoiceHtml(read("invoice-latest.html").replace(/etw-tbiggest/g, "etw-big")).ok, "號碼的 class 改名 → 失敗（不會拿到空號碼）");
{
  // 哪一期又有增開六獎：照頭獎那列的寫法多一列
  const withExtra = read("invoice-latest.html").replace(
    "</tbody>",
    '<tr><td class="text-center">增開六獎</td><td><p class="etw-tbiggest"><span class="fw-bold etw-color-red">042</span>、<span class="fw-bold etw-color-red">987</span></p></td></tr></tbody>',
  );
  const r = L.parseInvoiceHtml(withExtra);
  eq(r.ok && r.value.extraSixth, ["042", "987"], "增開六獎那列收得進來");
}

console.log("=== C 解析 RSS（備援）===");
const rssR = L.parseInvoiceRss(read("invoice-rss.xml"));
ok(rssR.ok && rssR.value.length === 6, "讀到六期", rssR.ok ? rssR.value.length : rssR);
const rss = rssR.value;
eq([rss[0].rocYear, rss[0].firstMonth, rss[0].special, rss[0].grand], [115, 7, "89996565", "91098182"], "第一筆是 115 年 7–8 月，特獎沒吃到特別獎那段");
eq(rss[0].firsts, latest.firsts, "RSS 頭獎跟號碼單一致");
eq([rss[1].special, rss[1].grand, rss[1].firsts], [prev.special, prev.grand, prev.firsts], "RSS 第二筆跟上一期號碼單一致");
eq([rss[4].rocYear, rss[4].firstMonth, rss[4].grand], [114, 11, "00507588"], "114 年 11–12 月，特獎開頭兩個 0 沒掉");
eq(rss[0].claimFrom, null, "RSS 沒有領獎期間");
ok(!L.parseInvoiceRss("<rss></rss>").ok, "空的 RSS → 失敗");

console.log("=== D 完整 8 碼對獎（115 年 7–8 月）===");
const full = (n) => {
  const w = L.checkFull(n, latest);
  return w ? [w.prize, w.amount] : null;
};
eq(full("89996565"), ["special", 10_000_000], "特別獎 1,000 萬");
eq(full("91098182"), ["grand", 2_000_000], "特獎 200 萬");
eq(full("54348835"), ["first", 200_000], "頭獎 20 萬");
eq(full("14348835"), ["second", 40_000], "末 7 碼 → 二獎 4 萬");
eq(full("10348835"), ["third", 10_000], "末 6 碼 → 三獎 1 萬");
eq(full("10048835"), ["fourth", 4_000], "末 5 碼 → 四獎 4 千");
eq(full("10008835"), ["fifth", 1_000], "末 4 碼 → 五獎 1 千");
eq(full("10000835"), ["sixth", 200], "末 3 碼 → 六獎 200");
eq(full("10000111"), ["sixth", 200], "第三組頭獎的末 3 碼也算");
eq(full("19996565"), null, "只差特別獎第一碼 → 沒中（特別獎沒有末幾碼的獎）");
eq(full("11098182"), null, "只差特獎第一碼 → 沒中");
eq(full("54348836"), null, "頭獎最後一碼不同 → 沒中（要從尾巴連續相同）");
eq(full("54348035"), null, "頭獎前 5 碼對、倒數第 3 碼錯 → 沒中");
eq(full("1234567"), null, "不是 8 碼 → null");
eq(L.checkFull("24121106", latest), null, "上一期的頭獎拿來對這一期 → 沒中");
{
  // 同時對中兩個獎只領一個：捏一期「特獎末 3 碼＝頭獎末 3 碼」
  const draw = { ...latest, grand: "12345835" };
  eq(L.checkFull("12345835", draw)?.prize, "grand", "同時中特獎與六獎 → 回特獎（獎金高的）");
  const withExtra = { ...latest, extraSixth: ["042"] };
  eq(L.checkFull("77777042", withExtra)?.prize, "extraSixth", "增開六獎末 3 碼 → 200");
  eq(L.checkFull("54348835", { ...latest, extraSixth: ["835"] })?.prize, "first", "頭獎跟增開六獎同時中 → 回頭獎");
}

console.log("=== E 末 3 碼快速對獎 ===");
const tail = (t, d = latest) => {
  const r = L.checkTail(t, d);
  return [r.verdict, r.hits.map((h) => h.kind).join(",")];
};
eq(tail("835"), ["win", "first"], "835 → 中（頭獎第一組）");
eq(tail("397"), ["win", "first"], "397 → 中");
eq(tail("111"), ["win", "first"], "111 → 中");
eq(tail("565"), ["maybe", "special"], "565 只跟特別獎末 3 碼一樣 → 要補完整號碼");
eq(tail("182"), ["maybe", "grand"], "182 只跟特獎末 3 碼一樣 → 要補完整號碼");
eq(tail("000"), ["miss", ""], "000 → 沒中");
eq(tail("83"), ["miss", ""], "不滿 3 碼 → 不判中");
eq(tail("042", { ...latest, extraSixth: ["042"] }), ["win", "extraSixth"], "增開六獎 → 中");
{
  // 末 3 碼說「中」的，補完整號碼後一定至少 200；說「沒中」的，怎麼補都不會中
  let consistent = true;
  for (let i = 0; i < 1000; i++) {
    const t = String(i).padStart(3, "0");
    const verdict = L.checkTail(t, latest).verdict;
    const w = L.checkFull("00000" + t, latest);
    if (verdict === "win" && !w) consistent = false;
    if (verdict === "miss" && w) consistent = false;
    if (verdict === "maybe" && w) consistent = false; // 00000xxx 不會是特別獎／特獎
  }
  ok(consistent, "1,000 種末 3 碼：快速對獎跟完整對獎的結論不打架");
}

console.log("=== F 領獎期間 ===");
eq(L.claimStatus(latest, "2026-10-05"), "notYet", "10/05 還沒開始領");
eq(L.claimStatus(latest, "2026-10-06"), "open", "10/06 第一天");
eq(L.claimStatus(latest, "2027-01-05"), "open", "1/05 最後一天還能領");
eq(L.claimStatus(latest, "2027-01-06"), "expired", "1/06 過期");
eq(L.claimStatus(prev, "2026-11-19"), "expired", "今天（11/19）上一期已過期");
eq(L.claimStatus(rss[0], "2026-11-19"), "unknown", "RSS 來的不知道期間");
eq(L.taipeiToday(new Date("2026-11-19T16:30:00Z")), "2026-11-20", "UTC 16:30 在台灣已經是隔天");
eq(L.rocDateText("2027-01-05"), "116 年 1 月 5 日", "西元轉民國");
eq(L.nextDraw(latest), { firstMonth: 9, drawMonth: 11 }, "7–8 月之後：9–10 月的發票 11/25 開獎");
eq(L.nextDraw({ ...latest, firstMonth: 9 }), { firstMonth: 11, drawMonth: 1 }, "9–10 月之後：11–12 月的發票隔年 1/25 開獎");
eq(L.nextDraw({ ...latest, firstMonth: 11 }), { firstMonth: 1, drawMonth: 3 }, "11–12 月之後：1–2 月的發票 3/25 開獎");

console.log("=== G 顯示 ===");
eq([200, 1000, 4000, 10000, 40000, 200000, 2000000, 10000000].map(L.amountText), ["200 元", "1,000 元", "4,000 元", "1 萬元", "4 萬元", "20 萬元", "200 萬元", "1,000 萬元"], "獎金寫法");
eq(L.onlyDigits("８３5 a-1"), "8351", "全形數字、空白、符號");
{
  // 獎金表要跟官方號碼單印的一致（官方哪天調獎金，這裡會先紅）
  const text = read("invoice-latest.html").replace(/<[^>]+>/g, "").replace(/\s+/g, "");
  const official = { special: "特別獎號碼相同者獎金1,000萬元", grand: "特獎號碼相同者獎金200萬元", first: "頭獎號碼相同者獎金20萬元", second: "末7位相同者各得獎金4萬元", third: "末6位相同者各得獎金1萬元", fourth: "末5位相同者各得獎金4千元", fifth: "末4位相同者各得獎金1千元", sixth: "末3位相同者各得獎金2百元" };
  for (const [key, phrase] of Object.entries(official)) ok(text.includes(phrase), `官方號碼單：${L.PRIZES[key].name} ${phrase.match(/獎金.*/)[0]}`);
  eq([L.PRIZES.fourth.amount, L.PRIZES.fifth.amount, L.PRIZES.sixth.amount], [4000, 1000, 200], "4 千／1 千／2 百 對應的數字");
}

console.log(pass ? "\n✅ 全部通過" : "\n❌ 有項目沒過");
process.exit(pass ? 0 : 1);
