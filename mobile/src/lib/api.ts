import { supabase } from "./supabase";

// Base URL of the deployed Next.js app (Vercel). The AI endpoints
// (/api/transcribe, /api/structure, /api/karte) live there so API keys
// stay server-side.
const API_URL = process.env.EXPO_PUBLIC_API_URL!;

async function authHeader(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("ログインが必要です");
  return { Authorization: `Bearer ${session.access_token}` };
}

export async function transcribeSegment(
  fileUri: string,
  sessionId: string,
  sequence: number
): Promise<{ transcript: string; audio_path: string }> {
  const form = new FormData();
  // React Native FormData accepts { uri, name, type } for file parts.
  form.append("file", {
    uri: fileUri,
    name: `segment-${sequence}.m4a`,
    type: "audio/mp4",
  } as unknown as Blob);
  form.append("session_id", sessionId);
  form.append("sequence", String(sequence));

  const res = await fetch(`${API_URL}/api/transcribe`, {
    method: "POST",
    headers: await authHeader(),
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as { error?: string }));
    throw new Error(body.error || "文字起こしに失敗しました");
  }
  return res.json();
}

export async function structureTranscript(params: {
  transcript: string;
  mode: "meeting" | "quick";
  date: string;
  existingClients: string[];
}) {
  const res = await fetch(`${API_URL}/api/structure`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(await authHeader()),
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as { error?: string }));
    throw new Error(body.error || "構造化に失敗しました");
  }
  return res.json();
}

export async function generateKarte(clientId: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/karte`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(await authHeader()),
    },
    body: JSON.stringify({ client_id: clientId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as { error?: string }));
    throw new Error(body.error || "カルテの生成に失敗しました");
  }
  const data = await res.json();
  return data.karte as string;
}
