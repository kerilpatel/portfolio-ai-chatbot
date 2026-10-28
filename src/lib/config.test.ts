import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  MAX_REPLY_TOKENS,
  MAX_RETRIES,
  azureConfig,
  generationParams,
  missingConfig,
  supportsStreamOptions,
  timeoutMs,
} from "./config.ts";

const KEYS = [
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_DEPLOYMENT",
  "AZURE_OPENAI_API_VERSION",
  "AZURE_OPENAI_TIMEOUT_MS",
  "AZURE_OPENAI_REASONING_MODEL",
];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function setAll() {
  for (const key of KEYS.slice(0, 4)) process.env[key] = "value";
}

describe("azureConfig", () => {
  it("returns the config once everything is present", () => {
    setAll();
    const result = azureConfig();
    assert.ok(result.ok);
    assert.equal(result.config.deployment, "value");
  });

  // It must report rather than throw, so the caller can log a misconfigured
  // deploy separately from an upstream failure.
  it("reports missing names instead of throwing", () => {
    setAll();
    delete process.env.AZURE_OPENAI_ENDPOINT;
    const result = azureConfig();
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.missing.includes("AZURE_OPENAI_ENDPOINT"));
  });

  it("agrees with missingConfig", () => {
    setAll();
    delete process.env.AZURE_OPENAI_API_KEY;
    assert.deepEqual(missingConfig(), ["AZURE_OPENAI_API_KEY"]);
  });
});

describe("timeoutMs", () => {
  it("defaults to 30s, well inside App Service's ~230s cutoff", () => {
    delete process.env.AZURE_OPENAI_TIMEOUT_MS;
    assert.equal(timeoutMs(), 30_000);
  });

  it("honours a valid override", () => {
    process.env.AZURE_OPENAI_TIMEOUT_MS = "2000";
    assert.equal(timeoutMs(), 2000);
  });

  it("falls back on junk, zero or negative values", () => {
    for (const bad of ["abc", "", "0", "-5"]) {
      process.env.AZURE_OPENAI_TIMEOUT_MS = bad;
      assert.equal(timeoutMs(), 30_000, `should reject ${JSON.stringify(bad)}`);
    }
  });

  it("keeps the worst case under the platform limit", () => {
    delete process.env.AZURE_OPENAI_TIMEOUT_MS;
    assert.ok(timeoutMs() * (MAX_RETRIES + 1) < 230_000);
  });
});

describe("supportsStreamOptions", () => {
  // Dated GA versions do not declare stream_options, and Azure answers an
  // unrecognised request argument with 400 - so sending it would break every
  // streamed request rather than merely lose the token counts.
  it("is false for the dated GA versions", () => {
    for (const version of ["2024-10-21", "2024-06-01", "2023-05-15"]) {
      process.env.AZURE_OPENAI_API_VERSION = version;
      assert.equal(
        supportsStreamOptions(),
        false,
        `expected false: ${version}`,
      );
    }
  });

  it("is true for the v1 API and preview versions", () => {
    for (const version of ["v1", "preview", "2024-09-01-preview"]) {
      process.env.AZURE_OPENAI_API_VERSION = version;
      assert.equal(supportsStreamOptions(), true, `expected true: ${version}`);
    }
  });

  it("is false when unset, the safer default", () => {
    delete process.env.AZURE_OPENAI_API_VERSION;
    assert.equal(supportsStreamOptions(), false);
  });
});

describe("generationParams", () => {
  it("sends max_tokens and temperature for an ordinary deployment", () => {
    delete process.env.AZURE_OPENAI_REASONING_MODEL;
    const params = generationParams();
    assert.equal(params.max_tokens, MAX_REPLY_TOKENS);
    assert.equal(params.temperature, 0.3);
    assert.ok(!("max_completion_tokens" in params));
  });

  // Reasoning models reject max_tokens AND temperature, so switching only the
  // token parameter would just move the 400 to the next one.
  it("drops temperature and renames the token cap for a reasoning model", () => {
    process.env.AZURE_OPENAI_REASONING_MODEL = "true";
    const params = generationParams();
    assert.equal(params.max_completion_tokens, MAX_REPLY_TOKENS);
    assert.ok(!("max_tokens" in params), "max_tokens is rejected");
    assert.ok(!("temperature" in params), "temperature is rejected");
  });

  it("treats anything other than true as an ordinary deployment", () => {
    for (const value of ["false", "1", "yes", "", "TRUE"]) {
      process.env.AZURE_OPENAI_REASONING_MODEL = value;
      assert.ok(
        "max_tokens" in generationParams(),
        `should not opt in for ${JSON.stringify(value)}`,
      );
    }
  });
});
