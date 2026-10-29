import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { health } from "./health.ts";
import { SYSTEM_PROMPT_VERSION } from "./system-prompt.ts";

const REQUIRED = [
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_DEPLOYMENT",
  "AZURE_OPENAI_API_VERSION",
];
const saved = Object.fromEntries(REQUIRED.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/** A valid endpoint matters: it is URL-validated, so a placeholder fails. */
function setAll() {
  process.env.AZURE_OPENAI_ENDPOINT = "https://example.openai.azure.com";
  process.env.AZURE_OPENAI_API_KEY = "set";
  process.env.AZURE_OPENAI_DEPLOYMENT = "set";
  process.env.AZURE_OPENAI_API_VERSION = "set";
}

describe("health", () => {
  it("reports configured once every setting is present", () => {
    setAll();
    const result = health(12.7);
    assert.equal(result.configured, true);
    assert.deepEqual(result.missing, []);
  });

  it("names the missing settings without reporting configured", () => {
    setAll();
    delete process.env.AZURE_OPENAI_API_KEY;
    const result = health(0);
    assert.equal(result.configured, false);
    assert.deepEqual(result.missing, ["AZURE_OPENAI_API_KEY"]);
  });

  // The endpoint is public, so it must never echo a credential.
  it("never includes a setting's value", () => {
    setAll();
    process.env.AZURE_OPENAI_API_KEY = "super-secret-value";
    const serialised = JSON.stringify(health(1));
    assert.ok(!serialised.includes("super-secret-value"));
  });

  it("still reports status ok when unconfigured - the process is up", () => {
    for (const key of REQUIRED) delete process.env[key];
    assert.equal(health(1).status, "ok");
  });

  it("carries the prompt version and a whole-second uptime", () => {
    const result = health(12.7);
    assert.equal(result.promptVersion, SYSTEM_PROMPT_VERSION);
    assert.equal(result.uptimeSeconds, 12);
  });
});
