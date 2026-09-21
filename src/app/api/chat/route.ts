import { NextRequest, NextResponse } from "next/server";

import { AzureOpenAI } from "openai";

import { SYSTEM_PROMPT } from "@/lib/system-prompt";

/** Shown instead of a raw error - see docs/plan.md section 4. */
const FALLBACK_REPLY =
  "Seems like you're really interested in me! Something went wrong on my end - " +
  "how about scheduling a call or dropping me an email to learn more?";

const MAX_MESSAGE_LENGTH = 1000;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export async function POST(req: NextRequest) {
  let message: unknown;
  try {
    ({ message } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json(
      { error: "`message` must be a non-empty string" },
      { status: 400 },
    );
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `\`message\` must be at most ${MAX_MESSAGE_LENGTH} characters` },
      { status: 400 },
    );
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
        { role: "user", content: message },
      ],
      temperature: 0.3,
      max_tokens: 400,
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) throw new Error("Empty completion from Azure OpenAI");

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("[api/chat] upstream failure", error);
    return NextResponse.json({ reply: FALLBACK_REPLY }, { status: 502 });
  }
}
