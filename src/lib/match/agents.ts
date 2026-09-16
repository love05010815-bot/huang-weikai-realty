/**
 * 「新預約要通知誰」—— 專員（黃瑋凱本人與他的工作帳）的 LINE userId
 *
 * 2026-09-16 從寫死在 config/match.ts 改成後台可以自己勾：他有兩支 LINE（工作帳與本人 0909），
 * 以後要多一支、少一支都不該再等我改程式部署。
 *
 * ⚠️ 一支 LINE 要收得到官方帳號的推播，**那支帳號必須先加官方帳號好友**（LINE 的規矩，
 *    沒加過就拿不到 userId、也推不過去）。所以後台那份清單是「跟官方帳號講過話的人」，
 *    名字沒出現在清單裡就是還沒加好友。
 *
 * 存在 appointment_config（跟同步時間、Google token 同一張表），值是 JSON 字串陣列。
 * 從來沒存過（null）＝ 還沒設定過 → 用 config/match.ts 的預設；
 * 存成空陣列 ＝ 他刻意關掉全部通知，就真的不推。這兩件事不一樣，別混。
 */
import { MATCH } from "@/config/match";
import { getConfig, setConfig } from "@/lib/google-calendar";

const KEY = "match_agent_line_ids";

/** LINE userId 長這樣：U + 32 個十六進位字元 */
const USER_ID_RE = /^U[0-9a-f]{32}$/i;

/**
 * 每則進來的訊息都要先問「這是不是專員傳的」，不快取的話等於每則訊息多一次資料庫查詢。
 * 60 秒夠短（後台改完一分鐘內生效），也夠長（省掉大部分查詢）。
 */
let cache: { ids: string[]; at: number } | null = null;
const TTL_MS = 60_000;

export async function getAgentLineIds(): Promise<string[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.ids;
  let ids: string[];
  try {
    const raw = await getConfig(KEY);
    if (raw == null) {
      ids = [...MATCH.agentLineUserIds];
    } else {
      const parsed = JSON.parse(raw);
      ids = Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string" && USER_ID_RE.test(v)) : [];
    }
  } catch (e) {
    console.error("[match/agents] 讀取通知名單失敗，改用預設:", e);
    ids = [...MATCH.agentLineUserIds];
  }
  cache = { ids, at: Date.now() };
  return ids;
}

export async function setAgentLineIds(ids: string[]): Promise<string[]> {
  const clean = Array.from(new Set(ids.filter((v) => typeof v === "string" && USER_ID_RE.test(v)))).slice(0, 20);
  await setConfig(KEY, JSON.stringify(clean));
  cache = { ids: clean, at: Date.now() };
  return clean;
}

/** 這則訊息是專員本人傳的嗎 —— 決定要不要當成指令，而不是當成買方 */
export async function isAgent(lineUserId: string): Promise<boolean> {
  return (await getAgentLineIds()).includes(lineUserId);
}
