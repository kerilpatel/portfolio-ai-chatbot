# Portfolio "Ask Me Anything" AI Chatbot - Implementation Plan

## 1. Overview

A generative AI-powered chat widget embedded in the personal portfolio site (Next.js). It appears as a bottom-right popup on page load and invites visitors to ask anything about the owner's experience, skills, and past work. Beyond being a useful feature, this project doubles as a **portfolio piece in itself** - showcasing skills in RAG, LLM evaluation, guardrails, and production-grade AI system design.

- **Site stack:** React (Vite), consuming this repo's widget as an npm package
- **Hosting:** Azure (site + proxy)
- **LLM provider:** Azure AI Foundry / Azure OpenAI
- **Eval platform:** Promptfoo (recently acquired by OpenAI)

---

## 2. Architecture & Repo Structure

Split by what can and can't touch the Azure OpenAI key:

- **This repo (`portfolio-ai-chatbot`)**: a thin server-side proxy (`src/app/api/chat/route.ts`) plus the business logic behind it - system prompt, RAG retrieval, semantic cache, guardrails - and the eval suite. This is the only place the Azure OpenAI key exists, and the only thing allowed to call Azure OpenAI. Deployed as a Next.js app (Azure Static Web App / App Service).
- **`portfolio-website`**: owns the chat UI entirely, written in the site's own design system, calling this service's endpoint over HTTP.

No npm package is published between them - the boundary is HTTP. A client wrapper would only be ~50 lines of `fetch` + stream reading, which doesn't justify a registry, versioning, and auth tokens in CI for a single consumer.

---

## 3. Retrieval Strategy (RAG+)

- **Hybrid RAG approach:**
  - Store resume, project details, and past work as chunked embeddings in a vector store (Azure AI Search).
  - _Always_ include a compact structured "About Me" summary directly in the system context on every call - protects against retrieval missing obvious/important facts.
- Open to RAG alternatives/improvements beyond vanilla RAG (see caching below - semantic caching effectively acts as a retrieval-layer optimization too).

---

## 4. Cost Optimization (Token Usage)

- **Semantic caching:**
  - Embed every incoming question.
  - Compare against a vector store of past Q&A pairs.
  - If similarity crosses a threshold (e.g. ~90%), return the cached answer instantly - no model call.
  - Can use Azure AI Search or Redis with vector support.
  - High payoff for a personal portfolio since most visitors ask a small set of recurring questions.
- **Prompt caching:**
  - Use Azure OpenAI prompt caching so the system prompt + "About Me" context block isn't re-billed on every call - only new user question tokens cost full price.
  - **Not yet eligible.** Caching only applies to a prefix of at least 1024
    tokens. The system prompt plus the placeholder "About Me" measures ~1400
    characters, roughly 350-465 tokens, so caching cannot engage at all today
    and `cachedTokens` in the request log stays empty - which reads as caching
    being broken rather than never having applied. Real `about-me` content plus
    retrieved context should clear the threshold. Check with
    `npm run prompt:size`.
  - Verified against Microsoft Learn: the 1024-token floor holds, and the
    first 1024 tokens must also be identical between calls - so every prompt
    or content edit makes the next call a miss. On GPT-5.6+ there are also
    explicit cache breakpoints and cache _writes_ can be billed, which is
    worth checking against whichever model is deployed.
- **Cost monitoring & budgets:**
  - Set up Azure OpenAI spend alerts to catch abuse (e.g., endpoint hammering) early.
- **Graceful rate-limit UX (signature touch):**
  - Instead of a generic error/limit message, respond with something charming and on-brand, e.g.:
    > "Seems like you're really interested in me! How about scheduling a call or dropping me an email to learn more?"
  - Applies to both error states and heavy repeated-question usage from one visitor.

---

## 5. Guardrails (3 Layers)

1. **System prompt scoping:** Strictly boxes the assistant into the owner's professional identity; explicitly instructed to decline/redirect off-topic or inappropriate requests.
2. **Azure AI Content Safety:** Attach directly to the Foundry deployment to catch harmful/abusive input before it reaches the model.
3. **Output grounding:** Model must stay grounded to actual retrieved content; instructed to say "I don't have that information" rather than inventing claims/credentials.
4. **Rate limiting per visitor:** Prevent spam/abuse from inflating token costs.

---

## 6. LLM Evaluation

- **Offline evaluation:**
  - Build a golden dataset (~50-100 Q&A pairs) covering real experience/background.
  - Run against the bot on every prompt/context change.
  - Measure groundedness, relevance, hallucination rate.
  - Use **Promptfoo** as the eval platform; Azure AI Foundry's evaluation SDK is a complementary option (groundedness, coherence, fluency via model-as-judge).
- **Online evaluation:**
  - Continuously sample real visitor conversations.
  - Run lightweight automated checks, flagging low groundedness or safety violations.
  - Helps catch drift over time.
- **Optional:** Public-facing dashboard showing eval metrics as an additional portfolio showcase element.

---

## 7. Production-Grade Considerations

- **Observability & tracing:** Log latency, token counts, retrieval chunks used, and final responses. Azure AI Foundry has built-in tracing that pairs well with the eval pipeline.
- **Conversation memory & session handling:** Decide how much history to carry forward per turn - direct tradeoff between context quality and token cost.
- **Streaming responses:** Stream tokens back as generated for a faster-feeling UX.
- **Fallback & error handling:** Graceful degradation if Azure OpenAI is down or rate-limited (ties into the charming redirect-to-contact UX above).
- **Prompt/context versioning:** Treat prompts like code - version controlled - so eval results are meaningful over time.
- **A/B testing prompts:** Run two versions of system prompt/retrieval strategy side by side, split traffic, compare via eval metrics.

---

## 8. Deployment

- **This service:** Next.js app deployed to Azure (Static Web App or App Service) via its own CI workflow, holding the Azure OpenAI credentials as deployment secrets.
- **CORS:** the endpoint must allow the portfolio site's origin (`ALLOWED_ORIGIN`), since the two are deployed separately.
- **`portfolio-website`:** calls the deployed endpoint directly from its own chat UI component; no build-time coupling to this repo.

---

## 9. Open Questions / Next Steps

- [x] Golden dataset complete at 49 rows: 29 factual, 7 unknown-fact, 6
      injection, 5 off-topic, 2 identity. Every factual rubric asserts against
      a fact that is actually in `about-me.ts`, checked mechanically.
- [ ] Define the "About Me" structured summary format for always-in-context data.
- [x] CORS allowlist + `OPTIONS` preflight on `/api/chat` (section 8), with
      `application/json` required so the allowlist cannot be sidestepped by a
      preflight-free content type.
- [x] Per-visitor rate limiting, in-memory (section 5, layer 4).
- [x] Request body and history-entry caps, so one request cannot make the
      service parse megabytes before being told it was too large.
- [x] Conversation history: client-supplied, capped at 6 messages / 4000 chars
      (section 7). Roles other than user/assistant are rejected.
- [x] Add a test runner (`npm test`, Node built-in) covering `src/lib/`.
- [x] Structured per-request logging: latency, tokens, outcome (section 7).
      Outcomes distinguish a misconfigured deploy from an upstream failure,
      and a failure carries the upstream status/code/param that caused it.
- [x] Prompt/context versioning: hash of the live prompt, logged per request
      (section 7). Derived, not hand-maintained, so it can't go stale.
- [x] Streaming responses, opt-in via `stream: true` (section 7). Framing is
      unit-tested; the live Azure stream still needs credentials to confirm.
- [ ] Decide whether to sample conversation content for online eval - the log
      is metadata-only today, and content sampling is a privacy tradeoff.
- [ ] Move rate limiting to shared storage if this ever runs on >1 instance.
- [x] Rate limiting now keys on the entry a trusted proxy appended, counting
      in from the right, so a caller cannot rotate a spoofed `x-forwarded-for`
      prefix to get a fresh allowance.
- [ ] Set `TRUSTED_PROXY_HOPS` to match the chosen hosting: 1 for App Service
      or a Static Web App taking traffic directly, 2 behind Front Door. Too
      high and a caller can spoof their identity again.
- [ ] Set semantic cache similarity threshold and TTL policy.
- [x] CI on every push/PR: lint, typecheck, test, build (no secrets needed).
- [ ] Add the Promptfoo eval run to CI - needs Azure credentials as repo
      secrets and a filled-in golden dataset first.
- [x] Write the system prompt (`src/lib/system-prompt.ts`) — scoping + grounding.
- [ ] Replace the placeholder content in `src/lib/about-me.ts` with real
      details. Also needed before prompt caching can engage - see section 4.
- [ ] Set up Azure AI Content Safety on the Foundry deployment.
- [ ] Set up cost/budget alerts in Azure.
- [ ] Implement `src/lib/rag` and `src/lib/cache` (not yet created) against Azure AI Search.
- [x] Health endpoint (`GET /api/health`) for the deployment probe, reporting
      absent settings and present-but-malformed ones separately.
- [x] Explicit upstream timeout + retry cap, so a hung Azure call cannot
      outlive the hosting platform's own request cutoff (section 7).
- [ ] **Decide the API surface.** Microsoft now recommends the v1 API - the
      `/openai/v1/` path with no dated `api-version`, called with the stock
      `OpenAI()` client rather than `AzureOpenAI()`. `2024-10-21` still works
      but is feature-frozen, and two things already built depend on leaving it:
      streamed token totals (`stream_options`, now only sent when the version
      declares it) and cached-token accounting (`prompt_tokens_details`),
      neither of which exists in the `2024-10-21` schema.
- [x] Generation parameters follow the deployed model via
      `AZURE_OPENAI_REASONING_MODEL`. Reasoning models reject `max_tokens`
      _and_ `temperature`; ordinary deployments need both, and older ones do
      not accept `max_completion_tokens`. No single set satisfies both.
- [ ] Set `AZURE_OPENAI_REASONING_MODEL` to match the chat deployment. The
      default suits gpt-4o/4.1; left wrong, the first real call 400s and the
      upstream error log names the offending parameter.
- [ ] Decide on final hosting choice for the proxy: Azure Static Web App vs. Azure App Service vs. Azure Functions.
