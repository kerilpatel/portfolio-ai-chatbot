/**
 * Per-visitor rate limiting (plan section 5, guardrail layer 4).
 *
 * Sliding window held in memory. That means the counters reset on redeploy and
 * are per-instance, so scaling out past one instance weakens the limit - at
 * which point this should move to Redis or Azure AI Search alongside the
 * semantic cache. For a personal portfolio the tradeoff is fine: the goal is
 * to blunt a script hammering the endpoint, not to be exact.
 */
const WINDOW_MS = 15 * 60 * 1000;
export const MAX_REQUESTS = 20;

/** Full sweep cadence, to stop the map growing without bound. */
const SWEEP_INTERVAL_MS = 60 * 1000;

const hits = new Map<string, number[]>();
let lastSweep = 0;

/**
 * `req.ip` was removed in Next 15 - the hosting provider supplies it. On Azure
 * that is `x-forwarded-for`, whose entries carry a port (`1.2.3.4:56789`),
 * so the port is stripped or every request would land in its own bucket.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for") ?? headers.get("x-real-ip");
  const first = forwarded?.split(",")[0]?.trim();
  if (!first) return "unknown";

  const bracketed = first.match(/^\[(.+)\]:\d+$/); // [::1]:56789
  if (bracketed) return bracketed[1];

  const withPort = first.match(/^(\d+\.\d+\.\d+\.\d+):\d+$/); // 1.2.3.4:56789
  if (withPort) return withPort[1];

  return first;
}

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, timestamps] of hits) {
    const live = timestamps.filter((t) => now - t < WINDOW_MS);
    if (live.length === 0) hits.delete(key);
    else hits.set(key, live);
  }
}

export type RateLimitResult =
  /** `resetSeconds` is when the oldest hit ages out and the allowance starts
   *  recovering - surfaced so the UI can warn before the wall, rather than
   *  only reacting once the visitor has hit it. */
  | { allowed: true; remaining: number; resetSeconds: number }
  | { allowed: false; retryAfterSeconds: number; resetSeconds: number };

/** Standard rate-limit headers, so the client can show its own allowance. */
export function rateLimitHeaders(
  result: RateLimitResult,
): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(MAX_REQUESTS),
    "X-RateLimit-Remaining": String(result.allowed ? result.remaining : 0),
    "X-RateLimit-Reset": String(result.resetSeconds),
  };
}

export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  // When the oldest hit ages out, a slot frees up. Always at least 1s.
  const resetIn = (timestamps: number[]) =>
    timestamps.length === 0
      ? Math.ceil(WINDOW_MS / 1000)
      : Math.max(1, Math.ceil((timestamps[0] + WINDOW_MS - now) / 1000));

  if (recent.length >= MAX_REQUESTS) {
    hits.set(key, recent);
    const retryAfterSeconds = resetIn(recent);
    return {
      allowed: false,
      retryAfterSeconds,
      resetSeconds: retryAfterSeconds,
    };
  }

  recent.push(now);
  hits.set(key, recent);
  return {
    allowed: true,
    remaining: MAX_REQUESTS - recent.length,
    resetSeconds: resetIn(recent),
  };
}

/** Test seam - the module-level map otherwise persists across cases. */
export function __resetRateLimit() {
  hits.clear();
  lastSweep = 0;
}
