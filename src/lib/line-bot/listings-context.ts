/**
 * 把「目前在售物件」整理成機器人讀得懂的文字
 *
 * 為什麼要有這支：8/21 觀察期第一則真實客戶訊息就是「你好，請問這個還在嗎？」——
 * 房仲最高頻的問題，而機器人原本完全答不出來（知識庫是手寫死的靜態文字）。
 *
 * ⚠️ 兩個刻意的限制，改的時候不要拿掉：
 *
 * 1. **不給價格。** 資料庫本來就沒存價格（系統擁有者拍板：開價寫在自家網站等於發廣告，
 *    會過期、要維護、有不實風險）。所以這裡沒有價格可洩漏，AI 也就無從報價。
 *
 * 2. **只給資料庫真的有的欄位。** 客戶問過「管理費是另外還是有包含呢」——
 *    那種細節資料庫沒有，AI 必須知道自己不知道。下面的指示會明確禁止它推測，
 *    寧可請客戶預約看屋，也不能猜一個數字出去。
 */
import { getPublicListings } from "@/lib/listings";

/** 一次最多餵幾筆給 AI。物件多到爆的時候不要把 system prompt 撐爆。 */
const MAX_LISTINGS = 20;

/**
 * 回傳要接在 system prompt 後面的物件區塊。
 * 沒有在售物件、或資料庫連不上 → 回 null，system prompt 就不加這一段
 * （AI 會照原本的規則說「我請瑋凱跟您確認」，不會亂編）。
 */
export async function buildListingsContext(): Promise<string | null> {
  let listings: Awaited<ReturnType<typeof getPublicListings>>;
  try {
    listings = await getPublicListings();
  } catch {
    // 讀不到就當作沒有。絕對不要讓機器人因為這個掛掉不回話。
    return null;
  }

  if (!listings.length) return null;

  const shown = listings.slice(0, MAX_LISTINGS);

  const lines = shown.map((item, i) => {
    const points = item.points
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `   ・${p}`)
      .join("\n");

    const head = `${i + 1}. ${item.title}${item.area ? `（${item.area}）` : ""}`;
    return points ? `${head}\n${points}` : head;
  });

  const more =
    listings.length > shown.length
      ? `\n（另外還有 ${listings.length - shown.length} 件，請客戶到官網看完整清單）`
      : "";

  return `
# 我目前手上的在售物件（共 ${listings.length} 件）

${lines.join("\n")}${more}

## 講到物件時的規矩（這幾條比上面的資料重要）

- 上面這份清單**就是你知道的全部**。客戶問「有沒有 OO」，只能從這裡找，找不到就說「目前手上沒有完全符合的，我幫您留意，有進來第一時間通知您」，**絕對不要生出不在清單上的物件**。
- **每一筆的細節你只知道上面那幾行。** 客戶問坪數、樓層、屋齡、管理費、車位形式、朝向、格局、可不可以貸幾成 —— 這些資料你**沒有**。不要推測、不要用常理猜，直接說「這個我要幫您確認實際狀況」並引導預約看屋。**猜一個數字出去，比說不知道嚴重一百倍。**
- **一律不談價格。** 不報價、不說「大概多少」、不比較貴便宜、不評論值不值得。想知道價格就請客戶預約，由瑋凱當面說明。
- 客戶只說「**這個**還在嗎」「**這間**多少」而沒講是哪一件時（他多半是從 FB、591 或圖文選單點進來的，你看不到他在看什麼），**先問清楚是哪一間**，可以順帶報一兩個區域讓他對照，例如「方便跟我說是哪一間嗎？或您是從哪裡看到的？我手上清水和梧棲都有」。**不要自己假設他問的是清單上的第一筆。**
- 客戶想看完整清單（含照片）：https://weikaihouse.com/listings
- 客戶想約看屋：https://weikaihouse.com/card/booking
- 清單會隨時異動，所以講的時候用「目前」「這幾天」這種說法，不要講得像永久有效。
`.trim();
}
