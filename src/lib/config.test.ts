import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  MAX_RETRIES,
  azureConfig,
  missingConfig,
  timeoutMs,
} from "./config.ts";

const KEYS = [
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_DEPLOYMENT",
  "AZURE_OPENAI_API_VERSION",
  "AZURE_OPENAI_TIMEOUT_MS",
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
