/**
 * 愛屋庫存一筆的型別與純函式輔助。
 *
 * 跟 houseol-inventory.ts 分開，是因為那邊用 node:fs 讀檔案，
 * 只能在伺服器端跑；這個檔案要給 client component（挑案表單）用，
 * 混在一起會把 fs 一起打包進瀏覽器端，build 會直接炸掉。
 */

export type HouseolItem = {
  caseId: string;
  title: string;
  community: string;
  totalPrice: string;
  unitPrice: string;
  buildingType: string;
  listedFrom: string;
  listedTo: string;
  registeredPing: string;
  landPing: string;
  parkingPing: string;
  buildingPing: string;
  district: string;
  /**
   * 完整門牌地址。**只會出現在後台**，來源是資料庫的 `houseol_address` 表，
   * 不在 `houseol-inventory.json` 裡（那個檔有版控、repo 是公開的）。
   *
   * 還沒跑過 `push-addresses.js` 就是 undefined —— 少一個便利功能而已，
   * 不影響其他欄位。
   */
  address?: string;
};

/** 給挑案表單用的一行摘要文字，例如「B.大樓｜登記坪 48.62 坪｜總價 888 萬（單價 21.798 萬/坪）」 */
export function houseolItemSummary(item: HouseolItem): string {
  const parts = [item.buildingType, item.registeredPing && `登記坪 ${item.registeredPing} 坪`];
  const price = item.totalPrice && `總價 ${item.totalPrice} 萬${item.unitPrice ? `（單價 ${item.unitPrice} 萬/坪）` : ""}`;
  if (price) parts.push(price);
  return parts.filter(Boolean).join("｜");
}
