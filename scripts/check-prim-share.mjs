/**
 * 太平洋新系統（PRIM）分享連結的回歸測試。
 *
 *   npm run check:prim
 *
 * ⚠️ **不連網**。用的是 2026-10-14 從 prim.pacific.com.tw 真的抓回來的兩種 API 回應
 * （還在的分享、找不到的分享），它改版之後這支還是會過 —— 它測的是「規則有沒有被改壞」。
 * 線上到底長怎樣，拿 `node --env-file=.env.local` 跑 lib/prim-share.ts 的 fetchPrimShare 看。
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const {
  classifyPrimShare,
  communityFromTitle,
  parsePrimShare,
  primAgeYears,
  primFactsFrom,
  primPoints,
  primShareCode,
  primShareUrl,
  stripCity,
} = await import("@/lib/prim-share.ts");

let pass = 0;
const fails = [];
function eq(name, got, want) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) {
    pass += 1;
    return;
  }
  fails.push(`${name}\n      得到 ${a}\n      應為 ${b}`);
}

/* ── 真實回應（2026-10-14 實測，經紀人那段只留跟判定無關的空殼）── */
const LIVE = {
  status: "success",
  data: {
    share_code: "LV5rC5XJ",
    total: 1,
    items: [
      {
        index: 0,
        is_joint_sale: false,
        obj_no: "S2862747",
        obj_name: "「禾盛晶綻」關連工業區旁輕屋齡2房+平車",
        case_type: 7,
        sell_rent: 1,
        price: "5980000.00",
        rent_price: null,
        address_short: "臺中市梧棲區自強一街",
        ping: "30.129000",
        room: "2.0",
        living: "2.0",
        bathroom: "1.0",
        open_layout: false,
        complete_date: "2019-01-30",
        cover_photo: "https://pacblob.blob.core.windows.net/prim-public/w/4fe59458-7c71-446e-a122-66010b0d49cc.jpg",
      },
    ],
    agent: { emp_name: "（略）" },
    contact_scope: 1,
    has_unavailable_items: false,
    is_customer_page: false,
  },
  message: "取得分享成功",
};
const GONE = { status: "error", data: null, message: "找不到此分享連結" };

/* ── 解析 ── */
const share = parsePrimShare(LIVE);
eq("解析：一筆", share?.items.length, 1);
eq("解析：S 編號", share?.items[0].objNo, "S2862747");
eq("解析：標題", share?.items[0].title, "「禾盛晶綻」關連工業區旁輕屋齡2房+平車");
eq("解析：價格 元→萬", share?.items[0].price, 598);
eq("解析：坪", share?.items[0].ping, 30.129);
eq("解析：格局", [share?.items[0].rooms, share?.items[0].halls, share?.items[0].baths], [2, 2, 1]);
eq("解析：完工日", share?.items[0].completeDate, "2019-01-30");
eq("解析：封面在 pacblob", share?.items[0].coverPhoto?.startsWith("https://pacblob.blob.core.windows.net/prim-public/"), true);
eq("解析：total", share?.total, 1);
eq("解析：沒有下架標記", share?.hasUnavailable, false);
eq("解析：不是出租", share?.items[0].isRent, false);
eq("解析：error 回應 → null", parsePrimShare(GONE), null);
eq("解析：null → null", parsePrimShare(null), null);
eq("解析：items 不是陣列 → null", parsePrimShare({ status: "success", data: { items: "x" } }), null);
const withJunk = JSON.parse(JSON.stringify(LIVE));
withJunk.data.items.push({ obj_no: "", obj_name: "沒有編號的那筆" });
eq("解析：沒有 S 編號的那筆跳過", parsePrimShare(withJunk)?.items.length, 1);

/* 價格：元換萬，離譜的不要 */
const priced = (p) => parsePrimShare({ status: "success", data: { items: [{ obj_no: "S1234567", price: p }] } })?.items[0].price;
eq("價格 5985000 → 598.5", priced("5985000"), 598.5);
eq("價格 0 → null", priced("0"), null);
eq("價格 12 位數 → null（離譜）", priced("99999999999"), null);
eq("價格 null → null", priced(null), null);

/* ── 判定「客戶還點得開嗎」── */
eq("200＋物件 → live", classifyPrimShare(200, LIVE).state, "live");
eq("🔴 404 找不到 → gone", classifyPrimShare(404, GONE).state, "gone");
eq("410 → gone", classifyPrimShare(410, null).state, "gone");
eq("200 但 items 空 → gone", classifyPrimShare(200, { status: "success", data: { items: [] } }).state, "gone");
eq("200 但認不得 → unknown（不是 live）", classifyPrimShare(200, "維護中").state, "unknown");
eq("500 → unknown", classifyPrimShare(500, null).state, "unknown");
eq("逾時那種 0 → unknown", classifyPrimShare(0, null).state, "unknown");
const flagged = JSON.parse(JSON.stringify(LIVE));
flagged.data.has_unavailable_items = true;
eq("🔴 它自己標『有物件已下架』→ unknown，不是 gone", classifyPrimShare(200, flagged).state, "unknown");
const two = JSON.parse(JSON.stringify(LIVE));
two.data.items.push({ ...LIVE.data.items[0], obj_no: "S9999999" });
two.data.total = 2;
eq("兩筆 → live", classifyPrimShare(200, two).state, "live");
eq("兩筆的備註講筆數", classifyPrimShare(200, two).note.includes("2 筆"), true);

/* ── 連結長相 ── */
eq("分享連結 → 代碼", primShareCode("https://prim.pacific.com.tw/s/LV5rC5XJ"), "LV5rC5XJ");
eq("尾巴斜線", primShareCode("https://prim.pacific.com.tw/s/LV5rC5XJ/"), "LV5rC5XJ");
eq("帶 query", primShareCode("https://prim.pacific.com.tw/s/LV5rC5XJ?utm=x"), "LV5rC5XJ");
eq("http 也認", primShareCode("http://prim.pacific.com.tw/s/LV5rC5XJ"), "LV5rC5XJ");
eq("前後空白", primShareCode("  https://prim.pacific.com.tw/s/LV5rC5XJ  "), "LV5rC5XJ");
eq("🔴 prim.pacific.com.tw.evil.com → null", primShareCode("https://prim.pacific.com.tw.evil.com/s/LV5rC5XJ"), null);
eq("🔴 路徑裡藏網域 → null", primShareCode("https://evil.com/prim.pacific.com.tw/s/LV5rC5XJ"), null);
eq("不是 /s/ 的頁 → null", primShareCode("https://prim.pacific.com.tw/showcase/LV5rC5XJ"), null);
eq("官網主站 → null（那是另一種連結）", primShareCode("https://www.pacific.com.tw/s/LV5rC5XJ"), null);
eq("光打代碼 → null（跟案號分不清，不收）", primShareCode("LV5rC5XJ"), null);
eq("空字串 → null", primShareCode(""), null);
eq("代碼太短 → null", primShareCode("https://prim.pacific.com.tw/s/ab"), null);
eq("組回分享網址", primShareUrl("LV5rC5XJ"), "https://prim.pacific.com.tw/s/LV5rC5XJ");

/* ── 小工具 ── */
eq("社區名：「」開頭", communityFromTitle("「禾盛晶綻」關連工業區旁輕屋齡2房+平車"), "禾盛晶綻");
eq("社區名：【】也認", communityFromTitle("【御璽】三房平車"), "御璽");
eq("社區名：沒有引號 → 空", communityFromTitle("梧棲三房平車"), "");
eq("屋齡：2019-01-30 到 2026-10-14", primAgeYears("2019-01-30", new Date("2026-10-14T00:00:00Z")), 7.7);
eq("屋齡：還沒完工 → null", primAgeYears("2030-01-01", new Date("2026-10-14T00:00:00Z")), null);
eq("屋齡：沒日期 → null", primAgeYears(null), null);
eq("去縣市：臺中市", stripCity("臺中市梧棲區自強一街"), "梧棲區自強一街");
eq("去縣市：台中市", stripCity("台中市梧棲區自強一街"), "梧棲區自強一街");
eq("去縣市：本來就沒有", stripCity("梧棲區自強一街"), "梧棲區自強一街");

/* ── 賣點那一行 ── */
const item = share.items[0];
eq(
  "賣點：官網同步表補齊的那種",
  primPoints(item, { kind: "電梯大廈", floor: "6/15", hasParking: true, ageYears: 7.6 }),
  ["電梯大廈｜2房2廳1衛｜登記 30.129 坪｜6/15 樓｜屋齡 7.6 年｜含車位｜總價 598 萬"],
);
const bare = primPoints(item)[0];
eq("賣點：只有分享 API 時不寫型態與車位", bare.includes("含車位") || bare.startsWith("電梯"), false);
eq("賣點：只有分享 API 時屋齡從完工日算", bare.includes("屋齡"), true);
eq("賣點：什麼都沒有 → 空陣列", primPoints({ ...item, rooms: null, ping: null, price: null, completeDate: null }), []);

/* ── 比較表的九格 ── */
const matchRow = { floor: "6/15", features: ["車位", "平面車位", "電梯"], type: "電梯大廈", age: 7.6 };
const facts = primFactsFrom(item, matchRow);
eq("九格：總價", facts.price, 598);
eq("九格：社區", facts.community, "禾盛晶綻");
eq("九格：樓層拆開", facts.floor, { level: "6", total: 15 });
eq("九格：格局", facts.layout, { room: 2, hall: 2, bath: 1 });
eq("九格：車位有＋平面", facts.parking, { has: true, type: "平面" });
eq("九格：型態", facts.kind, "電梯大廈");
eq("九格：屋齡用官網的數字", facts.age, "7.6 年");
eq("九格：完工日", facts.completion, "2019/01/30");
eq("九格：公設比沒有就 null", facts.publicRatio, null);
eq("九格：fieldCount 不是 0", facts.fieldCount > 0, true);
const noMatch = primFactsFrom(item, null);
eq("九格：沒有官網資料 → 樓層 null", noMatch.floor, null);
eq("九格：沒有官網資料 → 車位 null（不是「無」）", noMatch.parking, null);
eq("九格：沒有官網資料 → 屋齡 null、靠完工日顯示", noMatch.age, null);
const noPark = primFactsFrom(item, { ...matchRow, features: ["電梯"] });
eq("九格：官網說沒車位 → has false", noPark.parking, { has: false, type: "" });

if (fails.length) {
  console.error(`🔴 ${fails.length} 項不過（通過 ${pass}）：`);
  fails.forEach((f) => console.error("   ✗ " + f));
  process.exit(1);
}
console.log(`✅ 太平洋分享連結規則 ${pass} 項全過`);
