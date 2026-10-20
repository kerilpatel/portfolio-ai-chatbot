/**
 * Conversation history handling (plan section 7).
 *
 * History is supplied by the client on each turn - this service is stateless.
 * That means it is untrusted input, and the strictness below matters: a
 * client that could put a `system` message into the array would be able to
 * overwrite the guardrails in `system-prompt.ts` with one request. Only
 * `user` and `assistant` are accepted, and the real system prompt is always
 * prepended server-side.
 *
 * The caps are the context-quality vs. token-cost tradeoff: every message
 * here is re-billed on every turn.
 */
export const MAX_HISTORY_MESSAGES = 6; // three exchanges
export const MAX_HISTORY_CHARS = 4000;

/**
 * Hard cap on entries accepted before any are inspected. Only the last six
 * survive trimming, so anything beyond this is work done on input that was
 * always going to be discarded - and validating a million-entry array first
 * would be unbounded effort. Generous enough that a real conversation sending
 * its whole history back is never rejected.
 */
export const MAX_HISTORY_ENTRIES = 50;

export type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ParseResult =
  { ok: true; messages: HistoryMessage[] } | { ok: false; error: string };

function isHistoryMessage(value: unknown): value is HistoryMessage {
  if (typeof value !== "object" || value === null) return false;
  const { role, content } = value as Record<string, unknown>;
  return (
    (role === "user" || role === "assistant") &&
    typeof content === "string" &&
    content.trim().length > 0
  );
}

/**
 * Keeps the most recent messages that fit both caps, oldest dropped first.
 * A leading `assistant` message left over after trimming is dropped too, so
 * the window always opens on something the visitor said.
 */
function trim(messages: HistoryMessage[]): HistoryMessage[] {
  const kept: HistoryMessage[] = [];
  let chars = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (kept.length >= MAX_HISTORY_MESSAGES) break;
    if (chars + message.content.length > MAX_HISTORY_CHARS) break;
    chars += message.content.length;
    kept.unshift(message);
  }

  while (kept.length > 0 && kept[0].role === "assistant") kept.shift();
  return kept;
}

export function parseHistory(raw: unknown): ParseResult {
  if (raw === undefined || raw === null) return { ok: true, messages: [] };

  if (!Array.isArray(raw)) {
    return { ok: false, error: "`history` must be an array" };
  }
  // Checked before per-entry validation, so the cost of rejecting an oversized
  // array does not scale with its length.
  if (raw.length > MAX_HISTORY_ENTRIES) {
    return {
      ok: false,
      error: `\`history\` must have at most ${MAX_HISTORY_ENTRIES} entries`,
    };
  }
  if (!raw.every(isHistoryMessage)) {
    return {
      ok: false,
      error:
        "each `history` entry must be { role: 'user' | 'assistant', " +
        "content: non-empty string }",
    };
  }

  return { ok: true, messages: trim(raw) };
}
