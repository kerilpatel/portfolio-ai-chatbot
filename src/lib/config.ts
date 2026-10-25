/**
 * Single source of truth for the Azure settings the chat path needs.
 *
 * Shared by the chat route and the health probe so the two cannot drift: a
 * var added here is immediately both enforced and reported.
 */
export const REQUIRED_VARS = [
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_DEPLOYMENT",
  "AZURE_OPENAI_API_VERSION",
] as const;

/**
 * The SDK defaults to a 10 minute timeout and retries timeouts twice, so an
 * unanswered request could hold a visitor for roughly half an hour. App
 * Service cuts the connection long before that - the documented figures are
 * 230s on Windows and 240s on Linux, both from the load balancer's four
 * minute idle timeout - so the visitor would see a platform error page rather
 * than the contact-redirect reply, and the graceful fallback would be
 * invisible exactly when it is needed.
 *
 * 30s is generous for a reply capped at 400 tokens, and one retry covers a
 * transient blip while keeping the worst case near 60s - far inside the lower
 * of the two figures, so the hosting choice cannot invalidate it. Override per
 * environment with AZURE_OPENAI_TIMEOUT_MS.
 */
const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_RETRIES = 1;

export function timeoutMs(): number {
  const raw = Number(process.env.AZURE_OPENAI_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

export type AzureConfig = {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
};

/** Names of absent settings - names only, never values. */
export function missingConfig(): string[] {
  return REQUIRED_VARS.filter((name) => !process.env[name]);
}

/**
 * Returns the config, or the names of what is absent. Deliberately not a
 * throw: a missing setting is a broken deploy, not an upstream failure, and
 * the caller needs to tell those apart when it logs.
 */
export function azureConfig():
  { ok: true; config: AzureConfig } | { ok: false; missing: string[] } {
  const missing = missingConfig();
  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    config: {
      endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
      apiKey: process.env.AZURE_OPENAI_API_KEY!,
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT!,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION!,
    },
  };
}
