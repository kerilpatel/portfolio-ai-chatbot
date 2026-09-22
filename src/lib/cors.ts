/**
 * CORS for the cross-origin call from `portfolio-website` (plan section 8).
 *
 * `ALLOWED_ORIGIN` is a comma-separated allowlist, e.g.
 *   ALLOWED_ORIGIN=http://localhost:5173,https://example.com
 *
 * Fails closed: if the variable is unset, no origin is allowed and browsers
 * will block the response. We never reply with `*` - the allowlist is the
 * point.
 */
function allowlist(): string[] {
  return (process.env.ALLOWED_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isAllowedOrigin(origin: string | null): origin is string {
  return origin !== null && allowlist().includes(origin);
}

/**
 * Headers to merge into every response. `Vary: Origin` is always sent, even
 * when the origin is rejected, so shared caches never serve one site's
 * allow-header to another origin.
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin" };

  if (isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }

  return headers;
}
