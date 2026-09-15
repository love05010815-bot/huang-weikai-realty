/**
 * 呼叫 OpenAI（ChatGPT 的 API）生成文案。只做一件事：組 prompt → 打 API → 回文字。
 *
 * 不裝 SDK，直接 fetch chat/completions —— 少一個相依、少一個會壞的地方。
 * 金鑰只在伺服器端讀 process.env，不寫 log、不回前端。
 * 規則（口吻、平台字數、紅線）在 src/config/copywriter.ts，這裡不放任何文案內容。
 */
import { COPYWRITER, buildPrompt, systemPrompt, type CopySource } from "@/config/copywriter";
import type { NewsLine } from "@/lib/news";

export function isCopywriterConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY?.trim();
}

export function copywriterModel(): string {
  return process.env.OPENAI_MODEL?.trim() || COPYWRITER.DEFAULT_MODEL;
}

export type CopyResult = {
  text: string;
  model: string;
  ms: number;
  tokensIn: number;
  tokensOut: number;
  /** 被 token 上限截斷（finish_reason = length），結尾可能不完整 */
  truncated: boolean;
};

/** 講人話的錯誤：訊息會直接顯示在後台。 */
export class CopywriterError extends Error {}

type ChatResponse = {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: string; type?: string };
};

/** 把 OpenAI 的錯誤翻成他看得懂、知道要去哪裡處理的一句話。 */
function explain(status: number, json: ChatResponse | null, model: string): string {
  const msg = json?.error?.message || "";
  const code = `${json?.error?.code || ""} ${json?.error?.type || ""}`;
  if (status === 401) return "OpenAI 說金鑰無效（401）：檢查 Vercel 的 OPENAI_API_KEY 有沒有貼完整、有沒有被撤銷。";
  if (status === 429 && /quota|billing/i.test(`${code} ${msg}`)) {
    return "OpenAI 帳戶沒有額度了（insufficient_quota）：到 platform.openai.com → Billing 儲值後再按。";
  }
  if (status === 429) return "OpenAI 說太頻繁（429），等一分鐘再按。";
  if (status === 404 || (/model/i.test(code) && /not (found|exist)|does not exist/i.test(msg))) {
    return `OpenAI 找不到模型「${model}」：到 Vercel 改 OPENAI_MODEL 環境變數（或清空用預設）。`;
  }
  return `OpenAI 回錯誤 ${status}：${msg || code.trim() || "沒有說明"}`;
}

export async function generateCopy(line: NewsLine, src: CopySource): Promise<CopyResult> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new CopywriterError("還沒設定 OPENAI_API_KEY。");
  const model = copywriterModel();
  const started = Date.now();

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemPrompt() },
      { role: "user", content: buildPrompt(line, src) },
    ],
    max_completion_tokens: COPYWRITER.MAX_OUTPUT_TOKENS[line],
  };
  // gpt-5 與 o 系列是推理模型：不吃 temperature、但吃 reasoning_effort。其他模型送了會 400。
  if (/^(gpt-5|o\d)/i.test(model)) body.reasoning_effort = COPYWRITER.REASONING_EFFORT;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COPYWRITER.TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new CopywriterError(`等了 ${Math.round(COPYWRITER.TIMEOUT_MS / 1000)} 秒 OpenAI 還沒寫完，請再按一次（或換快一點的模型）。`);
    }
    throw new CopywriterError(`連不上 OpenAI：${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }

  const json = (await res.json().catch(() => null)) as ChatResponse | null;
  if (!res.ok) throw new CopywriterError(explain(res.status, json, model));

  const choice = json?.choices?.[0];
  const text = choice?.message?.content?.trim() || "";
  if (!text) throw new CopywriterError("OpenAI 回了空的內容（多半是推理吃光 token 上限），請再按一次。");

  return {
    text,
    model,
    ms: Date.now() - started,
    tokensIn: Number(json?.usage?.prompt_tokens ?? 0),
    tokensOut: Number(json?.usage?.completion_tokens ?? 0),
    truncated: choice?.finish_reason === "length",
  };
}
