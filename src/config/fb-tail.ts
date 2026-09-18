/**
 * FB 社團廣告的「固定尾段」—— 黃瑋凱本人 2026-09-18 提供，他說「這個區塊要固定在每個文案內」。
 *
 * 每一則社團廣告都會自動接在文案後面（中間空一行），所以「廣告文案」那頁只要寫這一戶的內容，
 * 不用每次重貼這一段。他要改就到後台「設定 → 固定尾段」改，改完所有廣告一起變（存在他瀏覽器的
 * IndexedDB，不進資料庫）。這裡只是**第一次的預設值**。
 *
 * ⚠️ 排版照他給的一字不改（含空行、全形｜、行首空格）—— 這是他自己的營業版型，不要順手「修排版」。
 *
 * 🔴 他貼過來時有三條網址是**被畫面截斷的**（結尾是 …），照貼會變成點不開的死連結：
 *      樂屋網   https://vip.rakuya.com.tw/0909787865/...
 *      FB粉專   https://www.facebook.com/wei.kai.drea...
 *      YouTube  https://www.youtube.com/channel/UCY9V...
 *    這裡先照他給的原樣放（不替他猜網址），後台會把「… 結尾的連結」標紅、按發佈前再問一次。
 *    他自己網站設定 `owner.ts` 的 SOCIAL 有已驗證的完整版可以用：
 *      fb  https://www.facebook.com/108472157721504
 *      yt  https://www.youtube.com/@swujnuty0325
 *    樂屋那條 repo 裡沒有，只有他自己知道完整網址。
 */
export const FB_AD_TAIL = `☀️☀️☀️歡迎來電預約看屋☀️☀️☀️
📲0909-787-865 黃瑋凱🙋‍♂️
Line: https://line.me/ti/p/@a8865
☀️☀️☀️真心期待為你服務☀️☀️☀️

💯歡迎到個人店鋪看我的精選推薦💯
🎖️官方網站
 weikaihouse.com
🎖️591個人店鋪
https://www.591.com.tw/broker1019
🎖️樂屋網個人店鋪
https://vip.rakuya.com.tw/0909787865/...
🎖️FB粉絲專頁
https://www.facebook.com/wei.kai.drea...
🎖️YouTube影音搶先看
https://www.youtube.com/channel/UCY9V...

❤️記得幫我按讚+訂閱+分享❤️
🌟歡迎詢問案件我將為你的需求做配對🌟
💎歡迎屋主來電指名委託瑋凱租賃買賣💎
⚜️你的期待由我來達成⚜️
✅秉持將心比心說到做到
✅相識就是緣份真心珍惜
✅最懂買賣雙方期望的心
✅台中海線房地產規劃師
✅用影音呈現房屋的價值
✅專業攝影空拍後製團隊
⚜️你的委託是我的責任⚜️
✅各品牌房屋網置頂精選
✅粉專贊助付費廣告投放
✅售屋場勘提供清潔服務
✅現場週邊看板強力曝光
✅專業行銷企劃非你莫屬
✅房屋打造專屬空拍影音
｜海線破億團隊｜唯一七店直營｜唯一百人團隊｜
｜廣告行銷最大｜成交速度最快｜獨家案源最多｜
◇太平洋房屋，梧棲新市鎮旗艦加盟店◇
◇馥勵不動產經紀有限公司◇
經紀人:嚴意情(101)中市經證字第00887號
▲▲▲房屋刊登資料若有誤，依正式謄本為準▲▲▲`;

/** 文案 ＋ 固定尾段，中間空一行。尾段已經在文案裡（他自己貼過）就不重複接。 */
export function withTail(adText: string, tail: string): string {
  const body = String(adText || "").replace(/\s+$/, "");
  const t = String(tail || "").trim();
  if (!t) return body;
  // 用尾段的第一行當指紋：他若自己貼過整段，就不要再接一次
  const firstLine = t.split("\n").find((l) => l.trim());
  if (firstLine && body.includes(firstLine.trim())) return body;
  return body ? `${body}\n\n${t}` : t;
}

/** 找出被截斷、點不開的連結（結尾是 ... 或 …）。回傳整行，方便直接顯示給他看。 */
export function truncatedLinks(text: string): string[] {
  return String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /https?:\/\/\S*(\.\.\.|…)\s*$/.test(l));
}
