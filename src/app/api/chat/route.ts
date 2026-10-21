import { NextRequest, NextResponse } from "next/server";

import { AzureOpenAI } from "openai";

import { MAX_RETRIES, azureConfig, timeoutMs } from "@/lib/config";
import { corsHeaders } from "@/lib/cors";
import { parseHistory } from "@/lib/history";
import { logRequest, upstreamFields } from "@/lib/observability";
import {
  checkRateLimit,
  identifyClient,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { newStats, streamSSE } from "@/lib/stream";
import { SYSTEM_PROMPT, SYSTEM_PROMPT_VERSION } from "@/lib/system-prompt";

/** Shown instead of a raw error - see docs/plan.md section 4. */
const FALLBACK_REPLY =
  "Seems like you're really interested in me! Something went wrong on my end - " +
  "how about scheduling a call or dropping me an email to learn more?";

/** The same charming redirect, in its intended primary context. Sent as
 *  `reply` so the UI renders it as a chat bubble rather than an error. */
const RATE_LIMITED_REPLY =
  "Seems like you're really interested in me! How about scheduling a call or " +
  "dropping me an email to learn more?";

const MAX_MESSAGE_LENGTH = 1000;

/**
 * Ceiling on the request body, checked from Content-Length before anything is
 * read. The message and history caps only apply after `req.json()` has already
 * buffered and parsed the whole body, so without this a single request could
 * make the service parse megabytes before being told it was too long. Rate
 * limiting caps how many requests arrive, not how large they are.
 *
 * A full request - a 1000 character message plus six history messages - is
 * around 5KB, so this leaves generous headroom.
 */
const MAX_BODY_BYTES = 16 * 1024;

/**
 * Requiring JSON is what makes the CORS allowlist actually protective.
 *
 * `text/plain`, `application/x-www-form-urlencoded` and `multipart/form-data`
 * are CORS-safelisted, so a cross-origin request using one of them is sent
 * without a preflight - the allowlist never gets asked. A plain-text body
 * carrying JSON therefore reached the model from any origin at all. Insisting
 * on `application/json` forces a preflight, which the allowlist then refuses.
 *
 * CORS only governs whether the caller may read the response; it never stopped
 * the request arriving and costing tokens.
 */
function isJsonRequest(contentType: string | null): boolean {
  // Tolerate parameters and casing: "application/json; charset=utf-8".
  return contentType?.split(";")[0].trim().toLowerCase() === "application/json";
}

/** Preflight. Allow headers come from the allowlist, so a rejected origin
 *  still gets a 204 - just without permission to read the real response. */
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const { key: client, source: clientKeySource } = identifyClient(req.headers);

  // Checked before the body is even read, so malformed spam still counts.
  const limit = checkRateLimit(client);

  // Every response carries the allowance, including the 400s - the request
  // was counted, so the client should see the cost of it.
  const cors = {
    ...corsHeaders(req.headers.get("origin")),
    ...rateLimitHeaders(limit),
  };

  const reply = (body: unknown, status: number) =>
    NextResponse.json(body, { status, headers: cors });

  /** Every exit point logs exactly once - see plan section 7. */
  const bad = (error: string) => {
    logRequest(client, {
      outcome: "bad_request",
      status: 400,
      latencyMs: Date.now() - startedAt,
      clientKeySource,
    });
    return reply({ error }, 400);
  };

  if (!limit.allowed) {
    logRequest(client, {
      outcome: "rate_limited",
      status: 429,
      latencyMs: Date.now() - startedAt,
      clientKeySource,
    });
    return NextResponse.json(
      { reply: RATE_LIMITED_REPLY },
      {
        status: 429,
        headers: { ...cors, "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  if (!isJsonRequest(req.headers.get("content-type"))) {
    logRequest(client, {
      outcome: "bad_request",
      status: 415,
      latencyMs: Date.now() - startedAt,
      clientKeySource,
    });
    return reply({ error: "Content-Type must be application/json" }, 415);
  }

  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    logRequest(client, {
      outcome: "bad_request",
      status: 413,
      latencyMs: Date.now() - startedAt,
      clientKeySource,
    });
    return reply(
      { error: `Request body must be at most ${MAX_BODY_BYTES} bytes` },
      413,
    );
  }

  let message: unknown;
  let rawHistory: unknown;
  let wantsStream: unknown;
  try {
    ({ message, history: rawHistory, stream: wantsStream } = await req.json());
  } catch {
    return bad("Invalid JSON body");
  }

  if (typeof message !== "string" || message.trim().length === 0) {
    return bad("`message` must be a non-empty string");
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return bad(`\`message\` must be at most ${MAX_MESSAGE_LENGTH} characters`);
  }

  // Untrusted: the client sends history back each turn. parseHistory rejects
  // any role other than user/assistant, so the guardrail prompt can't be
  // overwritten from the request body.
  const history = parseHistory(rawHistory);
  if (!history.ok) {
    return bad(history.error);
  }
  if (wantsStream !== undefined && typeof wantsStream !== "boolean") {
    return bad("`stream` must be a boolean");
  }

  // Read before the try: a missing setting is a broken deploy, and logging it
  // as an upstream failure would make the two indistinguishable in the logs -
  // one needs a redeploy, the other a retry.
  const azureEnv = azureConfig();
  if (!azureEnv.ok) {
    console.error("[api/chat] missing config:", azureEnv.missing.join(", "));
    logRequest(client, {
      outcome: "misconfigured",
      status: 502,
      latencyMs: Date.now() - startedAt,
      clientKeySource,
      promptVersion: SYSTEM_PROMPT_VERSION,
      messageChars: message.length,
      historyMessages: history.messages.length,
    });
    return reply({ reply: FALLBACK_REPLY }, 502);
  }

  try {
    const azure = new AzureOpenAI({
      ...azureEnv.config,
      timeout: timeoutMs(),
      maxRetries: MAX_RETRIES,
    });

    const request = {
      model: azureEnv.config.deployment,
      messages: [
        { role: "system" as const, content: SYSTEM_PROMPT },
        ...history.messages,
        { role: "user" as const, content: message },
      ],
      temperature: 0.3,
      max_tokens: 400,
    };

    if (wantsStream === true) {
      const stats = newStats();
      const upstream = await azure.chat.completions.create({
        ...request,
        stream: true,
        // Without this the final chunk omits usage and token spend is unknown.
        stream_options: { include_usage: true },
      });

      const encoder = new TextEncoder();
      const frames = streamSSE(upstream, stats, FALLBACK_REPLY);

      const body = new ReadableStream({
        async pull(controller) {
          const { value, done } = await frames.next();
          if (done) {
            // Logged here rather than up front, so latency covers the whole
            // stream and the token counts have arrived.
            logRequest(client, {
              outcome: stats.failed ? "upstream_error" : "ok",
              status: 200,
              latencyMs: Date.now() - startedAt,
              clientKeySource,
              promptVersion: SYSTEM_PROMPT_VERSION,
              messageChars: message.length,
              historyMessages: history.messages.length,
              promptTokens: stats.promptTokens,
              completionTokens: stats.completionTokens,
              cachedTokens: stats.cachedTokens,
              ...(stats.failed ? upstreamFields(stats.error) : {}),
            });
            controller.close();
            return;
          }
          controller.enqueue(encoder.encode(value));
        },
      });

      return new NextResponse(body, {
        status: 200,
        headers: {
          ...cors,
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const completion = await azure.chat.completions.create(request);

    const answer = completion.choices[0]?.message?.content?.trim();
    if (!answer) throw new Error("Empty completion from Azure OpenAI");

    logRequest(client, {
      outcome: "ok",
      status: 200,
      latencyMs: Date.now() - startedAt,
      clientKeySource,
      promptVersion: SYSTEM_PROMPT_VERSION,
      messageChars: message.length,
      historyMessages: history.messages.length,
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      cachedTokens: completion.usage?.prompt_tokens_details?.cached_tokens,
    });
    return reply({ reply: answer }, 200);
  } catch (error) {
    console.error("[api/chat] upstream failure", error);
    logRequest(client, {
      outcome: "upstream_error",
      status: 502,
      latencyMs: Date.now() - startedAt,
      clientKeySource,
      promptVersion: SYSTEM_PROMPT_VERSION,
      messageChars: message.length,
      historyMessages: history.messages.length,
      ...upstreamFields(error),
    });
    return reply({ reply: FALLBACK_REPLY }, 502);
  }
}
