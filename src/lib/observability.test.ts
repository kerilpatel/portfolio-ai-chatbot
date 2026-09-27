import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import { hashClientKey, logRequest } from "./observability.ts";

describe("hashClientKey", () => {
  it("is stable for the same key", () => {
    assert.equal(hashClientKey("1.2.3.4"), hashClientKey("1.2.3.4"));
  });

  it("differs between keys", () => {
    assert.notEqual(hashClientKey("1.2.3.4"), hashClientKey("1.2.3.5"));
  });

  // The whole point: an IP must not be recoverable from the logs.
  it("does not contain the raw address", () => {
    assert.ok(!hashClientKey("1.2.3.4").includes("1.2.3.4"));
  });
});

describe("logRequest", () => {
  function capture(fn: () => void): Record<string, unknown> {
    const lines: string[] = [];
    const spy = mock.method(console, "log", (line: string) => {
      lines.push(line);
    });
    try {
      fn();
    } finally {
      spy.mock.restore();
    }
    assert.equal(lines.length, 1, "expected exactly one log line");
    return JSON.parse(lines[0]);
  }

  it("emits one parseable line with the hashed client", () => {
    const entry = capture(() =>
      logRequest("1.2.3.4", { outcome: "ok", status: 200, latencyMs: 42 }),
    );
    assert.equal(entry.event, "chat_request");
    assert.equal(entry.client, hashClientKey("1.2.3.4"));
    assert.equal(entry.status, 200);
    assert.equal(entry.latencyMs, 42);
  });

  it("never logs the raw client key", () => {
    const entry = capture(() =>
      logRequest("9.9.9.9", { outcome: "ok", status: 200, latencyMs: 1 }),
    );
    assert.ok(!JSON.stringify(entry).includes("9.9.9.9"));
  });

  it("omits fields that were not measured", () => {
    const entry = capture(() =>
      logRequest("1.1.1.1", {
        outcome: "rate_limited",
        status: 429,
        latencyMs: 0,
      }),
    );
    assert.ok(!("promptTokens" in entry));
    assert.ok(!("messageChars" in entry));
  });

  it("includes token counts when present", () => {
    const entry = capture(() =>
      logRequest("1.1.1.1", {
        outcome: "ok",
        status: 200,
        latencyMs: 10,
        promptTokens: 500,
        completionTokens: 80,
        cachedTokens: 448,
      }),
    );
    assert.equal(entry.promptTokens, 500);
    assert.equal(entry.cachedTokens, 448);
  });
});
