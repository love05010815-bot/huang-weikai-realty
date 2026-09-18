/**
 * 把系統擁有者 2026-09-17 自己寫好的那篇（第2戶房貸放寬到7成）放成 /news 的第一篇。
 *
 * 用法（要連正式資料庫，所以要帶 .env.local）：
 *   node --experimental-strip-types --env-file=.env.local scripts/seed-first-post.mjs
 *   加 --dry 只印出來、不寫進去。
 *
 * ⚠️ 這支**只會 INSERT 一筆**，而且先用標題查過、已經有就跳過（可以重複跑）。
 *    沒有任何 DELETE、沒有任何 UPDATE 別筆 —— 見 learning_destructive_db_cleanup。
 *
 * 內文是他原文照貼，一個字都沒改（標題那行移到標題欄位）。
 * 要改文字請到 /admin/posts 後台改，不要改這個檔再跑一次（跑第二次會被跳過）。
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);

const dry = process.argv.includes("--dry");

const TITLE = "第2戶房貸放寬到7成｜央行連10凍，換屋自備款差多少？";

const SUMMARY =
  "央行維持政策利率不變、正式「連10凍」，同時把自然人第2戶購屋貸款最高成數從6成調升到7成，2026/9/18 起實施。以總價 1,500 萬的房子來算，理論上最高可貸金額差 150 萬元。";

/** 他原文照貼（只拿掉最上面那行標題，移到標題欄位）。 */
const BODY = [
  "準備換屋、購置第2戶的朋友注意了！📣",
  "央行最新政策出爐，房市信用管制再度適度鬆綁！",
  "",
  "🏦 政策利率維持不變，正式「連10凍」",
  "🏡 自然人第2戶購屋貸款最高成數",
  "👉 從原本「6成」調升至「7成」",
  "📅 2026/9/18 起正式實施",
  "",
  "這次調整，對於有第2戶購屋需求、換屋需求的族群來說，最大的差別就是「自備款壓力有機會降低」！💰✨",
  "",
  "舉例來說👇",
  "若購買總價 1,500 萬元的房子：",
  "",
  "🔸 最高貸款6成＝900萬元",
  "🔸 最高貸款7成＝1,050萬元",
  "➡️ 理論上的最高貸款額度相差150萬元！",
  "",
  "不過要特別注意⚠️",
  "「最高7成」≠ 每個人都一定能貸到7成！",
  "",
  "實際核貸仍會依照個人收入、負債比、信用條件、房屋條件及銀行授信政策等綜合評估。",
  "",
  "近期正在考慮「換屋」、「買第2間房」的朋友，可以重新試算一下自己的資金配置，也許原本卡住的購屋計畫，現在多了一點彈性。🏡🔑",
  "",
  "想了解目前房市、物件資訊與購屋規劃，歡迎私訊聊聊！💬",
].join("\n");

/** 他做這張圖、寫這段文案的日子。之後要改到後台改，不要改這裡。 */
const PUBLISHED_AT = "2026-09-17 10:00:00";

const { db } = await import("../src/lib/db.ts");
const P = await import("../src/lib/posts.ts");
const T = await import("../src/lib/posts-text.ts");

console.log(`標題：${TITLE}`);
console.log(`字數：${T.postCharCount(BODY)}（約 ${T.postReadMinutes(BODY)} 分鐘）`);
console.log(`區塊：${T.parsePostBody(BODY).map((b) => b.kind).join(" / ")}`);

if (dry) {
  console.log("\n--dry：沒有寫進資料庫。");
  process.exit(0);
}

await P.ensurePostTables();

const existing = await db.$queryRawUnsafe("SELECT id, slug, status FROM site_post WHERE title = ? LIMIT 1", TITLE);
if (existing.length > 0) {
  console.log(`\n⏭️  已經有這一篇了（slug=${existing[0].slug}、${existing[0].status}），不重複新增。`);
  process.exit(0);
}

const created = await P.createPost({
  category: "news",
  title: TITLE,
  summary: SUMMARY,
  body: BODY,
  // 封面圖他自己做好了（那張「房市最新消息」的圖），要他到 /admin/posts 上傳
  coverUrl: "",
  sourceUrl: "",
  sourceName: "",
  status: "published",
  pinned: false,
  publishedAt: PUBLISHED_AT,
  taskId: "",
});

console.log(`\n✅ 新增好了：/news/${created.slug}（id=${created.id}）`);
console.log("⚠️ 還沒有封面圖 —— 到 /admin/posts 按「選一張圖」把他做好的那張傳上去，LINE 連結預覽才會有圖。");
process.exit(0);
