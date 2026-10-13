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
