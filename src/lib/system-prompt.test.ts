import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ABOUT_ME } from "./about-me.ts";
import {
  SYSTEM_PROMPT,
  SYSTEM_PROMPT_VERSION,
  fingerprint,
} from "./system-prompt.ts";

describe("SYSTEM_PROMPT", () => {
  it("carries the always-in-context summary", () => {
    assert.ok(SYSTEM_PROMPT.includes(ABOUT_ME));
  });

  it("instructs the model not to invent credentials", () => {
    assert.match(SYSTEM_PROMPT, /do not infer, embellish, or invent/i);
  });
});

describe("fingerprint", () => {
  it("is stable for the same text", () => {
    assert.equal(fingerprint("abc"), fingerprint("abc"));
  });

  // The reason the version is derived rather than hand-maintained: a manual
  // number gets forgotten on the edit that mattered.
  it("moves when the text changes at all", () => {
    assert.notEqual(fingerprint("abc"), fingerprint("abc "));
  });

  it("is short enough to read in a log line", () => {
    assert.equal(fingerprint("abc").length, 12);
  });
});

describe("SYSTEM_PROMPT_VERSION", () => {
  it("matches the fingerprint of the live prompt", () => {
    assert.equal(SYSTEM_PROMPT_VERSION, fingerprint(SYSTEM_PROMPT));
  });

  // about-me.ts is interpolated into the prompt, so editing the content must
  // move the version too - otherwise eval runs get misattributed.
  it("covers the about-me content, not just the instructions", () => {
    const edited = SYSTEM_PROMPT.replace(ABOUT_ME, ABOUT_ME + "\nExtra fact.");
    assert.notEqual(fingerprint(edited), SYSTEM_PROMPT_VERSION);
  });
});
