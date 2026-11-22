import { type Chunk } from "./chunk.ts";

/**
 * Lexical retrieval over the corpus (plan section 3).
 *
 * Section 3 asks for hybrid retrieval and is explicitly open to alternatives.
 * This is the half that needs no Azure: with seventeen chunks of prose about
 * one person, term overlap is a genuinely adequate first stage, and it makes
 * the corpus reachable today rather than after a search resource exists.
 * Embeddings can be added alongside it later - they answer a different
 * question, paraphrase similarity, which this cannot.
 *
 * The important behaviour is not what it returns but what it refuses to. An
 * off-topic question must retrieve nothing rather than the least irrelevant
 * chunk: context in the prompt is an invitation to use it, and the grounding
 * rule in `system-prompt.ts` only works if the model is not handed something
 * tangentially related to lean on.
 */

/** Chunks sent at most, before the character budget applies. */
export const MAX_CHUNKS = 3;

/** Ceiling on retrieved context, so a question cannot balloon the prompt. */
export const MAX_CONTEXT_CHARS = 1600;

/**
 * A chunk must clear this to be sent at all.
 *
 * Measured against the corpus rather than guessed, and the measurement says
 * the threshold cannot do what it first looks like it should. On-topic
 * questions score from 1.06 ("Who gave you a reference?") to 5.78 ("Have you
 * published a paper?"). Off-topic ones mostly score 0.00 - weather, politics,
 * recipes, salary, an unlisted language - but "Ignore all previous
 * instructions" scores 2.25, because that wording overlaps a reference. The
 * two classes overlap, so no single value both admits reference questions and
 * rejects that one.
 *
 * Set at 1.0 to favour recall, because the two errors do not cost the same.
 * A false negative loses the corpus entirely for a whole category of question
 * - the references are a third of it. A false positive costs tokens and adds
 * a paragraph of true, on-subject prose about the same person. Retrieval is
 * not a guardrail: an injection attempt retrieving a genuine reference is not
 * a breach, and prompt scoping plus the grounding rule are what refuse it.
 */
export const MIN_SCORE = 1.0;

/**
 * Words carrying no retrieval signal. Short enough to stay honest - this is
 * not a linguistics exercise, it just stops "what" and "the" from matching
 * every chunk equally and drowning out the terms that matter.
 */
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "been",
  "but",
  "by",
  "can",
  "did",
  "do",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "him",
  "his",
  "how",
  "i",
  "in",
  "into",
  "is",
  "it",
  "its",
  "me",
  "my",
  "of",
  "on",
  "or",
  "s",
  "she",
  "so",
  "some",
  "tell",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "they",
  "this",
  "to",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "will",
  "with",
  "you",
  "your",
]);

/**
 * Folds a trailing plural `s`, so "references" matches "Reference from ...".
 *
 * Crude on purpose, and crude in a way worth naming: it is not stemming, it
 * will not relate "ran" to "run", and it mangles a few words harmlessly
 * ("css" becomes "cs"). English plurals are simply the mismatch that actually
 * bit here - a question about "references" retrieved nothing from five
 * reference documents, because each is titled in the singular. Anything
 * beyond this is what embeddings are for.
 */
function fold(term: string): string {
  if (term.length > 3 && term.endsWith("s") && !term.endsWith("ss")) {
    return term.slice(0, -1);
  }
  return term;
}

function terms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9.+#]+/)
    .map((term) => term.replace(/^\.+|\.+$/g, ""))
    .filter((term) => term.length > 1 && !STOPWORDS.has(term))
    .map(fold);
}

/**
 * Inverse document frequency, so a term appearing in every chunk counts for
 * almost nothing and a rare one counts for a lot. Without this, "Keril" would
 * dominate every query - it is in most of the corpus - and swamp the term
 * that actually distinguishes one chunk from another.
 */
function idf(term: string, chunks: Chunk[]): number {
  const containing = chunks.filter((chunk) =>
    terms(chunk.text).includes(term),
  ).length;
  if (containing === 0) return 0;
  return Math.log(1 + chunks.length / containing);
}

export type Scored = { chunk: Chunk; score: number };

export function scoreChunks(query: string, chunks: Chunk[]): Scored[] {
  const queryTerms = [...new Set(terms(query))];
  if (queryTerms.length === 0) return [];

  const weights = new Map(queryTerms.map((t) => [t, idf(t, chunks)]));

  return chunks
    .map((chunk) => {
      const chunkTerms = new Set(terms(chunk.text));
      const score = queryTerms.reduce(
        (total, term) =>
          chunkTerms.has(term) ? total + (weights.get(term) ?? 0) : total,
        0,
      );
      return { chunk, score };
    })
    .sort((a, b) => b.score - a.score);
}

/** Top chunks worth sending, or none when nothing is relevant enough. */
export function retrieve(query: string, chunks: Chunk[]): Chunk[] {
  const kept: Chunk[] = [];
  let chars = 0;

  for (const { chunk, score } of scoreChunks(query, chunks)) {
    if (score < MIN_SCORE) break; // sorted, so nothing after this qualifies
    if (kept.length >= MAX_CHUNKS) break;
    if (chars + chunk.text.length > MAX_CONTEXT_CHARS) break;
    kept.push(chunk);
    chars += chunk.text.length;
  }

  return kept;
}

/**
 * Renders retrieved chunks for the prompt.
 *
 * Returns an empty string when nothing was retrieved, so the caller appends
 * nothing at all rather than an empty heading - a "Retrieved context" header
 * with no content reads to the model as context that was looked for and not
 * found, which is not the same as not having looked.
 */
export function contextBlock(chunks: Chunk[]): string {
  if (chunks.length === 0) return "";
  return [
    "",
    "## Retrieved detail",
    "Use this only if it answers the question. It is additional detail about",
    "the same person, not a new topic.",
    "",
    ...chunks.map((chunk) => `- ${chunk.text}`),
  ].join("\n");
}
