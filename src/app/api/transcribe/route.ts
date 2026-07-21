import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/apiAuth";
import { transcribeAudio } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 300;

function extensionFor(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("aac")) return "m4a";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

// Called once per recorded segment (long meetings are chunked into a few
// minutes each on the client). Each segment is uploaded to Storage under
// `${user.id}/${sessionId}/${sequence}.${ext}` and transcribed independently
// so a mid-recording failure only ever loses the current segment.
export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { supabase, user } = auth;

  const form = await request.formData();
  const file = form.get("file");
  const sessionId = form.get("session_id");
  const sequence = form.get("sequence");

  if (!(file instanceof Blob) || typeof sessionId !== "string") {
    return NextResponse.json({ error: "file と session_id は必須です" }, { status: 400 });
  }

  const mimeType = file.type || "audio/webm";
  const ext = extensionFor(mimeType);
  const seq = typeof sequence === "string" ? sequence.padStart(4, "0") : "0000";
  const storagePath = `${user.id}/${sessionId}/${seq}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from("audio")
    .upload(storagePath, buffer, { contentType: mimeType, upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  try {
    const transcript = await transcribeAudio(buffer, `segment.${ext}`, mimeType);
    return NextResponse.json({
      transcript,
      audio_path: `${user.id}/${sessionId}/`,
      segment_path: storagePath,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "文字起こしに失敗しました" },
      { status: 500 }
    );
  }
}
