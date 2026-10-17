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
export type Outcome =
  | "ok"
  | "bad_request"
  | "rate_limited"
  /** This deployment is missing its settings - distinct from Azure failing,
   *  because the fix is a redeploy rather than a retry. */
  | "misconfigured"
  | "upstream_error";

export type RequestLog = {
  outcome: Outcome;
  status: number;
  latencyMs: number;
  /** Which prompt revision produced this - see `SYSTEM_PROMPT_VERSION`. */
  promptVersion?: string;
  /** Where the client identity came from. "none" means every anonymous
   *  request is sharing one rate-limit bucket - alert on it. */
  clientKeySource?: string;
  /** Length only - never the text itself. */
  messageChars?: number;
  historyMessages?: number;
  promptTokens?: number;
  completionTokens?: number;
  /** Tokens served from Azure OpenAI prompt caching (section 4). */
  cachedTokens?: number;
  /** Why the upstream call failed - see `upstreamFields`. */
  upstreamStatus?: number;
  upstreamCode?: string;
  upstreamParam?: string;
};

/**
 * Pulls the diagnosable parts out of an Azure SDK error.
 *
 * Status, code and param only - never the error message, which is free text
 * and could in principle echo part of the request. These three are enough to
 * name the actual fault: 401 is a bad key, 404 a wrong deployment name, 429
 * Azure-side throttling, and a 400 naming `max_tokens` means the deployed
 * model wants `max_completion_tokens` instead.
 */
export function upstreamFields(error: unknown): {
  upstreamStatus?: number;
  upstreamCode?: string;
  upstreamParam?: string;
} {
  if (typeof error !== "object" || error === null) return {};
  const { status, code, param } = error as Record<string, unknown>;

  return {
    upstreamStatus: typeof status === "number" ? status : undefined,
    upstreamCode: typeof code === "string" ? code : undefined,
    upstreamParam: typeof param === "string" ? param : undefined,
  };
}

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
