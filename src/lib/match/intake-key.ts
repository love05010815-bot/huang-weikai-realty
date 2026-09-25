/**
 * 手機快速建檔連結的金鑰 —— 不用登入 Google 的那條路。
 *
 * 他在外面接到買方來電時要「馬上打開就能輸入」，後台的 Google 登入太慢、也常過期，
 * 所以另開 /intake?key=… ：**連結本身就是鑰匙**，加到手機桌面一按就開。
 *
 * 金鑰存在 appointment_config（match_intake_key），第一次要用時自動產生；
 * 後台「買方」分頁看得到連結、也可以「重新產生」（舊連結立刻失效）。
 *
 * ⚠️ 拿到這條連結的人可以：新增／更新買方、看配對結果（在售物件本來就是公開的）、
 *    對綁了 LINE 的買方推物件卡（吃額度）。看不到別的買方、不能刪、進不了後台。
 *    外流了就到後台按重新產生。
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { SITE_URL } from "@/config/owner";
import { getConfig, setConfig } from "@/lib/google-calendar";

const KEY = "match_intake_key";
/** 24 bytes → 32 個 base64url 字元，夠長、也不會讓網址難看到爆 */
const newKey = (): string => randomBytes(24).toString("base64url");

export async function getIntakeKey(): Promise<string> {
  const existing = await getConfig(KEY);
  if (existing && existing.length >= 20) return existing;
  const fresh = newKey();
  await setConfig(KEY, fresh);
  return fresh;
}

export async function rotateIntakeKey(): Promise<string> {
  const fresh = newKey();
  await setConfig(KEY, fresh);
  return fresh;
}

/**
 * 純函式：給的鑰匙跟存的一不一樣。用 timingSafeEqual，比對時間不隨「對到第幾個字」變。
 * 太短、不是字串、還沒設定過 —— 一律不過。
 */
export function keysMatch(given: unknown, expected: string | null | undefined): boolean {
  if (typeof given !== "string" || !expected) return false;
  if (given.length < 20) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** 刻意直接讀設定、不走 getIntakeKey —— 驗證不該順手把鑰匙生出來 */
export async function verifyIntakeKey(given: unknown): Promise<boolean> {
  return keysMatch(given, await getConfig(KEY));
}

export async function intakeUrl(): Promise<string> {
  return `${SITE_URL}/intake?key=${encodeURIComponent(await getIntakeKey())}`;
}
