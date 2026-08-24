/**
 * 呼叫 Claude 產生客服回覆
 *
 * 設計取捨（先看懂再改）：
 *  - 不用 streaming：LINE 是一次送出整則訊息，沒有「逐字浮現」的介面，串流沒有意義。
 *  - effort 用 low：客服 FAQ 是簡單任務，低 effort 回得快又便宜，品質綽綽有餘。
 *  - 不關閉 thinking：Opus 5 關掉思考反而有已知副作用（可能把內部標記寫進回覆），
 *    官方建議是「留著思考、把 effort 調低」，成本一樣省。
 *  - system prompt 掛 cache_control：知識庫是固定不變的長文，快取命中約可省 90% 的
 *    輸入費用。連續對話時最有感（快取 5 分鐘內有效）。
 */
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, MAX_REPLY_TOKENS } from "@/config/line-bot";
import { buildListingsContext } from "@/lib/line-bot/listings-context";
import type { StoredMessage } from "@/lib/line-bot/store";

/** 客服助理用的模型。要換成更便宜的可以改 claude-haiku-4-5。 */
const MODEL = "claude-opus-5";

let _client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic();
  return _client;
}

export type AiResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

/**
 * 把歷史整理成 API 收得下的樣子。
 * 規矩：第一則必須是 user。歷史被截斷時開頭可能是 assistant，要削掉，
 * 否則 API 直接回 400。
 */
function normalizeHistory(history: StoredMessage[]): Anthropic.MessageParam[] {
  const trimmed = [...history];
  while (trimmed.length > 0 && trimmed[0].role !== "user") {
    trimmed.shift();
  }
  return trimmed.map((m) => ({ role: m.role, content: m.content }));
}

export async function generateReply(
  history: StoredMessage[],
  userMessage: string,
): Promise<AiResult> {
  const client = getClient();
  if (!client) {
    return { ok: false, reason: "missing_anthropic_api_key" };
  }

  const messages: Anthropic.MessageParam[] = [
    ...normalizeHistory(history),
    { role: "user", content: userMessage },
  ];

  // 目前在售物件。讀不到就是 null，這時不加這一段，AI 會照原規則說
  // 「我請瑋凱跟您確認」而不是亂編物件。
  const listingsBlock = await buildListingsContext();

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_REPLY_TOKENS,
      // 低 effort：客服問答不需要深思，回得快、花得少
      output_config: { effort: "low" },
      // ⚠️ 兩段是刻意分開的，不要合併成一個字串：
      //    第一段是固定不變的知識庫與紅線，掛 cache_control 才快取得到（省約 90% 輸入費用）。
      //    第二段是會變動的在售物件 —— 快取是「前綴比對」，只要物件一改，
      //    合在一起的話整包快取就作廢。分開放，你在後台改物件不會害快取失效。
      system: [
        {
          type: "text",
          text: buildSystemPrompt(),
          cache_control: { type: "ephemeral" },
        },
        ...(listingsBlock ? [{ type: "text" as const, text: listingsBlock }] : []),
      ],
      messages,
    });

    // 安全機制擋下來的情況。機率極低（房產問答不會觸發），
    // 但擋下來時沒有 text 區塊，不處理就會變成已讀不回。
    if (response.stop_reason === "refusal") {
      console.error("[line-bot] AI 拒答", response.stop_details?.category);
      return { ok: false, reason: "refusal" };
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (!text) {
      return { ok: false, reason: "empty_response" };
    }

    // 觀察快取有沒有生效用的。cache_read 一直是 0 代表 system prompt 有東西在變動。
    console.log(
      `[line-bot] tokens in=${response.usage.input_tokens} out=${response.usage.output_tokens}` +
        ` cache_read=${response.usage.cache_read_input_tokens ?? 0}` +
        ` cache_write=${response.usage.cache_creation_input_tokens ?? 0}`,
    );

    return { ok: true, text };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("[line-bot] ANTHROPIC_API_KEY 無效");
      return { ok: false, reason: "bad_api_key" };
    }
    if (error instanceof Anthropic.RateLimitError) {
      console.error("[line-bot] 觸發 Anthropic 速率限制");
      return { ok: false, reason: "rate_limited" };
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`[line-bot] Anthropic API 錯誤 ${error.status}:`, error.message);
      return { ok: false, reason: `api_error_${error.status}` };
    }
    console.error("[line-bot] AI 呼叫例外:", error);
    return { ok: false, reason: "unknown_error" };
  }
}
