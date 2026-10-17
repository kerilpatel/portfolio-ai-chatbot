import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  MAX_REQUESTS,
  __resetRateLimit,
  checkRateLimit,
  identifyClient,
  rateLimitHeaders,
} from "./rate-limit.ts";

const headers = (value?: string) =>
  new Headers(value ? { "x-forwarded-for": value } : {});

describe("identifyClient", () => {
  // Azure includes a port in x-forwarded-for. Left on, every request lands in
  // its own bucket and the limit silently never fires.
  it("strips the port from an IPv4 address", () => {
    assert.equal(identifyClient(headers("1.2.3.4:56789")).key, "1.2.3.4");
  });

  it("strips the port from a bracketed IPv6 address", () => {
    assert.equal(
      identifyClient(headers("[2001:db8::1]:4040")).key,
      "2001:db8::1",
    );
  });

  it("takes the client from a proxy chain", () => {
    assert.equal(
      identifyClient(headers("1.2.3.4:1, 5.6.7.8:2")).key,
      "1.2.3.4",
    );
  });

  it("falls back when the header is absent", () => {
    assert.equal(identifyClient(headers()).key, "unknown");
  });

  it("reports which header the identity came from", () => {
    assert.equal(identifyClient(headers("1.2.3.4")).source, "forwarded");
    assert.equal(
      identifyClient(new Headers({ "x-real-ip": "1.2.3.4" })).source,
      "real-ip",
    );
  });

  // Without an identity every anonymous request shares one bucket, so one
  // heavy caller exhausts the allowance for everybody. Behind Azure the header
  // is always set, so "none" means the deployment topology is wrong.
  it("reports source none when neither header is present", () => {
    assert.equal(identifyClient(headers()).source, "none");
  });

  it("prefers x-forwarded-for when both are present", () => {
    const both = new Headers({
      "x-forwarded-for": "1.1.1.1",
      "x-real-ip": "2.2.2.2",
    });
    assert.deepEqual(identifyClient(both), {
      key: "1.1.1.1",
      source: "forwarded",
    });
  });

  it("ignores an empty header value and keeps looking", () => {
    const blank = new Headers({
      "x-forwarded-for": "",
      "x-real-ip": "9.9.9.9",
    });
    assert.deepEqual(identifyClient(blank), {
      key: "9.9.9.9",
      source: "real-ip",
    });
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
