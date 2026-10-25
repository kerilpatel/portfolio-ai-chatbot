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
 * that is `x-forwarded-for`, whose entries *may* carry a port
 * (`1.2.3.4:56789`). A port is documented for Application Gateway and is
 * widely observed on App Service, though Microsoft does not document the
 * format for App Service itself; Front Door appends a bare address. So the
 * port is stripped when present and the address passed through when not -
 * left on, each request would land in its own bucket and the limit would
 * silently never fire.
 */
/** Which header the key came from, or that neither was present. */
export type ClientKeySource = "forwarded" | "real-ip" | "none";

function normalise(address: string): string {
  const bracketed = address.match(/^\[(.+)\]:\d+$/); // [::1]:56789
  if (bracketed) return bracketed[1];

  const withPort = address.match(/^(\d+\.\d+\.\d+\.\d+):\d+$/); // 1.2.3.4:56789
  if (withPort) return withPort[1];

  return address;
}

/**
 * How many proxies in front of this service are trusted to have appended to
 * `x-forwarded-for`. One is right for App Service or a Static Web App taking
 * traffic directly; put Front Door or another CDN in front and it becomes two.
 */
function trustedHops(): number {
  const raw = Number(process.env.TRUSTED_PROXY_HOPS);
  return Number.isInteger(raw) && raw > 0 ? raw : 1;
}

/**
 * Picks the entry the nearest trusted proxy added, counting in from the right.
 *
 * `x-forwarded-for` grows left to right, and each proxy appends the address it
 * received the connection from - it does not replace what was already there.
 * So the leftmost entry is simply whatever the caller claimed, and reading it
 * means a caller can send a different value on every request and never exhaust
 * an allowance. The rightmost entries are the ones a proxy wrote, and are the
 * only trustworthy ones.
 *
 * With one trusted hop, `client, REAL` yields REAL. If a caller prepends junk,
 * `junk, spoof, REAL` still yields REAL.
 */
function trustedEntry(value: string): string | undefined {
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) return undefined;

  // Short of the expected hops means the header is not what we assumed, so
  // fall back to the leftmost rather than reading past the start.
  const index = Math.max(0, entries.length - trustedHops());
  return entries[index];
}

/**
 * Identifies the caller, and reports where the identity came from.
 *
 * The source matters because of what happens without one: every anonymous
 * request shares the single "unknown" bucket, so one heavy caller would
 * exhaust the allowance for every visitor at once. Behind Azure the header is
 * always set, so `source: "none"` means the deployment topology is wrong
 * rather than that a visitor is unusual - and it is worth alerting on.
 */
export function identifyClient(headers: Headers): {
  key: string;
  source: ClientKeySource;
} {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const entry = trustedEntry(forwarded);
    if (entry) return { key: normalise(entry), source: "forwarded" };
  }

  // x-real-ip is written by the proxy as a single value, so there is no chain
  // to walk and nothing a caller can prepend.
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return { key: normalise(realIp), source: "real-ip" };

  return { key: "unknown", source: "none" };
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
