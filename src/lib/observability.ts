import { createHash } from "node:crypto";

/**
 * Structured request logging (plan section 7) - one JSON line per request, so
 * Azure log queries can aggregate latency, token spend and outcomes. Also the
 * groundwork for online evaluation (section 6).
 *
 * Deliberately metadata only: no message or reply text, and the client key is
 * hashed rather than logged as a raw IP. Sampling real conversation content
 * for online eval is a separate decision with its own privacy tradeoff.
 */
export type Outcome = "ok" | "bad_request" | "rate_limited" | "upstream_error";

export type RequestLog = {
  outcome: Outcome;
  status: number;
  latencyMs: number;
  /** Length only - never the text itself. */
  messageChars?: number;
  historyMessages?: number;
  promptTokens?: number;
  completionTokens?: number;
  /** Tokens served from Azure OpenAI prompt caching (section 4). */
  cachedTokens?: number;
};

/** Truncated digest: correlates requests from one visitor without storing the
 *  IP. Not reversible to an address in practice. */
export function hashClientKey(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 12);
}

export function logRequest(client: string, entry: RequestLog): void {
  const defined = Object.fromEntries(
    Object.entries(entry).filter(([, value]) => value !== undefined),
  );
  console.log(
    JSON.stringify({
      event: "chat_request",
      client: hashClientKey(client),
      ...defined,
    }),
  );
}
