import { SYSTEM_PROMPT_VERSION } from "./system-prompt.ts";

/**
 * Health payload for Azure's deployment probe (plan section 8).
 *
 * Reports whether the Azure settings are *present*, never their values, so a
 * misconfigured deploy is diagnosable without the endpoint leaking anything.
 */
const REQUIRED_VARS = [
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_DEPLOYMENT",
  "AZURE_OPENAI_API_VERSION",
] as const;

export type Health = {
  status: "ok";
  /** Which prompt revision this instance is serving - see system-prompt.ts. */
  promptVersion: string;
  /** All Azure settings present. False means chat will fall back, even though
   *  the process itself is up. */
  configured: boolean;
  /** Names of the missing settings - names only, never values. */
  missing: string[];
  uptimeSeconds: number;
};

export function health(uptimeSeconds: number): Health {
  const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
  return {
    status: "ok",
    promptVersion: SYSTEM_PROMPT_VERSION,
    configured: missing.length === 0,
    missing,
    uptimeSeconds: Math.floor(uptimeSeconds),
  };
}
