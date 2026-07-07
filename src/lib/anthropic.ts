const MESSAGES_URL = "https://api.anthropic.com/v1/messages";

// Override via ANTHROPIC_MODEL if your account uses a different model id.
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

export async function callClaude(
  system: string,
  userMessage: string,
  maxTokens = 2048
): Promise<string> {
  const res = await fetch(MESSAGES_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${detail}`);
  }

  const json = (await res.json()) as {
    content: { type: string; text?: string }[];
  };

  return json.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n");
}

// Claude is told to return raw JSON, but strip code fences defensively in
// case it wraps the response anyway.
export function parseJsonResponse<T>(raw: string): T {
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }
  return JSON.parse(text) as T;
}
