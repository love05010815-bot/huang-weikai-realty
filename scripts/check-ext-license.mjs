/**
 * 迴歸測試：同事版外掛授權碼 —— 純邏輯（src/lib/ext-license-core.ts）＋外掛端的快取／離線規則
 * （tools/post591-extension/license.js）。不碰資料庫、不連網。
 * 用法：node --experimental-strip-types scripts/check-ext-license.mjs
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const core = await import("../src/lib/ext-license-core.ts");
await import(new URL("../tools/post591-extension/license.js", import.meta.url).href); // 掛到 globalThis.P591License
const L = globalThis.P591License;

let pass = true;
const ok = (cond, label, got, want) => {
  console.log(`  ${cond ? "✅" : "❌"} ${label.padEnd(30)} ${got ?? ""}${cond ? "" : `   ← 應為 ${want}`}`);
  if (!cond) pass = false;
};
const eq = (label, got, want) => ok(got === want, label, JSON.stringify(got), JSON.stringify(want));
const END_0920 = new Date("2026-09-20T15:59:59.000Z");
function row(over) {
  return { id: "1", key: "WK-ABCD-EFGH-JKLM", name: "測試", installId: null, boundAt: null, lastSeenAt: null, lastVersion: null, expiresAt: END_0920, revokedAt: null, createdAt: new Date("2026-09-11T00:00:00Z"), ...over };
}

console.log("A. 授權碼格式");
{
  const fixedRand = (n) => new Uint8Array(n).map((_, i) => i * 7);
  const k = core.generateLicenseKey(fixedRand);
  ok(core.LICENSE_KEY_RE.test(k), "產出符合 WK-XXXX-XXXX-XXXX", k, "regex");
  eq("固定亂數可重現", k, core.generateLicenseKey(fixedRand));
  ok(!/[01OI]/.test(k), "沒有 0/1/O/I", k, "");
  eq("整理：小寫＋空白＋沒連字號", core.normalizeLicenseKey(" wk abcd efgh jklm "), "WK-ABCD-EFGH-JKLM");
  eq("整理：全形", core.normalizeLicenseKey("ＷＫ－ＡＢＣＤ－ＥＦＧＨ－ＪＫＬＭ"), "WK-ABCD-EFGH-JKLM");
  eq("整理：長劃連字號", core.normalizeLicenseKey("WK—ABCD—EFGH—JKLM"), "WK-ABCD-EFGH-JKLM");
  eq("整理：亂打就原樣大寫", core.normalizeLicenseKey("abc"), "ABC");
  eq("預設到期日", core.LICENSE_DEFAULT_EXPIRES, "2026-09-20");
}

console.log("B. 台灣日期");
{
  const end = core.taiwanDateEnd("2026-09-20");
  eq("9/20 結束 = UTC 15:59:59", end.toISOString(), "2026-09-20T15:59:59.000Z");
  eq("顯示回台灣日期", core.taiwanDate(end), "2026-09-20");
  eq("9/21 00:00 台灣：過期", core.decideLicense(row(), "A", new Date("2026-09-20T16:00:00Z")).ok, false);
  eq("9/20 23:59 台灣：還有效", core.decideLicense(row(), "A", new Date("2026-09-20T15:59:00Z")).ok, true);
  eq("無效日期回 null", core.taiwanDateEnd("2026-02-30"), null);
  eq("格式錯回 null", core.taiwanDateEnd("9/20"), null);
}

console.log("C. 判定順序");
{
  const now = new Date("2026-09-12T00:00:00Z");
  eq("找不到 → no_key", core.decideLicense(null, "A", now).reason, "no_key");
  eq("沒綁 → ok 並綁定", JSON.stringify(core.decideLicense(row(), "A", now)), JSON.stringify({ ok: true, bind: true }));
  eq("同一台 → ok 不再綁", JSON.stringify(core.decideLicense(row({ installId: "A" }), "A", now)), JSON.stringify({ ok: true, bind: false }));
  eq("別台 → bound_elsewhere", core.decideLicense(row({ installId: "A" }), "B", now).reason, "bound_elsewhere");
  eq("停用優先於綁定", core.decideLicense(row({ installId: "A", revokedAt: now }), "B", now).reason, "revoked");
  eq("過期優先於綁定", core.decideLicense(row({ installId: "A" }), "B", new Date("2026-10-01T00:00:00Z")).reason, "expired");
  eq("安裝編號：UUID 可", core.isValidInstallId("3b2f0c4e-1d2a-4f6b-9c8d-0a1b2c3d4e5f"), true);
  eq("安裝編號：亂碼不可", core.isValidInstallId("<script>"), false);
}

console.log("D. 外掛端快取／離線規則");
const OKBODY = { ok: true, name: "測試", expiresAt: "2026-09-20T15:59:59.000Z", expiresText: "2026-09-20", bound: true };
function makeExt(serverQueue, startIso = "2026-09-12T00:00:00Z") {
  const store = {};
  const calls = [];
  const storage = { get: async (k) => ({ [k]: store[k] }), set: async (o) => Object.assign(store, o) };
  let t = Date.parse(startIso);
  const fetchFn = async (_url, opts) => {
    calls.push(JSON.parse(opts.body));
    const next = serverQueue.shift();
    if (!next || next.throw) throw new Error("network");
    return { status: next.status || 200, json: async () => next.body };
  };
  const lic = L.create({ storage, fetch: fetchFn, now: () => t, uuid: () => "uuid-1", version: "1.5.0" });
  return { lic, calls, store, tick: (ms) => (t += ms) };
}
const H = 60 * 60 * 1000, D = 24 * H;
{
  const { lic, calls, tick } = makeExt([{ body: OKBODY }, { body: { ok: false, reason: "bound_elsewhere" } }]);
  eq("沒填碼 → no_key_set", (await lic.check()).reason, "no_key_set");
  const r1 = await lic.setKey("wk-abcd-efgh-jklm");
  eq("填碼後立刻驗：ok", r1.ok + "/" + r1.name + "/" + r1.expiresText, "true/測試/2026-09-20");
  eq("送出的碼原樣（整理在伺服器）", calls[0].key, "wk-abcd-efgh-jklm");
  eq("帶安裝編號與版本", calls[0].installId + "/" + calls[0].version, "uuid-1/1.5.0");
  tick(1 * H);
  const r2 = await lic.check();
  eq("1 小時內：用快取不打伺服器", r2.cached + "/" + calls.length, "true/1");
  const r2f = await lic.check({ force: true });
  eq("force：重新驗（伺服器說綁在別台）", r2f.ok + "/" + r2f.reason + "/" + calls.length, "false/bound_elsewhere/2");
  const r3 = await lic.check();
  eq("不 ok 不快取：再問（沒伺服器 → offline）", r3.ok + "/" + r3.reason, "false/offline");
}
{
  const { lic, tick } = makeExt([{ body: OKBODY }, { throw: true }, { throw: true }]);
  await lic.setKey("WK-ABCD-EFGH-JKLM");
  tick(7 * H);
  const r = await lic.check();
  eq("連不上：3 天內驗過 ok 先放行", r.ok + "/" + !!r.offline, "true/true");
  tick(4 * D);
  const r2 = await lic.check();
  eq("連不上超過 3 天：擋（offline）", r2.ok + "/" + r2.reason, "false/offline");
}
{
  const { lic, tick } = makeExt([{ body: OKBODY }, { throw: true }]);
  await lic.setKey("WK-ABCD-EFGH-JKLM");
  tick(9 * D); // 9/21
  const r = await lic.check();
  eq("離線且上次到期日已過：擋（expired）", r.ok + "/" + r.reason + "/" + r.expiresText, "false/expired/2026-09-20");
}
{
  // 9/20 20:00 台灣驗過 ok，9/21 01:00 台灣（5 小時後、快取還新）→ 不能拿快取放行
  const { lic, tick } = makeExt([{ body: OKBODY }, { throw: true }], "2026-09-20T12:00:00Z");
  await lic.setKey("WK-ABCD-EFGH-JKLM");
  tick(5 * H);
  const r = await lic.check();
  eq("快取還新但到期日已過：不放行", r.ok + "/" + r.reason, "false/expired");
}
{
  const { lic } = makeExt([{ status: 500, body: {} }]);
  await lic.setKey("WK-ABCD-EFGH-JKLM");
  eq("伺服器 500 且沒驗過：offline", (await lic.check()).reason, "offline");
}
{
  const { lic } = makeExt([{ status: 429, body: { ok: false, reason: "rate_limited" } }]);
  eq("限流當連不上處理", (await lic.setKey("WK-ABCD-EFGH-JKLM")).reason, "offline");
}
{
  const later = { ...OKBODY, expiresAt: "2026-10-31T15:59:59.000Z", expiresText: "2026-10-31" };
  const { lic, tick } = makeExt([{ body: OKBODY }, { body: { ok: false, reason: "expired", expiresText: "2026-09-20" } }, { body: later }]);
  await lic.setKey("WK-ABCD-EFGH-JKLM");
  tick(9 * D);
  const r = await lic.check();
  eq("線上到期：伺服器說 expired", r.reason, "expired");
  const r2 = await lic.check();
  eq("後台延長後：下一次驗就恢復", r2.ok + "/" + r2.expiresText, "true/2026-10-31");
}
{
  const { lic, store } = makeExt([{ body: OKBODY }]);
  await lic.setKey("WK-ABCD-EFGH-JKLM");
  eq("安裝編號存起來、下次同一個", store["p591:installId"] + "/" + (await lic.installId()), "uuid-1/uuid-1");
  await lic.setKey("");
  eq("清掉授權碼 → no_key_set", (await lic.check()).reason, "no_key_set");
}

console.log("E. 訊息");
for (const reason of ["no_key_set", "no_key", "revoked", "expired", "bound_elsewhere", "offline", "server_error", "bad_request", "rate_limited"]) {
  const m = L.message({ ok: false, reason });
  ok(m.length > 5, `有中文說明：${reason}`, m.slice(0, 22) + "…", "");
}
eq("到期帶日期", L.message({ ok: false, reason: "expired", expiresText: "2026-09-20" }), "授權已於 2026-09-20 到期，請找黃瑋凱延長。");
eq("ok 沒訊息", L.message({ ok: true }), "");

console.log("");
console.log(pass ? "✅ 授權碼：規則全部一致" : "❌ 有差異，不要往下做");
process.exit(pass ? 0 : 1);
