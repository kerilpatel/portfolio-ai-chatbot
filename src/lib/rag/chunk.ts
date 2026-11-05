import { type CorpusDocument } from "./corpus.ts";

/**
 * Splits corpus documents into retrievable chunks (plan section 3).
 *
 * Two decisions drive the shape of this:
 *
 * Every chunk carries its document title. A fragment reading "Built a Flutter
 * SDK supporting printers across platforms" is nearly useless once retrieved -
 * the model cannot tell whose work it was or when. Prefixing the title makes
 * each chunk self-describing, which costs a few tokens and avoids answers that
 * attribute the right fact to the wrong employer.
 *
 * Splits happen on sentence boundaries, never mid-sentence. A chunk cut in the
 * middle of a clause retrieves badly - the embedding reflects a fragment whose
 * meaning is incomplete - and reads worse if it reaches the model.
 */

/**
 * Chunk size in characters rather than tokens. An exact token count needs the
 * model's tokenizer, which is a dependency this does not otherwise need, and
 * the threshold here is a retrieval-quality knob rather than a hard API limit:
 * being 15% out changes how much context a hit carries, not whether the call
 * succeeds. Roughly 100-170 tokens at 3-4 characters per token.
 */
export const MAX_CHUNK_CHARS = 500;

export type Chunk = {
  /** `<document id>#<n>`, so a retrieval trace names the source. */
  id: string;
  documentId: string;
  /** Title prefix included, which is what gets embedded and sent. */
  text: string;
};

/**
 * Sentence boundaries: a period, question or exclamation mark followed by
 * whitespace. Deliberately simple - the corpus is prose written for a website,
 * not legal text full of abbreviations.
 */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function chunkDocument(document: CorpusDocument): Chunk[] {
  const prefix = `${document.title}. `;
  const budget = MAX_CHUNK_CHARS - prefix.length;
  const chunks: Chunk[] = [];
  let current: string[] = [];
  let length = 0;

  const flush = () => {
    if (current.length === 0) return;
    chunks.push({
      id: `${document.id}#${chunks.length}`,
      documentId: document.id,
      text: prefix + current.join(" "),
    });
    current = [];
    length = 0;
  };

  for (const sentence of sentences(document.text)) {
    // A single sentence over budget still goes out whole: splitting it would
    // produce exactly the incomplete fragment this is trying to avoid, and an
    // oversized chunk retrieves worse than a short one but still works.
    if (length > 0 && length + sentence.length + 1 > budget) flush();
    current.push(sentence);
    length += sentence.length + 1;
  }
  flush();

  return chunks;
}

export function chunkCorpus(documents: CorpusDocument[]): Chunk[] {
  return documents.flatMap(chunkDocument);
}
