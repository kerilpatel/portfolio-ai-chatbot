import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { corsHeaders, isAllowedOrigin } from "./cors.ts";

const original = process.env.ALLOWED_ORIGIN;
afterEach(() => {
  process.env.ALLOWED_ORIGIN = original;
});

describe("cors", () => {
  it("allows an origin on the list", () => {
    process.env.ALLOWED_ORIGIN = "https://a.com,https://b.com";
    assert.equal(isAllowedOrigin("https://b.com"), true);
    assert.equal(
      corsHeaders("https://b.com")["Access-Control-Allow-Origin"],
      "https://b.com",
    );
  });

  it("refuses an origin off the list", () => {
    process.env.ALLOWED_ORIGIN = "https://a.com";
    const headers = corsHeaders("https://evil.example");
    assert.equal(headers["Access-Control-Allow-Origin"], undefined);
  });

  // Without this, a shared cache can hand one site's allow-header to another.
  it("always varies on Origin, even when refusing", () => {
    process.env.ALLOWED_ORIGIN = "https://a.com";
    assert.equal(corsHeaders("https://evil.example")["Vary"], "Origin");
  });

  it("fails closed when no allowlist is configured", () => {
    delete process.env.ALLOWED_ORIGIN;
    assert.equal(isAllowedOrigin("https://a.com"), false);
  });

  // Retry-After is not CORS-safelisted, so the UI cannot read it without this.
  it("exposes Retry-After to the browser", () => {
    process.env.ALLOWED_ORIGIN = "https://a.com";
    assert.equal(
      corsHeaders("https://a.com")["Access-Control-Expose-Headers"],
      "Retry-After",
    );
  });
});
