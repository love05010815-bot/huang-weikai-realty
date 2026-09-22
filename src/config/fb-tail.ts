/**
 * FB 社團廣告的「固定尾段」—— 黃瑋凱本人 2026-09-18 提供，他說「這個區塊要固定在每個文案內」。
 *
 * 每一則社團廣告都會自動接在文案後面（中間空一行），所以「廣告文案」那頁只要寫這一戶的內容，
 * 不用每次重貼這一段。他要改就到後台「設定 → 固定尾段」改，改完所有廣告一起變（存在他瀏覽器的
 * IndexedDB，不進資料庫）。這裡只是**第一次的預設值**。
 *
 * ⚠️ 排版照他給的一字不改（含空行、全形｜、行首空格）—— 這是他自己的營業版型，不要順手「修排版」。
 *
 * 他第一次貼過來時，樂屋／FB粉專／YouTube 三條網址是被畫面截斷的（結尾 …），會變成點不開的死連結；
 * 2026-09-18 他自己補了完整網址，下面用的就是他補的版本：
 *      樂屋網   https://vip.rakuya.com.tw/0909787865
 *      FB粉專   https://www.facebook.com/wei.kai.dream.home/
 *      YouTube  https://www.youtube.com/@swujnuty0325
 * `truncatedLinks()` 那道檢查留著——他之後自己在後台改尾段時一樣會被截斷連結坑到。
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
https://vip.rakuya.com.tw/0909787865
🎖️FB粉絲專頁
https://www.facebook.com/wei.kai.dream.home/
🎖️YouTube影音搶先看
https://www.youtube.com/@swujnuty0325

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

// 純邏輯（接尾段、找截斷連結）搬去 lib/fb-tail-core.ts —— 同事版外掛要把畫面編進去，不能連他的個資一起編。
// 這裡留 re-export 讓舊的 import 路徑照常能用。
export { truncatedLinks, withTail } from "@/lib/fb-tail-core";

/**
 * 舊資料補丁：把他 2026-09-18 之前存進瀏覽器的那三條截斷網址換成完整版。
 * 改上面的預設值救不到「已經存在他 IndexedDB 的尾段」，所以開頁時順手換掉；
 * 只動這三條被截斷的，他自己改過的其他內容一個字都不碰（換完也不會再換第二次）。
 */
const LINK_FIXES: Array<[RegExp, string]> = [
  [/https:\/\/vip\.rakuya\.com\.tw\/0909787865\S*(?:\.\.\.|…)/g, "https://vip.rakuya.com.tw/0909787865"],
  [/https:\/\/www\.facebook\.com\/wei\.kai\.drea\S*(?:\.\.\.|…)/g, "https://www.facebook.com/wei.kai.dream.home/"],
  [/https:\/\/www\.youtube\.com\/channel\/UC\S*(?:\.\.\.|…)/g, "https://www.youtube.com/@swujnuty0325"],
];

export function fixTruncatedTail(tail: string): string {
  let out = String(tail || "");
  for (const [re, full] of LINK_FIXES) out = out.replace(re, full);
  return out;
}
