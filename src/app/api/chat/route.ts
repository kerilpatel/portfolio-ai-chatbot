import { NextRequest, NextResponse } from "next/server";

import { AzureOpenAI } from "openai";

import { corsHeaders } from "@/lib/cors";
import { parseHistory } from "@/lib/history";
import { logRequest } from "@/lib/observability";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";

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

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
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
  const client = clientKey(req.headers);
  const cors = corsHeaders(req.headers.get("origin"));

  const reply = (body: unknown, status: number) =>
    NextResponse.json(body, { status, headers: cors });

  /** Every exit point logs exactly once - see plan section 7. */
  const bad = (error: string) => {
    logRequest(client, {
      outcome: "bad_request",
      status: 400,
      latencyMs: Date.now() - startedAt,
    });
    return reply({ error }, 400);
  };

  // Checked before the body is even read, so malformed spam still counts.
  const limit = checkRateLimit(client);
  if (!limit.allowed) {
    logRequest(client, {
      outcome: "rate_limited",
      status: 429,
      latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { reply: RATE_LIMITED_REPLY },
      {
        status: 429,
        headers: { ...cors, "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  let message: unknown;
  let rawHistory: unknown;
  try {
    ({ message, history: rawHistory } = await req.json());
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

  try {
    const azure = new AzureOpenAI({
      endpoint: requiredEnv("AZURE_OPENAI_ENDPOINT"),
      apiKey: requiredEnv("AZURE_OPENAI_API_KEY"),
      deployment: requiredEnv("AZURE_OPENAI_DEPLOYMENT"),
      apiVersion: requiredEnv("AZURE_OPENAI_API_VERSION"),
    });

    const completion = await azure.chat.completions.create({
      model: requiredEnv("AZURE_OPENAI_DEPLOYMENT"),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...history.messages,
        { role: "user", content: message },
      ],
      temperature: 0.3,
      max_tokens: 400,
    });

    const answer = completion.choices[0]?.message?.content?.trim();
    if (!answer) throw new Error("Empty completion from Azure OpenAI");

    logRequest(client, {
      outcome: "ok",
      status: 200,
      latencyMs: Date.now() - startedAt,
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
      messageChars: message.length,
      historyMessages: history.messages.length,
    });
    return reply({ reply: FALLBACK_REPLY }, 502);
  }
}
