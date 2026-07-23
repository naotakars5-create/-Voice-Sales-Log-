import { callClaude } from "@/lib/anthropic";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

async function callOpenAI(
  system: string,
  userMessage: string,
  maxTokens: number
): Promise<string> {
  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${detail}`);
  }

  const json = (await res.json()) as {
    choices: { message: { content: string | null } }[];
  };
  return json.choices[0]?.message?.content ?? "";
}

// Text-generation entry point for structuring and karte generation.
// Uses Anthropic when ANTHROPIC_API_KEY is configured, otherwise falls back
// to OpenAI (which is already required for Whisper transcription), so the
// app can run with a single OpenAI key.
export async function callLLM(
  system: string,
  userMessage: string,
  maxTokens = 2048
): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) {
    return callClaude(system, userMessage, maxTokens);
  }
  return callOpenAI(system, userMessage, maxTokens);
}
