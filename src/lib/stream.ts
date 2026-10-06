/**
 * Server-sent-event framing for streamed replies (plan section 7).
 *
 * Kept separate from the route so the framing is testable without Azure: the
 * generator takes any async iterable of chunks shaped like an Azure OpenAI
 * streaming response.
 *
 * Streaming is opt-in (`stream: true`). The plain JSON path stays the default
 * so existing callers and the Promptfoo suite are unaffected.
 */

/** The subset of an Azure streaming chunk this code relies on. */
export type StreamChunk = {
  choices?: Array<{ delta?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  } | null;
};

/** Filled in as the stream runs; read by the caller once it finishes, so the
 *  log line carries real token counts and latency. */
export type StreamStats = {
  text: string;
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
  failed: boolean;
};

export function newStats(): StreamStats {
  return { text: "", failed: false };
}

export const SSE_DONE = "[DONE]";

function event(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Yields SSE frames: `{ delta }` per token, then `[DONE]`.
 *
 * A failure partway through cannot change the status code - the 200 and its
 * headers are already on the wire. So the error is reported in-band as an
 * `{ error }` frame carrying the same contact-redirect text as the non-stream
 * fallback, and the stream is closed normally. The client shows the message
 * instead of a half-finished answer.
 */
export async function* streamSSE(
  chunks: AsyncIterable<StreamChunk>,
  stats: StreamStats,
  fallback: string,
): AsyncGenerator<string> {
  try {
    for await (const chunk of chunks) {
      if (chunk.usage) {
        stats.promptTokens = chunk.usage.prompt_tokens;
        stats.completionTokens = chunk.usage.completion_tokens;
        stats.cachedTokens = chunk.usage.prompt_tokens_details?.cached_tokens;
      }

      const delta = chunk.choices?.[0]?.delta?.content;
      if (!delta) continue; // keep-alive and role-only chunks carry no text

      stats.text += delta;
      yield event({ delta });
    }

    if (stats.text.length === 0) {
      throw new Error("Empty stream from Azure OpenAI");
    }
  } catch {
    stats.failed = true;
    yield event({ error: fallback });
  }

  yield `data: ${SSE_DONE}\n\n`;
}
