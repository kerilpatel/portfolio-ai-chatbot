import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type Chunk, chunkCorpus } from "./chunk.ts";
import { CORPUS } from "./corpus.ts";
import {
  MAX_CHUNKS,
  MAX_CONTEXT_CHARS,
  contextBlock,
  retrieve,
  scoreChunks,
} from "./retrieve.ts";

const CHUNKS = chunkCorpus(CORPUS);
const docs = (query: string) =>
  retrieve(query, CHUNKS).map((c) => c.documentId);

describe("retrieve", () => {
  it("finds the references for a question about them", () => {
    // The plural is the point: every reference document is titled in the
    // singular, so "references" matched nothing before folding was added.
    assert.ok(
      docs("What do your references say?").some((d) =>
        d.startsWith("reference-"),
      ),
    );
    assert.ok(
      docs("Who gave you a reference?").some((d) => d.startsWith("reference-")),
    );
  });

  it("finds the right document for specific questions", () => {
    assert.ok(
      docs("Have you won any awards?").some((d) =>
        d.startsWith("achievement-"),
      ),
    );
    assert.ok(
      docs("Have you published a paper?").includes(
        "achievement-best-presentation",
      ),
    );
    assert.ok(
      docs("What certifications do you hold?").includes(
        "certifications-detail",
      ),
    );
    assert.ok(docs("What was your CGPA?").includes("education-detail"));
  });

  // The behaviour that matters most. Context in the prompt is an invitation
  // to use it, and the grounding rule only holds if the model is not handed
  // something tangentially related to lean on.
  it("retrieves nothing for an unrelated question", () => {
    for (const query of [
      "What is the weather in Paris?",
      "Who should I vote for?",
      "Give me a recipe for banana bread",
      "Do you know Rust?",
      "What is your salary?",
    ]) {
      assert.deepEqual(docs(query), [], `should retrieve nothing: ${query}`);
    }
  });

  it("retrieves nothing for an empty or stopword-only query", () => {
    for (const query of ["", "   ", "what is the", "and or the a an"]) {
      assert.deepEqual(docs(query), [], `should retrieve nothing: ${query}`);
    }
  });

  it("never exceeds the chunk cap", () => {
    for (const query of [
      "reference",
      "Zebra Flutter SDK printers Keril",
      "education",
    ]) {
      assert.ok(retrieve(query, CHUNKS).length <= MAX_CHUNKS, query);
    }
  });

  it("never exceeds the character budget", () => {
    const total = retrieve("reference engineer Keril Zebra", CHUNKS).reduce(
      (n, c) => n + c.text.length,
      0,
    );
    assert.ok(total <= MAX_CONTEXT_CHARS, `${total} chars`);
  });

  it("orders by score, best first", () => {
    const scores = scoreChunks("published paper award", CHUNKS).map(
      (s) => s.score,
    );
    for (let i = 1; i < scores.length; i++) {
      assert.ok(scores[i - 1] >= scores[i], "scores must descend");
    }
  });

  // Without it, a term present in nearly every chunk would outrank the term
  // that actually distinguishes one chunk from another.
  it("weights a rare term above a common one", () => {
    const common = scoreChunks("Keril", CHUNKS)[0].score;
    const rare = scoreChunks("CGPA", CHUNKS)[0].score;
    assert.ok(rare > common, `rare ${rare} should beat common ${common}`);
  });
});

describe("contextBlock", () => {
  it("is empty when nothing was retrieved", () => {
    assert.equal(contextBlock([]), "");
  });

  it("includes each retrieved chunk", () => {
    const chunks = retrieve("Have you won any awards?", CHUNKS);
    assert.ok(chunks.length > 0, "fixture should retrieve something");
    const block = contextBlock(chunks);
    for (const chunk of chunks) assert.ok(block.includes(chunk.text));
  });

  it("tells the model the detail is optional and on-subject", () => {
    const block = contextBlock(retrieve("awards", CHUNKS));
    assert.match(block, /only if it answers the question/i);
    assert.match(block, /not a new topic/i);
  });

  it("adds no heading when there is nothing to head", () => {
    const empty: Chunk[] = [];
    assert.ok(!contextBlock(empty).includes("Retrieved detail"));
  });
});
