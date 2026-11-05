import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_CHUNK_CHARS, chunkCorpus, chunkDocument } from "./chunk.ts";
import { CORPUS, type CorpusDocument } from "./corpus.ts";

const doc = (text: string, title = "Title", id = "d"): CorpusDocument => ({
  id,
  title,
  text,
});

const sentence = (n: number) => `${"word ".repeat(n).trim()}.`;

describe("chunkDocument", () => {
  it("yields nothing for empty text", () => {
    assert.deepEqual(chunkDocument(doc("")), []);
    assert.deepEqual(chunkDocument(doc("   ")), []);
  });

  it("keeps a short document as one chunk", () => {
    const chunks = chunkDocument(doc("One. Two."));
    assert.equal(chunks.length, 1);
  });

  // A retrieved fragment must say whose work it describes, or the model can
  // attribute the right fact to the wrong employer.
  it("prefixes every chunk with the document title", () => {
    const chunks = chunkDocument(
      doc(`${sentence(60)} ${sentence(60)}`, "Who It Was"),
    );
    assert.ok(
      chunks.length > 1,
      "expected a split for this test to mean anything",
    );
    for (const chunk of chunks) {
      assert.ok(chunk.text.startsWith("Who It Was. "), chunk.text.slice(0, 40));
    }
  });

  it("splits once the budget is exceeded", () => {
    const one = chunkDocument(doc(sentence(20)));
    const many = chunkDocument(
      doc(Array.from({ length: 8 }, () => sentence(20)).join(" ")),
    );
    assert.equal(one.length, 1);
    assert.ok(many.length > 1, `expected several chunks, got ${many.length}`);
  });

  it("stays within budget when sentences allow it", () => {
    const chunks = chunkDocument(
      doc(Array.from({ length: 12 }, () => sentence(15)).join(" ")),
    );
    for (const chunk of chunks) {
      assert.ok(
        chunk.text.length <= MAX_CHUNK_CHARS,
        `${chunk.id} is ${chunk.text.length} chars`,
      );
    }
  });

  // Cutting mid-clause produces a fragment whose embedding reflects an
  // incomplete thought, which retrieves badly.
  it("never cuts mid-sentence", () => {
    const chunks = chunkDocument(
      doc(Array.from({ length: 10 }, () => sentence(18)).join(" ")),
    );
    for (const chunk of chunks) {
      assert.match(
        chunk.text.trimEnd(),
        /[.!?]$/,
        `${chunk.id} ends mid-sentence`,
      );
    }
  });

  // Splitting it would create exactly the fragment above, so it goes whole.
  it("emits an oversized single sentence intact rather than cutting it", () => {
    const huge = sentence(400);
    const chunks = chunkDocument(doc(huge));
    assert.equal(chunks.length, 1);
    assert.ok(chunks[0].text.length > MAX_CHUNK_CHARS);
    assert.ok(chunks[0].text.endsWith(huge), "the sentence must survive whole");
  });

  it("gives each chunk a traceable id", () => {
    const chunks = chunkDocument(
      doc(
        Array.from({ length: 8 }, () => sentence(20)).join(" "),
        "T",
        "my-doc",
      ),
    );
    assert.deepEqual(
      chunks.map((c) => c.id),
      chunks.map((_, i) => `my-doc#${i}`),
    );
    for (const chunk of chunks) assert.equal(chunk.documentId, "my-doc");
  });

  it("loses no sentence across the split", () => {
    const parts = Array.from(
      { length: 9 },
      (_, i) => `Sentence number ${i} here.`,
    );
    const chunks = chunkDocument(doc(parts.join(" ")));
    const rejoined = chunks
      .map((c) => c.text.replace(/^Title\. /, ""))
      .join(" ");
    for (const part of parts) {
      assert.ok(rejoined.includes(part), `lost: ${part}`);
    }
  });
});

describe("chunkCorpus", () => {
  it("chunks the real corpus with unique ids", () => {
    const chunks = chunkCorpus(CORPUS);
    assert.ok(chunks.length >= CORPUS.length);
    assert.equal(new Set(chunks.map((c) => c.id)).size, chunks.length);
  });

  it("keeps every real chunk within budget", () => {
    for (const chunk of chunkCorpus(CORPUS)) {
      assert.ok(
        chunk.text.length <= MAX_CHUNK_CHARS,
        `${chunk.id} is ${chunk.text.length} chars - split it or shorten the source`,
      );
    }
  });

  it("covers every document", () => {
    const seen = new Set(chunkCorpus(CORPUS).map((c) => c.documentId));
    for (const document of CORPUS) {
      assert.ok(seen.has(document.id), `no chunk for ${document.id}`);
    }
  });
});
