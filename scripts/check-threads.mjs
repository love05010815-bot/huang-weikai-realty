/**
 * Threads（脆）留言解析的迴歸測試。
 *
 *   npm run check:threads
 *
 * 驗的是 `lib/threads.ts` 裡兩個純函式：
 *   ・cleanAuthCode      —— 授權碼屁股的 `#_` 有沒有剃乾淨
 *   ・toInboxComments    —— 一整串攤平的 conversation 怎麼分成「別人的留言」與「我回過的」
 *
 * 為什麼特別要測這一段：Threads 的 `/conversation` 把**我自己的回覆也混在同一個陣列**，
 * 分錯的後果是靜默的 —— 自己的回覆會變成一則「待回覆的客戶留言」，或是真的有人問了
 * 卻被當成自己人濾掉。兩種都不會報錯，只會讓後台的數字說謊。
 *
 * ⚠️ 假資料一律自己編（假帳號、假貼文），不要貼真實留言 —— 這個 repo 是公開的。
 */
import assert from "node:assert/strict";
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
// 後註冊的先跑：先把 @/lib/google-calendar 換成假的設定存取，剩下的才交給別名解析
register("./stub-hooks.mjs", import.meta.url);

const { cleanAuthCode, toInboxComments } = await import("../src/lib/threads.ts");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✔ ${name}`);
  } catch (e) {
    console.error(`✖ ${name}\n  ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  }
}

const ME = "house_hkai";
const POST = {
  id: "p1",
  text: "梧棲新市鎮這一區的行情，我整理成一張表了。有問題直接留言問我。",
  permalink: "https://www.threads.com/@house_hkai/post/p1",
  timestamp: "2026-09-17T01:00:00+0000",
};

/** 組一則回覆。parent 不給就是回在貼文底下（＝頂層留言） */
function reply(id, username, text, opts = {}) {
  return {
    id,
    username,
    text,
    timestamp: opts.timestamp || "2026-09-17T02:00:00+0000",
    permalink: opts.permalink,
    replied_to: { id: opts.parent || POST.id },
    is_reply_owned_by_me: opts.mine,
    hide_status: opts.hide_status,
  };
}

// ---------------------------------------------------------------- 授權碼

test("cleanAuthCode：剃掉屁股的 #_，其餘一個字都不動", () => {
  assert.equal(cleanAuthCode("AQBx123#_"), "AQBx123");
  assert.equal(cleanAuthCode("AQBx123"), "AQBx123");
  // 中間的 #_ 不是結尾，不能動（真的出現代表 code 本身就長這樣）
  assert.equal(cleanAuthCode("AQ#_Bx123"), "AQ#_Bx123");
  assert.equal(cleanAuthCode(""), "");
});

// ---------------------------------------------------------------- 解析

test("別人的頂層回覆 → 一則待回覆的留言", () => {
  const out = toInboxComments(POST, [reply("r1", "buyer_amy", "請問這區三房大概多少？")], ME);
  assert.equal(out.length, 1);
  const c = out[0];
  assert.equal(c.platform, "threads");
  assert.equal(c.id, "r1");
  assert.equal(c.author, "@buyer_amy");
  assert.equal(c.text, "請問這區三房大概多少？");
  assert.equal(c.answeredByOwner, false);
  assert.deepEqual(c.replies, []);
});

test("我自己的回覆不會變成一則留言（用 username 認）", () => {
  const out = toInboxComments(POST, [reply("r1", ME, "有問題都可以問我")], ME);
  assert.deepEqual(out, []);
});

test("username 換了也認得出是自己（靠 is_reply_owned_by_me）", () => {
  // 改暱稱／API 沒回 username 的情況：不能因此把自己的回覆當成客戶留言
  const out = toInboxComments(POST, [reply("r1", "someone_else", "我回的", { mine: true })], ME);
  assert.deepEqual(out, []);
});

test("我回在某則留言底下 → 那則標成已回，回覆掛進去", () => {
  const out = toInboxComments(
    POST,
    [
      reply("r1", "buyer_amy", "三房大概多少？"),
      reply("r2", ME, "amy 你好，這區三房落在 1180～1350 萬", { parent: "r1" }),
    ],
    ME,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "r1");
  assert.equal(out[0].answeredByOwner, true);
  assert.equal(out[0].replies.length, 1);
  assert.equal(out[0].replies[0].byOwner, true);
  assert.equal(out[0].replies[0].text, "amy 你好，這區三房落在 1180～1350 萬");
});

test("我回的是 A，B 不會跟著被當成已回", () => {
  const out = toInboxComments(
    POST,
    [
      reply("r1", "buyer_amy", "三房多少？"),
      reply("r2", ME, "回 amy", { parent: "r1" }),
      reply("r3", "buyer_ben", "那兩房呢？"),
    ],
    ME,
  );
  const byId = Object.fromEntries(out.map((c) => [c.id, c]));
  assert.equal(out.length, 2);
  assert.equal(byId.r1.answeredByOwner, true);
  assert.equal(byId.r3.answeredByOwner, false);
});

test("我在貼文底下另外發一則，不會讓所有留言變成已回", () => {
  // 這則我的回覆 parent 是貼文本身，不是任何一則客戶留言
  const out = toInboxComments(
    POST,
    [reply("r1", "buyer_amy", "三房多少？"), reply("r2", ME, "補充：含車位")],
    ME,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].answeredByOwner, false);
});

test("被我隱藏的留言不再出現", () => {
  const out = toInboxComments(
    POST,
    [
      reply("r1", "spammer", "加我賴 xxx", { hide_status: "HIDDEN" }),
      reply("r2", "buyer_amy", "三房多少？"),
    ],
    ME,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "r2");
});

test("留言自己沒有 permalink 就退回貼文的，兩個都沒有才 null", () => {
  const withOwn = toInboxComments(
    POST,
    [reply("r1", "buyer_amy", "問一下", { permalink: "https://www.threads.com/x/r1" })],
    ME,
  );
  assert.equal(withOwn[0].permalink, "https://www.threads.com/x/r1");

  const fallback = toInboxComments(POST, [reply("r1", "buyer_amy", "問一下")], ME);
  assert.equal(fallback[0].permalink, POST.permalink);

  const none = toInboxComments({ id: "p2" }, [reply("r1", "buyer_amy", "問一下")], ME);
  assert.equal(none[0].permalink, null);
});

test("context 是貼文開頭一小段，過長要截斷", () => {
  const out = toInboxComments(POST, [reply("r1", "buyer_amy", "問一下")], ME);
  assert.ok(out[0].context.startsWith("梧棲新市鎮這一區"));
  assert.ok(out[0].context.length <= 61, `context 太長：${out[0].context.length}`);

  const long = toInboxComments(
    { id: "p3", text: "一".repeat(200) },
    [reply("r1", "buyer_amy", "問一下")],
    ME,
  );
  assert.equal(long[0].context.length, 61); // 60 字 ＋ 一個刪節號
  assert.ok(long[0].context.endsWith("…"));

  const empty = toInboxComments({ id: "p4" }, [reply("r1", "buyer_amy", "問一下")], ME);
  assert.equal(empty[0].context, null);
});

test("沒有 username 也不會炸，顯示成（不明）", () => {
  const out = toInboxComments(POST, [{ id: "r1", text: "?", replied_to: { id: POST.id } }], ME);
  assert.equal(out.length, 1);
  assert.equal(out[0].author, "（不明）");
  assert.equal(out[0].publishedAt, "");
});

test("replied_to 整個缺席時當成頂層留言，不會被丟掉", () => {
  const out = toInboxComments(POST, [{ id: "r1", username: "buyer_amy", text: "在嗎" }], ME);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "r1");
});

console.log(`\n${passed} 項通過${process.exitCode ? "，有失敗" : "，全數通過"}`);
