/**
 * 屋主建檔的煙霧測試 —— 「整批貼上」解析器與欄位驗證。不碰資料庫、不連網。
 * 用法：node --experimental-strip-types scripts/check-owners.mjs
 * 改 src/lib/owners-import.ts 或 src/lib/owners.ts 的驗證前後都跑一次。
 *
 * ⚠️ 測試資料全是編的（姓名、電話、地址都不是真人），repo 是公開的，別放真資料。
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const I = await import("../src/lib/owners-import.ts");
const O = await import("../src/lib/owners.ts");

let pass = true;
const ok = (cond, label, got, want) => {
  if (!cond) pass = false;
  console.log(
    `${cond ? "  ✅" : "  ❌"} ${String(label).padEnd(40)} ${JSON.stringify(got).slice(0, 70).padEnd(40)}${cond ? "" : " 應為 " + JSON.stringify(want)}`,
  );
};

console.log("A. 分隔符與欄位順序");
{
  const rows = I.parseImportText("測試甲\t0912-000-111\t台中市測試區假路 1 號\t假社區\t急售");
  ok(rows.length === 1, "Tab 分隔一行一筆", rows.length, 1);
  ok(rows[0].owner.name === "測試甲", "姓名", rows[0].owner.name, "測試甲");
  ok(rows[0].owner.phone === "0912-000-111", "電話", rows[0].owner.phone, "0912-000-111");
  ok(rows[0].property?.address === "台中市測試區假路 1 號", "房子地址", rows[0].property?.address, "台中市測試區假路 1 號");
  ok(rows[0].property?.community === "假社區", "社區名", rows[0].property?.community, "假社區");
  ok(rows[0].owner.note === "急售", "備註", rows[0].owner.note, "急售");
  ok(rows[0].error === null, "沒有錯誤", rows[0].error, null);
}
{
  const rows = I.parseImportText("測試乙,0922000222,測試區假街 2 巷 3 號");
  ok(rows[0].owner.phone === "0922000222", "逗號分隔", rows[0].owner.phone, "0922000222");
  ok(rows[0].property?.address === "測試區假街 2 巷 3 號", "地址含空白不被切開", rows[0].property?.address, "測試區假街 2 巷 3 號");
}
{
  const rows = I.parseImportText("測試丙、0933000333、假路 5 號");
  ok(rows[0].owner.phone === "0933000333", "頓號分隔", rows[0].owner.phone, "0933000333");
}
{
  const rows = I.parseImportText("測試丁");
  ok(rows[0].owner.name === "測試丁" && rows[0].property === null && rows[0].error === null, "只有姓名也收", rows[0], "ok");
}

console.log("B. 自動辨識電話／地址放反");
{
  const rows = I.parseImportText("測試戊\t假區假路 9 號\t0944-000-444");
  ok(rows[0].owner.phone === "0944-000-444", "電話在第 3 欄會調回來", rows[0].owner.phone, "0944-000-444");
  ok(rows[0].property?.address === "假區假路 9 號", "地址調到房子", rows[0].property?.address, "假區假路 9 號");
}
{
  const rows = I.parseImportText("測試己,假區假路 10 號");
  ok(rows[0].owner.phone === "", "兩欄且第 2 欄是地址：沒電話", rows[0].owner.phone, "");
  ok(rows[0].property?.address === "假區假路 10 號", "第 2 欄當地址", rows[0].property?.address, "假區假路 10 號");
}
{
  const rows = I.parseImportText("測試庚,abc");
  ok(rows[0].error !== null, "第 2 欄不像電話也不像地址 → 報錯", rows[0].error, "非 null");
}

console.log("C. 空行、標題列、Windows 換行");
{
  const rows = I.parseImportText("姓名\t電話\t地址\r\n\r\n測試辛\t0955000555\r\n測試壬\t0966000666\r\n");
  ok(rows.length === 2, "跳過標題列與空行", rows.length, 2);
  ok(rows[0].line === 3 && rows[1].line === 4, "行號照原文", [rows[0].line, rows[1].line], [3, 4]);
}
{
  const rows = I.parseImportText("\t0977000777");
  ok(rows[0].error === "缺姓名", "沒姓名報錯", rows[0].error, "缺姓名");
}

console.log("D. 欄位驗證");
{
  const r = O.validateOwnerInput({ name: "  ", phone: "", phone2: "", lineId: "", address: "", source: "", birthday: "", tags: "", note: "" });
  ok(!r.ok, "姓名空白擋下", r.ok, false);
}
{
  const r = O.validateOwnerInput({ name: "測試", phone: "", phone2: "", lineId: "", address: "", source: "", birthday: "2026/1/1", tags: "", note: "" });
  ok(!r.ok, "生日格式錯擋下", r.ok, false);
}
{
  const r = O.validateOwnerInput({ name: "測試", phone: "", phone2: "", lineId: "", address: "", source: "", birthday: "", tags: "投資客, 海線、急售 投資客", note: "" });
  ok(r.ok && r.value.tags === "投資客,海線,急售", "標籤分隔＋去重", r.ok && r.value.tags, "投資客,海線,急售");
}
{
  const r = O.validatePropertyInput({ ownerId: "x", address: "假路 1 號", community: "", kind: "", layout: "", area: "", floor: "", status: "nope", dealDate: "", price: "", note: "" });
  ok(!r.ok, "不合法狀態擋下", r.ok, false);
}
{
  const r = O.validatePropertyInput({ ownerId: "x", address: "假路 1 號", community: "", kind: "", layout: "", area: "", floor: "", status: "sold", dealDate: "2025-03-01", price: "1,280 萬", note: "" });
  ok(r.ok && r.value.status === "sold", "合法房子通過", r.ok, true);
}
{
  const r = O.validateContactLogInput({ ownerId: "x", contactedAt: "2026-10-12", method: "電話", content: "   " });
  ok(!r.ok, "聯絡內容空白擋下", r.ok, false);
}
{
  ok(O.phoneDigits("(04) 2626-1234") === "0426261234", "電話只留數字", O.phoneDigits("(04) 2626-1234"), "0426261234");
  const half = "🏠".slice(0, 1);
  ok(!/[\uD800-\uDBFF]$/.test(O.cut("abc" + half, 10)), "cut 不留半個 emoji", O.cut("abc" + half, 10), "abc");
}

console.log("E. 合約欄位與到期提醒");
const T = await import("../src/lib/owners-text.ts");
{
  const base = { ownerId: "x", address: "假路 1 號", community: "", kind: "", layout: "", area: "", floor: "", status: "listing", dealDate: "", price: "", note: "" };
  const r1 = O.validatePropertyInput({ ...base, contractNo: "A-001", contractStart: "2026-01-01", contractEnd: "2026-12-31" });
  ok(r1.ok && r1.value.contractNo === "A-001" && r1.value.contractEnd === "2026-12-31", "合約欄位通過", r1.ok, true);
  const r2 = O.validatePropertyInput({ ...base, contractNo: "", contractStart: "2026-12-31", contractEnd: "2026-01-01" });
  ok(!r2.ok, "迄日早於起日擋下", r2.ok, false);
  const r3 = O.validatePropertyInput({ ...base, contractNo: "", contractStart: "", contractEnd: "2026/1/1" });
  ok(!r3.ok, "迄日格式錯擋下", r3.ok, false);
  const r4 = O.validatePropertyInput({ ...base, contractNo: "", contractStart: "", contractEnd: "" });
  ok(r4.ok, "合約全空也可以", r4.ok, true);
  const r5 = O.validatePropertyInput({ ...base, contractNo: "", contractStart: "", contractEnd: "", contractType: "exclusive" });
  ok(r5.ok && r5.value.contractType === "exclusive", "合約類型專約通過", r5.ok, true);
  const r6 = O.validatePropertyInput({ ...base, contractNo: "", contractStart: "", contractEnd: "", contractType: "vip" });
  ok(!r6.ok, "不認得的合約類型擋下", r6.ok, false);
}
{
  const d1 = O.validateDelistInput({ propertyId: "p", reason: "self_sold", amount: "", note: "", delistedAt: "2026-10-12" });
  ok(!d1.ok, "自行成交沒填金額擋下", d1.ok, false);
  const d2 = O.validateDelistInput({ propertyId: "p", reason: "self_sold", amount: "1,200 萬", note: "", delistedAt: "2026-10-12" });
  ok(d2.ok && d2.value.amount === "1,200 萬", "自行成交有金額通過", d2.ok, true);
  const d3 = O.validateDelistInput({ propertyId: "p", reason: "owner_keep", amount: "999", note: "改自住", delistedAt: "2026-10-12" });
  ok(d3.ok && d3.value.amount === "" && d3.value.note === "改自住", "屋主不賣：金額清掉、備註留著", d3.ok && d3.value, "amount 空");
  const d4 = O.validateDelistInput({ propertyId: "p", reason: "nope", amount: "", note: "", delistedAt: "2026-10-12" });
  ok(!d4.ok, "不認得的原因擋下", d4.ok, false);
}
{
  ok(T.addDays("2026-10-12", 7) === "2026-10-19", "addDays +7", T.addDays("2026-10-12", 7), "2026-10-19");
  ok(T.addDays("2026-12-28", 7) === "2027-01-04", "addDays 跨年", T.addDays("2026-12-28", 7), "2027-01-04");
  ok(T.daysBetween("2026-10-12", "2026-10-19") === 7, "daysBetween 7", T.daysBetween("2026-10-12", "2026-10-19"), 7);
  ok(T.contractDueLabel("2026-10-12", "2026-10-19") === "剩 7 天", "剩 7 天", T.contractDueLabel("2026-10-12", "2026-10-19"), "剩 7 天");
  ok(T.contractDueLabel("2026-10-12", "2026-10-12") === "今天到期", "今天到期", T.contractDueLabel("2026-10-12", "2026-10-12"), "今天到期");
  ok(T.contractDueLabel("2026-10-12", "2026-10-10") === "已過期 2 天", "已過期", T.contractDueLabel("2026-10-12", "2026-10-10"), "已過期 2 天");
  const text = T.buildContractReminderText(
    "2026-10-12",
    [
      { ownerName: "測試甲", ownerPhone: "0900-000-001", address: "假區假路 1 號", community: "假社區", contractNo: "A-001", contractStart: "2026-01-01", contractEnd: "2026-10-19" },
      { ownerName: "測試乙", ownerPhone: null, address: "假區假路 2 號", community: null, contractNo: null, contractStart: null, contractEnd: "2026-10-12" },
    ],
    "https://weikaihouse.com/",
  );
  ok(text.startsWith("📄 委託合約到期提醒（2 件）"), "訊息標題含件數", text.split("\n")[0], "📄 委託合約到期提醒（2 件）");
  ok(text.includes("測試甲｜0900-000-001") && text.includes("假社區｜假區假路 1 號"), "第一件：姓名電話社區地址", text.includes("測試甲｜0900-000-001"), true);
  ok(text.includes("合約 A-001：115/01/01 ～ 115/10/19（剩 7 天）"), "第一件：合約行（民國年）", text.match(/合約 A-001[^\n]*/)?.[0], "115/01/01 ～ 115/10/19");
  ok(text.includes("合約：？ ～ 115/10/12（今天到期）"), "第二件：沒編號沒起日（民國年）", text.match(/合約：[^\n]*/)?.[0], "？ ～ 115/10/12");
  ok(text.endsWith("https://weikaihouse.com/admin/owners?openExternalBrowser=1"), "結尾連結帶 openExternalBrowser", text.slice(-40), "…?openExternalBrowser=1");
  ok(text.length < 5000, "訊息長度在 LINE 上限內", text.length, "<5000");
}

console.log("F. 統計：委託日與年／月計數");
const S = await import("../src/lib/owners-stats.ts");
{
  ok(S.pickCommissionDay({ contractStart: "2026-09-03", dealDate: "2026-10-01", createdAt: "2026-10-12T00:00:00.000Z" }).day === "2026-09-03", "委託日優先用合約起日", S.pickCommissionDay({ contractStart: "2026-09-03", dealDate: "2026-10-01", createdAt: "x" }), "2026-09-03");
  ok(S.pickCommissionDay({ contractStart: null, dealDate: "2026-10-01", createdAt: "2026-10-12T00:00:00.000Z" }).daySource === "dealDate", "沒合約起日 → 委託／成交日", null, "dealDate");
  const c = S.pickCommissionDay({ contractStart: null, dealDate: null, createdAt: "2026-10-12T05:00:00.000Z" });
  ok(c.day === "2026-10-12" && c.daySource === "createdAt", "都沒有 → 建檔日（只取日期）", c, "2026-10-12/createdAt");
  ok(S.pickCommissionDay({ contractStart: null, dealDate: null, createdAt: null }).day === null, "三個都沒有 → null", null, null);
}
{
  const rows = [
    { day: "2026-09-03", daySource: "contractStart", contractType: "exclusive", kind: "透天", status: "listing" },
    { day: "2026-09-22", daySource: "contractStart", contractType: "general", kind: "大樓", status: "listing" },
    { day: "2026-10-01", daySource: "contractStart", contractType: "general", kind: "土地", status: "delisted" },
    { day: "2025-12-15", daySource: "contractStart", contractType: null, kind: "", status: "sold" },
    { day: null, daySource: null, contractType: "general", kind: "", status: "listing" },
  ];
  const y = S.countByYear(rows);
  ok(y.map((c) => c.key).join(",") === "2026,2025", "年度新到舊", y.map((c) => c.key), "2026,2025");
  ok(y[0].total === 3 && y[0].exclusive === 1 && y[0].general === 2 && y[0].land === 1, "2026：3 件、專約 1、一般 2、土地 1", y[0], "3/1/2/1");
  ok(y[1].total === 1 && y[1].untyped === 1, "2025：1 件、未選類型 1", y[1], "1/untyped 1");
  const m = S.countByMonth(rows, "2026");
  ok(m.length === 12 && m[8].total === 2 && m[9].total === 1 && m[0].total === 0, "2026 每月 12 格：9 月 2、10 月 1、1 月 0", m.map((c) => c.total), "[0,0,0,0,0,0,0,0,2,1,0,0]");
  ok(m[8].key === "2026-09", "月 key 格式 YYYY-MM", m[8].key, "2026-09");
  ok(S.yearsWithData(rows, "2026-10-13").join(",") === "2026,2025", "有資料的年份新到舊", S.yearsWithData(rows, "2026-10-13"), "2026,2025");
  ok(S.yearsWithData([], "2026-10-13").join(",") === "2026", "沒資料回今年", S.yearsWithData([], "2026-10-13"), "2026");
  ok(S.countByMonth(rows, "2026").reduce((n, c) => n + c.total, 0) === y[0].total, "每月加總＝該年總數", null, true);
}

console.log("G. 民國年轉換");
{
  ok(T.toRoc("2026-03-31") === "115/03/31", "西元→民國", T.toRoc("2026-03-31"), "115/03/31");
  ok(T.toRoc("1982-07-18") === "71/07/18", "生日 1982 → 71", T.toRoc("1982-07-18"), "71/07/18");
  ok(T.toRoc("") === "" && T.toRoc(null) === "", "空值回空字串", [T.toRoc(""), T.toRoc(null)], "");
  ok(T.toRoc("壞資料") === "壞資料", "不是日期原樣回", T.toRoc("壞資料"), "壞資料");
  const cases = [
    ["115/3/31", "2026-03-31"], ["115-03-31", "2026-03-31"], ["115.3.31", "2026-03-31"], ["1150331", "2026-03-31"],
    ["民國115年3月31日", "2026-03-31"], ["71/7/18", "1982-07-18"], ["710718", null],
    ["2026/3/31", "2026-03-31"], ["2026-03-31", "2026-03-31"], ["20260331", "2026-03-31"], ["2026年3月31日", "2026-03-31"],
    ["115/2/30", null], ["115/13/1", null], ["abc", null], ["", ""],
  ];
  for (const [input, want] of cases) {
    const got = T.parseDateInput(input);
    ok(got === want, `parseDateInput(${JSON.stringify(input)})`, got, want);
  }
}

console.log("H. 同名／同電話屋主警示");
{
  const existing = [
    { id: "a", name: "王 小明", phone: "0912-000-111", phone2: null },
    { id: "b", name: "陳小姐", phone: null, phone2: "04-2626-1234" },
    { id: "c", name: "Lin", phone: "", phone2: "" },
  ];
  ok(T.normalizeName("王　小 明") === "王小明", "姓名去全形半形空白", T.normalizeName("王　小 明"), "王小明");
  const d1 = T.findDuplicateOwners(existing, "王小明", "");
  ok(d1.length === 1 && d1[0].id === "a" && d1[0].reason === "name", "同名（空白不同也算）", d1, "a/name");
  const d2 = T.findDuplicateOwners(existing, "別人", "0912000111");
  ok(d2.length === 1 && d2[0].id === "a" && d2[0].reason === "phone", "不同名但同電話", d2, "a/phone");
  const d3 = T.findDuplicateOwners(existing, "別人", "0426261234");
  ok(d3.length === 1 && d3[0].id === "b", "第二電話也比", d3, "b");
  ok(T.findDuplicateOwners(existing, "lin", "").length === 1, "英文不分大小寫", null, 1);
  ok(T.findDuplicateOwners(existing, "王小明", "", "a").length === 0, "編輯自己時排除自己", null, 0);
  ok(T.findDuplicateOwners(existing, "沒有的人", "").length === 0, "沒撞到", null, 0);
  ok(T.findDuplicateOwners(existing, "沒有的人", "123").length === 0, "電話太短不比（避免誤判）", null, 0);
  ok(T.findDuplicateOwners(existing, "王小明", "0912000111").length === 1, "同名又同電話只回一筆", null, 1);
}

console.log(pass ? "\n全部通過 ✅" : "\n有紅的 ❌");
process.exit(pass ? 0 : 1);
