/**
 * 📄 社區銷售報告書 —— 給 ChatGPT 的查資料指令（他要的「給 chat 查詢資料的指令」）
 *
 * 後台 /admin/reports 選好建案按「複製指令」，複製的就是 buildReportPrompt() 回的這段。
 * 他貼進自己的 ChatGPT（免費路線，跟待產文案同一套），ChatGPT 回一個 JSON，他再貼回後台。
 *
 * ⚠️ 要改「請 ChatGPT 查什麼、怎麼回」只改這個檔。解析規則在 lib/project-report.ts，
 *    兩邊的鍵名（basics.team、locationValues…）要一致 —— SKELETON 就是從 BASIC_FIELDS 長出來的，
 *    改欄位先改那邊。
 *
 * ## 為什麼把已知資料塞進指令
 * 建案總表是他自己核過的（建商、完工年、戶數…），不給 ChatGPT 看它就會自己查一個版本，
 * 兩邊打架時前台雖然以總表為準（mergeBasics），但文字段落（定位、賣點）會寫出對不上的數字。
 * 給了就叫它照用。
 *
 * ## 紅線為什麼寫在指令裡
 * 公平交易法的字（最／第一／保證／增值）後台存檔時會再掃一次（lib/listing-copy-risk.ts），
 * 但在源頭擋掉比事後改便宜。價格數字一律不要 —— /map 那頁的「為什麼不標價格」已經講過理由，
 * 報告書的行情段落只放一顆連到 /lvr 的按鈕。
 */

import { AREA_LABEL, STATUS_LABEL, filledAmenities, houseAge, type Project } from "@/data/port-projects";
import { OWNER } from "@/config/owner";
import { BASIC_FIELDS, LOCATION_LABELS, REPORT_LABEL } from "@/lib/project-report";

/** 指令裡會請 ChatGPT 填的 JSON 骨架。鍵名跟 lib/project-report.ts 的 normalizeReport() 對應。 */
export function reportSkeleton(): string {
  const basics = BASIC_FIELDS.map((f) => `    "${f.key}": ""`).join(",\n");
  const loc = LOCATION_LABELS.map((l) => `    { "label": "${l}", "body": "" }`).join(",\n");
  return [
    "{",
    '  "tagline": "",',
    '  "basics": {',
    basics,
    "  },",
    '  "positioning": { "title": "", "body": "" },',
    '  "locationValues": [',
    loc,
    "  ],",
    '  "highlights": ["", "", ""],',
    '  "competitors": [{ "name": "", "note": "" }, { "name": "", "note": "" }, { "name": "", "note": "" }],',
    '  "buyers": ["", ""],',
    '  "sellingPoints": [{ "title": "", "body": "" }, { "title": "", "body": "" }, { "title": "", "body": "" }],',
    '  "sources": [""],',
    '  "unverified": [""]',
    "}",
  ].join("\n");
}

export type ReportPromptContext = {
  /** 我在這個建案目前有幾件在售（寫進指令讓 ChatGPT 知道這是我手上有貨的社區） */
  mineCount: number;
  now?: Date;
};

/** 已知資料：只列有值的，沒有的那行直接不出現 */
function knownFacts(p: Project, now: Date): string {
  const age = houseAge(p.completion, now);
  const lines: string[] = [];
  lines.push(`- 建案名：${p.name}${p.alias ? `（又稱 ${p.alias}）` : ""}`);
  lines.push(`- 建商：${p.builder}`);
  lines.push(`- 位置：台中市${AREA_LABEL[p.area]}${p.streets ? `，坐落 ${p.streets}` : p.street ? `，主要臨 ${p.street}` : ""}`);
  lines.push(`- 銷售階段：${STATUS_LABEL[p.status]}${p.statusNote ? `（${p.statusNote}）` : ""}`);
  lines.push(`- 完工：${p.completion}${age ? `（屋齡${age}）` : ""}`);
  if (p.units != null) lines.push(`- 總戶數：${p.units} 戶`);
  if (p.floors) lines.push(`- 樓層：${p.floors}`);
  if (p.layout) lines.push(`- 房型坪數：${p.layout}`);
  if (p.publicRatio) lines.push(`- 公設比：${p.publicRatio}`);
  if (p.siteAreaPing != null) lines.push(`- 基地面積：約 ${p.siteAreaPing} 坪`);
  if (p.note) lines.push(`- 備註：${p.note}`);
  const amen = filledAmenities(p.area);
  if (amen.length > 0) {
    lines.push(`- 周邊機能（${OWNER.alias}實地整理，可直接引用）：${amen.map((g) => `${g.label}＝${g.items.join("、")}`).join("；")}`);
  }
  return lines.join("\n");
}

/** 「請你查的」清單，照 BASIC_FIELDS 的提示長出來，欄位改了這裡自動跟著變 */
function fieldGuide(): string {
  return BASIC_FIELDS.map((f) => `   - ${f.key}（${f.label}）：${f.hint}`).join("\n");
}

export function buildReportPrompt(p: Project, ctx: ReportPromptContext): string {
  const now = ctx.now ?? new Date();
  const district = AREA_LABEL[p.area];
  return `你是台中海線在地房仲「${OWNER.name}」（${OWNER.title}）的研究助理。
請幫我整理「${p.name}」這個社區的「${REPORT_LABEL}」資料。我會把你回傳的 JSON 直接放上官網給客戶看，所以格式一定要照規定、內容一定要查得到根據。

## 一、已知資料（我自己核過的，請照用、不要改寫、不要跟它打架）
${knownFacts(p, now)}
- 我目前在這個社區有 ${ctx.mineCount} 件物件在售（這不用寫進資料）。

## 二、請你查的
請用公開資料查：建商官網、建案官網、新聞報導、政府公告（使照、建照）、Google 地圖的步行與開車時間。
查不到或沒把握的，值一律填「待確認」，**不要猜數字**。

1. 基本資料（填進 basics，已知資料有的欄位照抄）：
${fieldGuide()}
2. tagline：一句話定位，20 字內，講這個社區「是什麼」（例：「戶戶邊間雙面採光，梧棲沙鹿交界的中型社區」），不要形容詞堆疊。
3. positioning：區域市場定位。title 一個標題（15 字內），body 一段 80～150 字，說明這個社區在${district}一帶扮演的角色、建商在海線的脈絡（同系列案、口碑）。
4. locationValues：四大地段價值，label 固定是「${LOCATION_LABELS.join("」「")}」四項，各一段 40～80 字。距離寫「步行約 N 分鐘到○○」「開車約 N 分鐘到○○」，要寫得出到哪裡。
5. highlights：社區特色 3～6 條（規劃、建材、公設、管理、採光、棟距…），每條一句、查得到根據的才寫。
6. competitors：周邊競品 3～4 個，同一區或同一建商的社區。name 只寫社區名（不要加「（同建商）」這類括號，那個寫在 note），note 一句話說明為什麼放在一起比。
7. buyers：買方輪廓 2～3 種，每種一句（誰會買這裡、看重什麼）。
8. sellingPoints：主打賣點 3 個，title 8 字內、body 30～60 字。
9. sources：你參考的來源，寫名稱或網址，一條一個。
10. unverified：你沒把握的每一個數字或說法都列在這裡，一條一個。

## 三、紅線（違反其中一條我就不能用）
- 不寫價格、單價、行情、成交金額、租金（行情我會依內政部實價登錄另外整理）。
- 不寫「最」「第一」「唯一」「保證」「絕對」「增值」「必漲」「翻倍」「穩賺」這類最高級與承諾用語。
- 台中捷運藍線尚未通車：提到要寫「規劃中」或「施工中」，不能寫得像已經可以搭。
- 學區只寫「鄰近○○國小／國中」，除非你確認學區劃分，否則不要寫「屬於○○學區」。
- 不逐字抄任何網站或廣告的文案，用自己的話重寫；數字查不到就寫「待確認」，不要編。
- 全部用繁體中文、台灣用語。

## 四、回覆格式
只回一個 \`\`\`json 程式碼區塊，前後不要加任何說明文字。鍵名完全照下面，值填繁體中文字串；不知道的填 "待確認"：
\`\`\`json
${reportSkeleton()}
\`\`\``;
}
