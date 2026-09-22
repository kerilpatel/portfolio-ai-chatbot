# portfolio-ai-chatbot

Backend service for the "Ask Me Anything" chatbot on [portfolio-website](../portfolio-website), plus its eval suite.

A thin Next.js API route acts as a server-side proxy to Azure AI Foundry / Azure OpenAI — it is the only place the Azure OpenAI key exists. The chat UI lives in `portfolio-website` and calls this service over HTTP.

See [docs/plan.md](docs/plan.md) for the full design.

## Structure

- `src/app/api/chat/route.ts` — chat endpoint (single-turn, no RAG yet)
- `src/lib/system-prompt.ts` — scoping + grounding guardrail prompt
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

`POST /api/chat` with `{ "message": "..." }` returns `{ "reply": "..." }`.
Returns `400` on a missing/empty/over-long message, and `502` with a friendly
`reply` if the upstream call fails. `OPTIONS /api/chat` handles the preflight.

CORS is an allowlist: set `ALLOWED_ORIGIN` to a comma-separated list of
origins. A request from anywhere else is still served, but without the
`Access-Control-Allow-Origin` header, so browsers block it. The header is
never `*`, and if `ALLOWED_ORIGIN` is unset no browser origin is allowed.
Every response sends `Vary: Origin` so shared caches stay correct.

## Status

Walking skeleton: a real single-turn Azure OpenAI call, grounded in
`src/lib/about-me.ts`, reachable cross-origin from the site. No RAG, semantic
cache, streaming, or rate limiting yet. See [docs/plan.md](docs/plan.md#9-open-questions--next-steps).
