import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SSE_DONE, type StreamChunk, newStats, streamSSE } from "./stream.ts";

const FALLBACK = "drop me an email";

const text = (...parts: string[]): StreamChunk[] =>
  parts.map((content) => ({ choices: [{ delta: { content } }] }));

async function* from(chunks: StreamChunk[]): AsyncIterable<StreamChunk> {
  for (const chunk of chunks) yield chunk;
}

async function collect(chunks: AsyncIterable<StreamChunk>, stats = newStats()) {
  const frames: string[] = [];
  for await (const frame of streamSSE(chunks, stats, FALLBACK)) {
    frames.push(frame);
  }
  return { frames, stats };
}

const payloads = (frames: string[]) =>
  frames
    .map((f) => f.replace(/^data: /, "").trim())
    .filter((p) => p !== SSE_DONE)
    .map((p) => JSON.parse(p));

describe("streamSSE", () => {
  it("emits one frame per delta and terminates with DONE", async () => {
    const { frames } = await collect(from(text("Hel", "lo")));
    assert.deepEqual(payloads(frames), [{ delta: "Hel" }, { delta: "lo" }]);
    assert.equal(frames.at(-1), `data: ${SSE_DONE}\n\n`);
  });

  it("frames are valid SSE: data-prefixed and blank-line terminated", async () => {
    const { frames } = await collect(from(text("x")));
    for (const frame of frames) {
      assert.ok(frame.startsWith("data: "));
      assert.ok(frame.endsWith("\n\n"));
    }
  });

  it("accumulates the full reply text", async () => {
    const { stats } = await collect(from(text("I ", "build ", "things.")));
    assert.equal(stats.text, "I build things.");
    assert.equal(stats.failed, false);
  });

  it("skips role-only and keep-alive chunks that carry no text", async () => {
    const chunks: StreamChunk[] = [
      { choices: [{ delta: {} }] },
      { choices: [{ delta: { content: null } }] },
      { choices: [{ delta: { content: "" } }] },
      ...text("real"),
    ];
    const { frames, stats } = await collect(from(chunks));
    assert.deepEqual(payloads(frames), [{ delta: "real" }]);
    assert.equal(stats.text, "real");
  });

  it("captures usage from the final chunk", async () => {
    const chunks: StreamChunk[] = [
      ...text("hi"),
      {
        usage: {
          prompt_tokens: 500,
          completion_tokens: 12,
          prompt_tokens_details: { cached_tokens: 448 },
        },
      },
    ];
    const { stats } = await collect(from(chunks));
    assert.equal(stats.promptTokens, 500);
    assert.equal(stats.completionTokens, 12);
    assert.equal(stats.cachedTokens, 448);
  });

  // The status is already 200 on the wire, so a mid-stream failure has to be
  // reported in-band rather than as a 502.
  it("reports a mid-stream failure as an error frame, then closes cleanly", async () => {
    async function* breaks(): AsyncIterable<StreamChunk> {
      yield* text("partial ");
      throw new Error("connection reset");
    }
    const { frames, stats } = await collect(breaks());
    assert.deepEqual(payloads(frames), [
      { delta: "partial " },
      { error: FALLBACK },
    ]);
    assert.equal(frames.at(-1), `data: ${SSE_DONE}\n\n`);
    assert.equal(stats.failed, true);
  });

  it("treats a stream that produced no text as a failure", async () => {
    const { frames, stats } = await collect(from([]));
    assert.deepEqual(payloads(frames), [{ error: FALLBACK }]);
    assert.equal(stats.failed, true);
  });

  it("never emits a partial reply and an error without marking failure", async () => {
    async function* breaks(): AsyncIterable<StreamChunk> {
      yield* text("a");
      throw new Error("boom");
    }
    const { stats } = await collect(breaks());
    assert.ok(stats.failed, "partial replies must be flagged for the log");
  });
});
