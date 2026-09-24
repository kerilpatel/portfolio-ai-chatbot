import { NextRequest, NextResponse } from "next/server";

import { AzureOpenAI } from "openai";

import { corsHeaders } from "@/lib/cors";
import { parseHistory } from "@/lib/history";
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
  const cors = corsHeaders(req.headers.get("origin"));
  const reply = (body: unknown, status: number) =>
    NextResponse.json(body, { status, headers: cors });

  // Checked before the body is even read, so malformed spam still counts.
  const limit = checkRateLimit(clientKey(req.headers));
  if (!limit.allowed) {
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
    return reply({ error: "Invalid JSON body" }, 400);
  }

  if (typeof message !== "string" || message.trim().length === 0) {
    return reply({ error: "`message` must be a non-empty string" }, 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return reply(
      { error: `\`message\` must be at most ${MAX_MESSAGE_LENGTH} characters` },
      400,
    );
  }

  // Untrusted: the client sends history back each turn. parseHistory rejects
  // any role other than user/assistant, so the guardrail prompt can't be
  // overwritten from the request body.
  const history = parseHistory(rawHistory);
  if (!history.ok) {
    return reply({ error: history.error }, 400);
  }

  try {
    const client = new AzureOpenAI({
      endpoint: requiredEnv("AZURE_OPENAI_ENDPOINT"),
      apiKey: requiredEnv("AZURE_OPENAI_API_KEY"),
      deployment: requiredEnv("AZURE_OPENAI_DEPLOYMENT"),
      apiVersion: requiredEnv("AZURE_OPENAI_API_VERSION"),
    });

    const completion = await client.chat.completions.create({
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

    return reply({ reply: answer }, 200);
  } catch (error) {
    console.error("[api/chat] upstream failure", error);
    return reply({ reply: FALLBACK_REPLY }, 502);
  }
}
