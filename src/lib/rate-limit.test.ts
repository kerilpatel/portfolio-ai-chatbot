import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  MAX_REQUESTS,
  __resetRateLimit,
  checkRateLimit,
  clientKey,
  rateLimitHeaders,
} from "./rate-limit.ts";

const headers = (value?: string) =>
  new Headers(value ? { "x-forwarded-for": value } : {});

describe("clientKey", () => {
  // Azure includes a port in x-forwarded-for. Left on, every request lands in
  // its own bucket and the limit silently never fires.
  it("strips the port from an IPv4 address", () => {
    assert.equal(clientKey(headers("1.2.3.4:56789")), "1.2.3.4");
  });

  it("strips the port from a bracketed IPv6 address", () => {
    assert.equal(clientKey(headers("[2001:db8::1]:4040")), "2001:db8::1");
  });

  it("takes the client from a proxy chain", () => {
    assert.equal(clientKey(headers("1.2.3.4:1, 5.6.7.8:2")), "1.2.3.4");
  });

  it("falls back when the header is absent", () => {
    assert.equal(clientKey(headers()), "unknown");
  });
});

describe("checkRateLimit", () => {
  beforeEach(() => __resetRateLimit());

  it("allows up to the limit then blocks", () => {
    for (let i = 0; i < 20; i++) {
      assert.equal(checkRateLimit("1.1.1.1").allowed, true);
    }
    const blocked = checkRateLimit("1.1.1.1");
    assert.equal(blocked.allowed, false);
    assert.ok(!blocked.allowed && blocked.retryAfterSeconds > 0);
  });

  it("counts each key separately", () => {
    for (let i = 0; i < 20; i++) checkRateLimit("1.1.1.1");
    assert.equal(checkRateLimit("2.2.2.2").allowed, true);
  });

  it("counts down the remaining allowance", () => {
    const first = checkRateLimit("3.3.3.3");
    assert.ok(first.allowed && first.remaining === 19);
  });
});

describe("rateLimitHeaders", () => {
  beforeEach(() => __resetRateLimit());

  it("reports the allowance counting down", () => {
    const first = rateLimitHeaders(checkRateLimit("8.8.8.1"));
    assert.equal(first["X-RateLimit-Limit"], String(MAX_REQUESTS));
    assert.equal(first["X-RateLimit-Remaining"], String(MAX_REQUESTS - 1));

    const second = rateLimitHeaders(checkRateLimit("8.8.8.1"));
    assert.equal(second["X-RateLimit-Remaining"], String(MAX_REQUESTS - 2));
  });

  it("reports zero remaining once blocked", () => {
    for (let i = 0; i < MAX_REQUESTS; i++) checkRateLimit("8.8.8.2");
    const headers = rateLimitHeaders(checkRateLimit("8.8.8.2"));
    assert.equal(headers["X-RateLimit-Remaining"], "0");
  });

  it("always reports a positive reset", () => {
    const headers = rateLimitHeaders(checkRateLimit("8.8.8.3"));
    assert.ok(Number(headers["X-RateLimit-Reset"]) > 0);
  });

  // A blocked caller's reset and Retry-After describe the same moment, so they
  // must not disagree.
  it("agrees with Retry-After when blocked", () => {
    for (let i = 0; i < MAX_REQUESTS; i++) checkRateLimit("8.8.8.4");
    const result = checkRateLimit("8.8.8.4");
    assert.equal(result.allowed, false);
    assert.ok(!result.allowed);
    assert.equal(
      rateLimitHeaders(result)["X-RateLimit-Reset"],
      String(result.retryAfterSeconds),
    );
  });
});
