const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";
const MAX_WHISPER_BYTES = 24 * 1024 * 1024; // stay under the 25MB Whisper limit

async function transcribeChunk(
  bytes: Uint8Array,
  filename: string,
  mimeType: string
): Promise<string> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes as unknown as BlobPart], { type: mimeType }),
    filename
  );
  form.append("model", "whisper-1");
  form.append("language", "ja");

  const res = await fetch(WHISPER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Whisper API error (${res.status}): ${detail}`);
  }

  const json = (await res.json()) as { text: string };
  return json.text;
}

// Whisper rejects files over 25MB. Long meeting recordings are normally kept
// under that by client-side segmenting, but as a defensive fallback we also
// split any oversized single file into byte-range slices here and stitch the
// resulting transcripts back together in order.
export async function transcribeAudio(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<string> {
  if (buffer.byteLength <= MAX_WHISPER_BYTES) {
    return transcribeChunk(new Uint8Array(buffer), filename, mimeType);
  }

  const parts: string[] = [];
  for (let offset = 0; offset < buffer.byteLength; offset += MAX_WHISPER_BYTES) {
    const slice = buffer.subarray(offset, offset + MAX_WHISPER_BYTES);
    const text = await transcribeChunk(new Uint8Array(slice), filename, mimeType);
    parts.push(text);
  }
  return parts.join(" ");
}
