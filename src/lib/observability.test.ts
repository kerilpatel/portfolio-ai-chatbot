import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import { hashClientKey, logRequest, upstreamFields } from "./observability.ts";

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

describe("upstreamFields", () => {
  it("extracts status, code and param from an SDK error", () => {
    const fields = upstreamFields({
      status: 400,
      code: "unsupported_parameter",
      param: "max_tokens",
    });
    assert.deepEqual(fields, {
      upstreamStatus: 400,
      upstreamCode: "unsupported_parameter",
      upstreamParam: "max_tokens",
    });
  });

  // The message is free text and could echo part of the request, so it must
  // never reach the log.
  it("never carries the error message", () => {
    const fields = upstreamFields({
      status: 400,
      message: "Invalid value for 'messages': What is my salary?",
    });
    assert.ok(!JSON.stringify(fields).includes("salary"));
  });

  it("copes with a plain Error, a string and null", () => {
    assert.deepEqual(upstreamFields(new Error("boom")), {
      upstreamStatus: undefined,
      upstreamCode: undefined,
      upstreamParam: undefined,
    });
    assert.deepEqual(upstreamFields("nope"), {});
    assert.deepEqual(upstreamFields(null), {});
    assert.deepEqual(upstreamFields(undefined), {});
  });

  it("ignores fields of the wrong type", () => {
    const fields = upstreamFields({ status: "400", code: 500, param: {} });
    assert.deepEqual(fields, {
      upstreamStatus: undefined,
      upstreamCode: undefined,
      upstreamParam: undefined,
    });
  });

  it("drops undefined fields when logged", () => {
    const lines: string[] = [];
    const spy = mock.method(console, "log", (line: string) => lines.push(line));
    try {
      logRequest("1.1.1.1", {
        outcome: "upstream_error",
        status: 502,
        latencyMs: 5,
        ...upstreamFields(new Error("boom")),
      });
    } finally {
      spy.mock.restore();
    }
    const entry = JSON.parse(lines[0]);
    assert.ok(!("upstreamStatus" in entry));
  });
});
