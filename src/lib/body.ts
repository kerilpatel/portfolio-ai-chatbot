/**
 * Reads a request body with a hard byte ceiling.
 *
 * The Content-Length header cannot carry this on its own: a chunked request
 * has no such header, so a cap that trusts it is skipped by simply omitting
 * it. Verified before this existed - a 1MB body sent with
 * `Transfer-Encoding: chunked` was buffered and parsed in full, then rejected
 * only by the message length check, which is far too late to be a limit.
 *
 * So Content-Length stays as a cheap early reject, and this is the actual
 * guarantee: the stream is read in pieces and abandoned the moment it passes
 * the budget, before the oversized remainder is pulled off the socket.
 */
export type BoundedBody =
  { ok: true; text: string } | { ok: false; reason: "too-large" };

export async function readBoundedText(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<BoundedBody> {
  if (!body) return { ok: true, text: "" };

  const reader = body.getReader();
  const pieces: Uint8Array[] = [];
  let size = 0;

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;

      size += value.byteLength;
      if (size > maxBytes) {
        // Stop pulling: the point is to not read the rest of it.
        await reader.cancel().catch(() => {});
        return { ok: false, reason: "too-large" };
      }
      pieces.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(size);
  let offset = 0;
  for (const piece of pieces) {
    joined.set(piece, offset);
    offset += piece.byteLength;
  }

  return { ok: true, text: new TextDecoder().decode(joined) };
}
