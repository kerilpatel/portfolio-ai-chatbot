# portfolio-ai-chatbot

Backend service for the "Ask Me Anything" chatbot on [portfolio-website](../portfolio-website), plus its eval suite.

A thin Next.js API route acts as a server-side proxy to Azure AI Foundry / Azure OpenAI — it is the only place the Azure OpenAI key exists. The chat UI lives in `portfolio-website` and calls this service over HTTP.

See [docs/plan.md](docs/plan.md) for the full design.

## Structure

- `src/app/page.tsx` — static page explaining the service; there is no UI here
- `src/app/robots.ts` — keeps the service out of search results
- `src/app/api/chat/route.ts` — chat endpoint (single-turn, no RAG yet)
- `src/app/api/health/route.ts` — health probe for deployment
- `src/lib/system-prompt.ts` — scoping + grounding guardrail prompt, plus its
  content-derived version
- `src/lib/cors.ts` — origin allowlist
- `src/lib/rate-limit.ts` — per-IP sliding window
- `src/lib/history.ts` — conversation history validation + trimming
- `src/lib/observability.ts` — one structured log line per request
- `src/lib/stream.ts` — SSE framing for streamed replies
- `src/lib/about-me.ts` — always-in-context summary (placeholder content)
- `eval/` — Promptfoo config + golden Q&A dataset
- `docs/plan.md` — architecture and open questions

## Getting Started

```bash
npm install
cp .env.example .env.local   # fill in Azure credentials
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Tests

```bash
npm test
```

`npm run lint`, `npm run typecheck`, `npm test` and `npm run build` all run in
CI on every push and PR to `main` and `develop`. None of them need secrets.

Unit tests for `src/lib/` via the Node test runner - no extra dependencies.

Set `AZURE_OPENAI_REASONING_MODEL=true` if the chat deployment is a reasoning
model (o-series, GPT-5 reasoning family). Those reject `max_tokens` and
`temperature`; everything else requires them.

## Prompt size

```bash
npm run prompt:size
```

Azure prompt caching only applies to a prefix of at least 1024 tokens. Run
this after editing the system prompt or `about-me.ts` to see whether the
cacheable prefix is large enough yet.

## Evals

```bash
npm run dev                                   # the suite calls the live endpoint
npx promptfoo eval -c eval/promptfooconfig.yaml
```

49 rows grouped by `category`. `factual` (29) checks answers against the
content in `src/lib/about-me.ts`; `unknown` (7) checks the bot admits what it
does not know; `injection` (6), `off_topic` (5) and `identity` (2) check
guardrail behaviour. Running the suite needs Azure credentials, since it
exercises the real endpoint.

## API

`POST /api/chat` with `{ "message": "...", "history": [...] }` returns
`{ "reply": "..." }`. `history` is optional and holds prior turns as
`{ role: "user" | "assistant", content: string }`. This service is stateless,
so the client sends the conversation back each turn; only the last 6 messages
(and 4000 characters) are forwarded, since every one is re-billed. Any other
`role` is rejected with `400` - accepting `system` from the body would let a
caller overwrite the guardrail prompt.
Returns `400` on a missing/empty/over-long message or a `history` of more than
50 entries, `413` if the body exceeds 16KB, `415` unless the request is
`application/json`, and `502` with a friendly `reply` if the upstream call
fails.

Insisting on `application/json` is what makes the origin allowlist protective:
`text/plain` and the form content types are CORS-safelisted, so a cross-origin
request using one is sent with no preflight and the allowlist is never asked. `OPTIONS /api/chat` handles the preflight.

Rate limited to 20 requests per 15 minutes per IP. Over that it returns `429`
with a `Retry-After` header and a friendly `reply` in the normal response
shape, so the UI can render it as a chat message rather than an error. The
window is in-memory, so it resets on redeploy and is per-instance.

The limiter keys on the `x-forwarded-for` entry the nearest trusted proxy
added, counting in from the right, because the leftmost entry is only what the
caller claimed. Set `TRUSTED_PROXY_HOPS` to the number of proxies in front of
the service (default 1); setting it too high lets a caller spoof their
identity and evade the limit.

Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and
`X-RateLimit-Reset` (seconds), so the UI can warn before the wall instead of
only reacting after it. All are listed in `Access-Control-Expose-Headers`,
without which the browser receives them but cannot read them.

Pass `"stream": true` to get `text/event-stream` instead: one
`data: {"delta":"..."}` frame per token, terminated by `data: [DONE]`. Because
the `200` is already sent, a failure partway through arrives in-band as a
`data: {"error":"..."}` frame rather than a status code. Omitting the field
keeps the plain JSON response.

`GET /api/health` returns `{ status, promptVersion, configured, missing,
invalid, uptimeSeconds }` for a deployment probe. `configured` is false when an
Azure setting is absent or unusable: `missing` names the absent ones and
`invalid` the malformed ones, such as an endpoint that is not a valid URL.
Names only, never values.

Every response carries `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY` and `Referrer-Policy: no-referrer`, set in
`next.config.ts`. The cross-origin isolation headers are deliberately not set:
this service exists to be called from another origin, and the allowlist below
is where that decision belongs.

CORS is an allowlist: set `ALLOWED_ORIGIN` to a comma-separated list of
origins. A request from anywhere else is still served, but without the
`Access-Control-Allow-Origin` header, so browsers block it. The header is
never `*`, and if `ALLOWED_ORIGIN` is unset no browser origin is allowed.
Every response sends `Vary: Origin` so shared caches stay correct.

## Status

Walking skeleton: a real single-turn Azure OpenAI call, grounded in
`src/lib/about-me.ts`, reachable cross-origin from the site, with per-IP rate
limiting, multi-turn history, optional streaming and structured request
logging. No RAG or semantic cache yet. See [docs/plan.md](docs/plan.md#9-open-questions--next-steps).
