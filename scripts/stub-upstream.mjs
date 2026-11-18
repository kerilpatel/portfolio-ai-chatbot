/**
 * A stand-in for Azure OpenAI, so the smoke suite can exercise the streaming
 * paths without credentials.
 *
 * Streaming is the main UX path and the route's own handling of it - the `ok`
 * and `client_closed` endings - was only ever checked by hand, because the
 * rest of the suite runs unconfigured and so never opens a stream.
 *
 * Chunks are deliberately slow: a client has to be able to disconnect partway
 * through for the cancellation path to mean anything.
 *
 * Usage: node scripts/stub-upstream.mjs [port] [delayMs]
 */
import http from "node:http";

const port = Number(process.argv[2] ?? 9990);
const delayMs = Number(process.argv[3] ?? 400);
const WORDS = ["Hello ", "from ", "the ", "stub ", "upstream."];

const streamChunk = (content) =>
  `data: ${JSON.stringify({
    id: "stub",
    object: "chat.completion.chunk",
    created: 0,
    model: "stub",
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  })}\n\n`;

const wholeReply = {
  id: "stub",
  object: "chat.completion",
  created: 0,
  model: "stub",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: WORDS.join("") },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 42, completion_tokens: 7, total_tokens: 49 },
};

http
  .createServer(async (req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    await new Promise((resolve) => req.on("end", resolve));

    let wantsStream = false;
    try {
      wantsStream = JSON.parse(raw).stream === true;
    } catch {
      // Treat an unparseable body as non-streaming; the route validates it.
    }

    if (!wantsStream) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(wholeReply));
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    });
    for (const word of WORDS) {
      if (res.writableEnded || res.destroyed) return;
      res.write(streamChunk(word));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    res.write("data: [DONE]\n\n");
    res.end();
  })
  .listen(port, () => console.log(`stub upstream on ${port}`));
