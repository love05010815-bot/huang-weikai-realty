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
  ok(text.includes("合約 A-001：2026/01/01 ～ 2026/10/19（剩 7 天）"), "第一件：合約行", text.includes("合約 A-001"), true);
  ok(text.includes("合約：？ ～ 2026/10/12（今天到期）"), "第二件：沒編號沒起日", text.includes("合約：？"), true);
  ok(text.endsWith("https://weikaihouse.com/admin/owners?openExternalBrowser=1"), "結尾連結帶 openExternalBrowser", text.slice(-40), "…?openExternalBrowser=1");
  ok(text.length < 5000, "訊息長度在 LINE 上限內", text.length, "<5000");
}

console.log(pass ? "\n全部通過 ✅" : "\n有紅的 ❌");
process.exit(pass ? 0 : 1);
