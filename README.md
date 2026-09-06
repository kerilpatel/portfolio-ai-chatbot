# portfolio-ai-chatbot

Backend service for the "Ask Me Anything" chatbot on [portfolio-website](../portfolio-website), plus its eval suite.

A thin Next.js API route acts as a server-side proxy to Azure AI Foundry / Azure OpenAI — it is the only place the Azure OpenAI key exists. The chat UI lives in `portfolio-website` and calls this service over HTTP.

See [docs/plan.md](docs/plan.md) for the full design.

## Structure

- `src/app/api/chat/route.ts` — chat endpoint (placeholder)
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

## Status

Setup only — no implementation yet. See [docs/plan.md](docs/plan.md#9-open-questions--next-steps).
