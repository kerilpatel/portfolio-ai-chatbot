import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readBoundedText } from "./body.ts";

/** A stream delivering the given pieces, so chunk boundaries are controlled. */
function streamOf(...pieces: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const piece of pieces) controller.enqueue(piece);
      controller.close();
    },
  });
}

const bytes = (text: string) => new TextEncoder().encode(text);

describe("readBoundedText", () => {
  it("treats an absent body as empty", async () => {
    assert.deepEqual(await readBoundedText(null, 100), { ok: true, text: "" });
  });

  it("returns a body under the budget", async () => {
    const result = await readBoundedText(streamOf(bytes("hello")), 100);
    assert.deepEqual(result, { ok: true, text: "hello" });
  });

  it("accepts a body exactly at the budget", async () => {
    const result = await readBoundedText(streamOf(bytes("12345")), 5);
    assert.ok(result.ok);
  });

  it("rejects a body one byte over", async () => {
    const result = await readBoundedText(streamOf(bytes("123456")), 5);
    assert.deepEqual(result, { ok: false, reason: "too-large" });
  });

  // The budget is cumulative. Counting per chunk would let any size through
  // in small enough pieces - which is exactly how the Content-Length cap was
  // bypassed, by splitting the body into a chunked transfer.
  it("counts across chunks rather than per chunk", async () => {
    const result = await readBoundedText(
      streamOf(bytes("aaa"), bytes("bbb"), bytes("ccc")),
      5,
    );
    assert.deepEqual(result, { ok: false, reason: "too-large" });
  });

  it("stops reading once over budget", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(bytes("aaaaaaaaaa"));
        if (pulled > 50) controller.close();
      },
    });
    const result = await readBoundedText(stream, 25);
    assert.equal(result.ok, false);
    assert.ok(pulled < 10, `kept pulling: ${pulled} reads`);
  });

  // Pieces are joined before decoding, so a character split across a chunk
  // boundary must not become a replacement character.
  it("decodes a multi-byte character split across chunks", async () => {
    const encoded = bytes("né"); // é is two bytes
    const result = await readBoundedText(
      streamOf(encoded.slice(0, 2), encoded.slice(2)),
      100,
    );
    assert.ok(result.ok);
    assert.equal(result.text, "né");
  });

  it("measures bytes, not characters", async () => {
    // Four characters, but seven bytes once encoded.
    const text = "aé€";
    assert.ok(bytes(text).byteLength > text.length);
    const over = await readBoundedText(streamOf(bytes(text)), text.length);
    assert.equal(over.ok, false, "a byte budget must not be fooled by length");
  });
});
