/**
 * 迴歸測試：TypeScript 版的辨識器跟原本本機工具那份 JS 有沒有走樣。
 * 用法：node --experimental-strip-types scripts/check-rival-parser.mjs
 * ⚠️ 測試字串一律自己編，不要貼真實 591 內容進來 —— 這個 repo 是公開的。
 */
import { parseMany, computeUnit, detectDupes, normCommunity } from "../src/lib/rival-parser.ts";

let pass = true;
const ok = (cond, label, got, want) => {
  if (!cond) pass = false;
  console.log(`${cond ? "  ✅" : "  ❌"} ${String(label).padEnd(18)} ${String(got).padEnd(12)}${cond ? "" : "應為 " + want}`);
};

/* 同一筆資料的三種排版 —— 剪貼簿的換行方式不固定，三種都要通過 */
const HEAD = (id, fl) => `首頁 中古屋 台中市 梧棲區 住宅 750萬以下 當前房屋（S${id}）
測試社區視野兩房平車
有效期：2026-10-25瀏覽人數：28 （13 | 15）
898 萬元（含車位價格）23.01萬/坪`;

const 排版A = `${HEAD("20000001")}
2房2廳1衛
格局
1年
屋齡
39.03坪(含車位)
權狀坪數
樓層
19F/24F
社區
測試悦社區
本社區“測試悦社區”
房屋介紹
房屋資料
型態
：
電梯大樓
車位
：
7.9坪，平面式，已含售金內
行業資質
所屬公司：
測試房屋
屋況特色 清水區 32.5坪 668萬 20.55萬/坪
社區資訊
熱賣物件
237
間
近半個月上架31間
屋主刊登5間
降價11間
7088人瀏覽
熱門社區推薦 9間在售 別的社區 888 萬起 近期有375人瀏覽`;

const 排版B = `${HEAD("20000001")}
2房2廳1衛格局1年屋齡39.03坪(含車位)權狀坪數樓層19F/24F社區測試悦社區
本社區“測試悦社區”
房屋介紹房屋資料型態：電梯大樓車位：7.9坪，平面式，已含售金內
行業資質所屬公司：測試房屋
屋況特色 清水區 32.5坪 668萬 20.55萬/坪
社區資訊熱賣物件237間近半個月上架31間屋主刊登5間降價11間7088人瀏覽
熱門社區推薦 9間在售 別的社區 888 萬起 近期有375人瀏覽`;

const 排版C = `${HEAD("20000001")}
格局：2房2廳1衛
屋齡：1年
權狀坪數：39.03坪(含車位)
樓層：19F/24F
社區：測試悦社區
本社區“測試悦社區”
房屋資料
型態：電梯大樓
車位：7.9坪，平面式，已含售金內
所屬公司：測試房屋
屋況特色 清水區 32.5坪 668萬 20.55萬/坪
熱賣物件 237 間 近半個月上架 31 間 屋主刊登 5 間 降價 11 間 7088 人瀏覽`;

const 期望 = {
  price: 898, area: 39.03, floor: 19, totalFloor: 24, rooms: 2, views: 28,
  parking: "平面", parkingInPrice: true, buildingType: "電梯大樓", unit: 23,
  community: "測試悦社區", agency: "測試房屋",
  communityListings: 237, communityNew: 31, communityOwner: 5, communityCuts: 11, communityViews: 7088,
};

for (const [name, text] of [["A 值在標籤上一行", 排版A], ["B 全部黏成一行", 排版B], ["C 標籤：值", 排版C]]) {
  console.log(`\n=== ${name} ===`);
  const rows = parseMany(text).map(computeUnit);
  if (rows.length !== 1) { ok(false, "切出筆數", rows.length, 1); continue; }
  for (const [k, want] of Object.entries(期望)) ok(String(rows[0][k]) === String(want), k, rows[0][k], want);
  ok(rows[0].warn.length === 0, "單價對帳", rows[0].warn.join(";") || "通過", "無警告");
}

/* 沒有社區資訊區塊時，五個社區欄位都要是 null，不能亂猜 */
console.log("\n=== D 沒有社區資訊區塊（不准亂猜）===");
{
  const r = parseMany(`${HEAD("20000009")}\n2房2廳1衛格局1年屋齡39.03坪(含車位)權狀坪數樓層19F/24F`)[0];
  for (const k of ["communityListings", "communityNew", "communityOwner", "communityCuts", "communityViews"])
    ok(r[k] === null, k, r[k], "null");
}

/* 去重：開價一致才預設合併；開價差很多要標成低信心不合併 */
console.log("\n=== E 去重信心 ===");
{
  const mk = (id, price, area, fl) => `首頁 當前房屋（S${id}）
標題
瀏覽人數：10
${price} 萬元${(price / area).toFixed(2)}萬/坪
2房2廳1衛格局1年屋齡${area}坪(含車位)權狀坪數樓層${fl}F/24F社區測試社區
本社區“測試社區”
房屋資料型態：電梯大樓車位：平面式，已含售金內
所屬公司：某某`;
  const same = detectDupes(parseMany([mk("20000011", 898, 39.03, 19), mk("20000012", 898, 39.0, 19)].join("\n")).map(computeUnit));
  ok(same[1].isDupFollower && same[1].dupHighConf && same[1].merge, "開價一致→預設合併", same[1].merge, true);

  const diff = detectDupes(parseMany([mk("20000013", 788, 30.03, 8), mk("20000014", 738, 30.0, 8)].join("\n")).map(computeUnit));
  ok(diff[1].isDupFollower && !diff[1].dupHighConf && !diff[1].merge, "開價差50萬→不合併", diff[1].merge, false);
  ok(diff[1].dupPriceGap === -50, "價差記錄", diff[1].dupPriceGap, -50);
}

console.log("\n=== F 異體字 ===");
ok(normCommunity("聯悅臻") === normCommunity("聯悦臻"), "悅/悦視為同一社區", normCommunity("聯悦臻"), normCommunity("聯悅臻"));

console.log("\n" + (pass ? "✅ TypeScript 版與原本的 JS 版行為一致" : "❌ 有差異，不要往下做"));
process.exit(pass ? 0 : 1);
