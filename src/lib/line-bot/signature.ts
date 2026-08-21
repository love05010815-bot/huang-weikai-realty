/**
 * LINE webhook 簽章驗證
 *
 * ⚠️ 這一支不能省。沒有驗簽，任何人只要知道你的 webhook 網址，
 *    就能無限量丟假訊息進來燒你的 Claude API 費用，而且你的機器人
 *    會對著空氣講話。LINE 每一個 request 都會帶 x-line-signature，
 *    用 channel secret 對 raw body 算 HMAC-SHA256 再比對即可。
 *
 * 注意：一定要用「原始未解析的 body 字串」去算。
 *      先 JSON.parse 再 JSON.stringify 會改變空白與鍵序，簽章一定不合。
 */
import { createHmac, timingSafeEqual } from "crypto";

export function verifyLineSignature(
  rawBody: string,
  signature: string | null,
  channelSecret: string,
): boolean {
  if (!signature || !channelSecret) return false;

  const expected = createHmac("sha256", channelSecret).update(rawBody).digest("base64");

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(signature);

  // 長度不同時 timingSafeEqual 會直接丟例外，必須先擋掉
  if (expectedBuffer.length !== providedBuffer.length) return false;

  // 用 timingSafeEqual 而非 ===，避免時序攻擊逐字元猜出簽章
  return timingSafeEqual(expectedBuffer, providedBuffer);
}
