/**
 * 預約完成後給「用電腦的買方」掃的 QR code
 *
 * 為什麼需要：導到官方 LINE 的那顆按鈕走的是 `https://line.me/R/oaMessage/...`，
 * 那是 LINE 的手機深層連結 —— **在桌機瀏覽器按下去會被導到 line.me 官網首頁**，
 * 買方以為壞掉了（2026-09-18 他自己在電腦上測到）。
 *
 * 所以電腦版改成顯示 QR：手機掃了會開啟官方帳號聊天室、訊息已經預先填好，按送出就完成綁定。
 *
 * 用 qrcode-generator（零相依、MIT）產生 GIF 的 data URL，直接塞進 <img src>，
 * 不用另外開端點、也不用把資料送到第三方的 QR 產生服務。
 */
import qrcode from "qrcode-generator";

/**
 * @param text     要編碼的內容（這裡是 oaMessageUrl）
 * @param cellSize 一個點幾 px。5 在手機上掃得很順，圖也才 2KB 左右
 * @param margin   四周留白，太小的話某些相機對不到焦
 */
export function qrDataUrl(text: string, cellSize = 5, margin = 12): string {
  // 版本 0 = 依內容長度自動選；容錯等級 M 是印刷品與螢幕的常用值
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createDataURL(cellSize, margin);
}
