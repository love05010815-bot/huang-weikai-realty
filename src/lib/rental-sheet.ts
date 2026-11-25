/**
 * 租件圖片排版（/admin/rental-sheet）的純邏輯 —— 沒有 React、沒有 DOM，客戶端與檢查腳本共用。
 *
 * 這張表是租約的附件「房屋內部傢俱項目」：上半部照片（6 或 8 張、說明在照片上方），
 * 下半部「項目列表」＋備註＋甲乙方＋簽約日期。版面照他原本那份 Excel（租屋用圖片排版.xlsx）。
 *
 * 規則：
 *  - **一個分類只要有一個品項被勾，就會印出來；一個都沒勾就整組不印**（所以沒有「分類開關」）。
 *  - 預設品項全部「沒勾」。這張會跟租約一起簽，預先勾好的東西沒看到就印出去，等於白紙黑字寫了屋裡沒有的傢俱。
 *  - 項目列表最多 5 欄（跟 Excel 一樣）；超過 5 個分類時，多的接在「目前最短那一欄」底下
 *    （Excel 裡「衛浴」接在「陽台」下面就是這樣排的）。
 *
 * 改完跑 `npm run check:rental-sheet`。
 */

export type RentalItem = { id: string; name: string; qty: string; on: boolean };
export type RentalCat = { id: string; name: string; items: RentalItem[] };
export type RentalLayout = 6 | 8;

export const MAX_PHOTOS = 8;
export const MAX_COLS = 5;

/** [分類, [品項, 數量][]]。品項與數量寫法都是從他那份 Excel 的 22 張工作表整理出來的。 */
const PRESET: [string, [string, string][]][] = [
  ["客廳", [["電視", "1台"], ["沙發", "1組"], ["茶几", "1張"], ["窗簾", "1式"], ["冷氣", "1台"], ["吊燈", "1組"], ["地毯", "1張"], ["鞋櫃", "1組"]]],
  ["餐廳", [["餐桌", "1張"], ["餐桌椅", "4張"], ["吊燈", "1組"], ["冷氣", "1台"]]],
  ["廚房", [["冰箱", "1台"], ["微波烤爐", "1台"], ["洗碗機", "1台"]]],
  ["主臥室", [["雙人床墊", "1張"], ["床架", "1組"], ["床頭櫃", "1組"], ["衣櫃", "1組"], ["書桌椅", "各1張"], ["冷氣", "1台"], ["窗簾", "1式"]]],
  ["次臥室", [["雙人床墊", "1張"], ["床架", "1組"], ["衣櫃", "1組"], ["書桌椅", "各1張"], ["冷氣", "1台"], ["窗簾", "1式"]]],
  ["衛浴", [["免治馬桶", "1組"], ["暖風機", "1台"], ["鏡櫃", "1組"], ["拉簾", "1式"]]],
  ["陽台", [["熱水器", "1台"], ["洗衣機", "1台"], ["洗滌台", "1組"], ["伸縮拉桿", "1組"]]],
  // 「其他」的數量他是留空手寫的（Excel 裡只有單位），照樣只給單位
  ["其他", [["磁扣(卡)", "個"], ["鑰匙", "支"], ["遙控器", "個"], ["機車etag", "張"]]],
];

let seq = 0;
export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultCats(): RentalCat[] {
  return PRESET.map(([name, items], ci) => ({
    id: `c${ci}`,
    name,
    items: items.map(([n, q], ii) => ({ id: `c${ci}i${ii}`, name: n, qty: q, on: false })),
  }));
}

/** 會印出來的分類：只留有勾的品項；一個都沒勾的分類整組拿掉。 */
export function printableCats(cats: RentalCat[]): RentalCat[] {
  return cats
    .map((c) => ({ ...c, items: c.items.filter((i) => i.on && i.name.trim() !== "") }))
    .filter((c) => c.items.length > 0);
}

export type SheetCell =
  | { kind: "head"; name: string }
  | { kind: "item"; name: string; qty: string }
  | { kind: "empty" };

/**
 * 把分類排進最多 5 欄。前 5 個各佔一欄，之後的接在目前最短那一欄底下（一樣長取左邊）。
 * 回傳「一列一列」的格子，每列長度＝欄數，直接拿去畫表格。
 */
export function layoutTable(cats: RentalCat[]): { cols: number; rows: SheetCell[][] } {
  const list = printableCats(cats);
  const cols = Math.min(MAX_COLS, list.length);
  if (cols === 0) return { cols: 0, rows: [] };
  const columns: SheetCell[][] = Array.from({ length: cols }, () => []);
  list.forEach((cat, idx) => {
    let target = idx;
    if (idx >= cols) {
      target = 0;
      for (let c = 1; c < cols; c++) if (columns[c].length < columns[target].length) target = c;
    }
    columns[target].push({ kind: "head", name: cat.name.trim() || "（未命名）" });
    for (const it of cat.items) columns[target].push({ kind: "item", name: it.name.trim(), qty: it.qty.trim() });
  });
  const height = Math.max(...columns.map((c) => c.length));
  const rows: SheetCell[][] = [];
  for (let r = 0; r < height; r++) rows.push(columns.map((c) => c[r] ?? { kind: "empty" }));
  return { cols, rows };
}

/** 存在瀏覽器的那一份（照片不存，只存文字）。 */
export type RentalDraft = {
  name: string;
  layout: RentalLayout;
  fit: "cover" | "contain";
  captions: string[];
  cats: RentalCat[];
  note: string;
};

export function emptyDraft(): RentalDraft {
  return { name: "", layout: 6, fit: "cover", captions: Array(MAX_PHOTOS).fill(""), cats: defaultCats(), note: "" };
}

/** localStorage 讀回來的東西不能信：欄位缺了、型別不對一律補回預設，不讓畫面炸掉。 */
export function reviveDraft(raw: unknown): RentalDraft {
  const base = emptyDraft();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const captions = Array.isArray(o.captions) ? o.captions.slice(0, MAX_PHOTOS).map(str) : [];
  while (captions.length < MAX_PHOTOS) captions.push("");
  const cats: RentalCat[] = Array.isArray(o.cats)
    ? o.cats
        .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
        .map((c) => ({
          id: str(c.id) || newId("c"),
          name: str(c.name),
          items: Array.isArray(c.items)
            ? c.items
                .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
                .map((i) => ({ id: str(i.id) || newId("i"), name: str(i.name), qty: str(i.qty), on: i.on === true }))
            : [],
        }))
    : base.cats;
  return {
    name: str(o.name),
    layout: o.layout === 8 ? 8 : 6,
    fit: o.fit === "contain" ? "contain" : "cover",
    captions,
    cats: cats.length > 0 ? cats : base.cats,
    note: str(o.note),
  };
}
