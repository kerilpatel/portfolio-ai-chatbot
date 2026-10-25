/**
 * Reports whether the cacheable prefix is large enough for Azure OpenAI
 * prompt caching to engage (plan section 4).
 *
 * Two documented requirements: the request must be at least 1024 tokens, and
 * the first 1024 tokens must be byte-identical between calls. Below the
 * threshold the request is billed in full every time and `cachedTokens` in the
 * request log stays empty - which looks exactly like caching being broken
 * rather than never having been eligible.
 *
 * The identical-prefix rule is why the prompt sits ahead of the user message
 * and why `SYSTEM_PROMPT_VERSION` is worth watching: any edit to the prompt or
 * to about-me.ts changes the prefix, so the first call after a deploy is
 * always a miss and the version hash tells you which revision that was.
 *
 * Run after editing the system prompt or about-me content:  npm run prompt:size
 */
import { SYSTEM_PROMPT } from "../src/lib/system-prompt.ts";

const MIN_CACHEABLE_TOKENS = 1024;

const chars = SYSTEM_PROMPT.length;
// English prose runs roughly 3-4 characters per token. The range is quoted
// rather than a single figure so the verdict does not rest on the estimate
// being exact.
const low = Math.round(chars / 4);
const high = Math.round(chars / 3);

console.log(`system prompt:     ${chars} characters`);
console.log(`estimated tokens:  ${low}-${high}`);
console.log(`caching threshold: ${MIN_CACHEABLE_TOKENS} tokens`);
console.log(
  `note:              the first ${MIN_CACHEABLE_TOKENS} tokens must also be ` +
    `identical between calls`,
);

if (high < MIN_CACHEABLE_TOKENS) {
  const shortfall = MIN_CACHEABLE_TOKENS - high;
  console.log(
    `\nNOT ELIGIBLE. Short by at least ${shortfall} tokens ` +
      `(~${shortfall * 3} characters), so prompt caching cannot engage and ` +
      `cachedTokens will stay empty. Filling in about-me.ts and adding ` +
      `retrieved context will close the gap.`,
  );
} else if (low < MIN_CACHEABLE_TOKENS) {
  console.log(
    `\nBORDERLINE. The estimate straddles the threshold, so caching may or ` +
      `may not engage. Confirm against cachedTokens in a real request log.`,
  );
} else {
  console.log(
    `\nELIGIBLE. Check cachedTokens in the request log to confirm caching ` +
      `is actually being applied.`,
  );
}
