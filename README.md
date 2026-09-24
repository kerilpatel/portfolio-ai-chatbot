# portfolio-ai-chatbot

Backend service for the "Ask Me Anything" chatbot on [portfolio-website](../portfolio-website), plus its eval suite.

A thin Next.js API route acts as a server-side proxy to Azure AI Foundry / Azure OpenAI — it is the only place the Azure OpenAI key exists. The chat UI lives in `portfolio-website` and calls this service over HTTP.

See [docs/plan.md](docs/plan.md) for the full design.

## Structure

- `src/app/api/chat/route.ts` — chat endpoint (single-turn, no RAG yet)
- `src/lib/system-prompt.ts` — scoping + grounding guardrail prompt
- `src/lib/cors.ts` — origin allowlist
- `src/lib/rate-limit.ts` — per-IP sliding window
- `src/lib/history.ts` — conversation history validation + trimming
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

## Evals

```bash
npx promptfoo eval -c eval/promptfooconfig.yaml
```

## API

`POST /api/chat` with `{ "message": "...", "history": [...] }` returns
`{ "reply": "..." }`. `history` is optional and holds prior turns as
`{ role: "user" | "assistant", content: string }`. This service is stateless,
so the client sends the conversation back each turn; only the last 6 messages
(and 4000 characters) are forwarded, since every one is re-billed. Any other
`role` is rejected with `400` - accepting `system` from the body would let a
caller overwrite the guardrail prompt.
Returns `400` on a missing/empty/over-long message, and `502` with a friendly
`reply` if the upstream call fails. `OPTIONS /api/chat` handles the preflight.

Rate limited to 20 requests per 15 minutes per IP. Over that it returns `429`
with a `Retry-After` header and a friendly `reply` in the normal response
shape, so the UI can render it as a chat message rather than an error. The
window is in-memory, so it resets on redeploy and is per-instance.

CORS is an allowlist: set `ALLOWED_ORIGIN` to a comma-separated list of
origins. A request from anywhere else is still served, but without the
`Access-Control-Allow-Origin` header, so browsers block it. The header is
never `*`, and if `ALLOWED_ORIGIN` is unset no browser origin is allowed.
Every response sends `Vary: Origin` so shared caches stay correct.

## Status

Walking skeleton: a real single-turn Azure OpenAI call, grounded in
`src/lib/about-me.ts`, reachable cross-origin from the site, with per-IP rate
limiting and multi-turn history. No RAG, semantic cache, or streaming yet. See [docs/plan.md](docs/plan.md#9-open-questions--next-steps).
