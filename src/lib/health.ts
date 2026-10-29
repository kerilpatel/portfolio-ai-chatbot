import { invalidConfig, missingConfig } from "./config.ts";
import { SYSTEM_PROMPT_VERSION } from "./system-prompt.ts";

/**
 * Health payload for Azure's deployment probe (plan section 8).
 *
 * Reports whether the Azure settings are *present*, never their values, so a
 * misconfigured deploy is diagnosable without the endpoint leaking anything.
 */
export type Health = {
  status: "ok";
  /** Which prompt revision this instance is serving - see system-prompt.ts. */
  promptVersion: string;
  /** All Azure settings present. False means chat will fall back, even though
   *  the process itself is up. */
  configured: boolean;
  /** Names of the missing settings - names only, never values. */
  missing: string[];
  /** Names of settings that are present but unusable, such as an endpoint
   *  that is not a valid URL. */
  invalid: string[];
  uptimeSeconds: number;
};

export function health(uptimeSeconds: number): Health {
  const missing = missingConfig();
  const invalid = invalidConfig();
  return {
    status: "ok",
    promptVersion: SYSTEM_PROMPT_VERSION,
    configured: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
    uptimeSeconds: Math.floor(uptimeSeconds),
  };
}
