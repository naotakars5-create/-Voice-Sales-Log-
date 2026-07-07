"use client";

import { useEffect, useRef, useState } from "react";
import ReviewCard from "@/components/ReviewCard";
import type { ClientLike } from "@/lib/fuzzyMatch";
import type { RecordMode, StructuredResult } from "@/types/db";

const SEGMENT_MS = 4 * 60 * 1000; // restart the recorder every 4 minutes so each
// segment stays well under Whisper's 25MB limit and is uploaded as soon as it's done
const CONSENT_TOAST_KEY = "vsl_show_consent_toast";

type Phase = "idle" | "recording" | "processing" | "review";

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return "";
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export default function Recorder({
  clients,
  todayIso,
}: {
  clients: ClientLike[];
  todayIso: string;
}) {
  const [mode, setMode] = useState<RecordMode>("meeting");
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [showConsentToast, setShowConsentToast] = useState(false);
  const [consentEnabled, setConsentEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [transcript, setTranscript] = useState("");
  const [audioPathPrefix, setAudioPathPrefix] = useState<string | null>(null);
  const [structured, setStructured] = useState<StructuredResult | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sequenceRef = useRef(0);
  const sessionIdRef = useRef<string>("");
  const stoppingRef = useRef(false);
  const segmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const pendingTranscriptsRef = useRef<Promise<string>[]>([]);
  const mimeTypeRef = useRef("");

  useEffect(() => {
    const saved = localStorage.getItem(CONSENT_TOAST_KEY);
    setConsentEnabled(saved === null ? true : saved === "true");
  }, []);

  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch {
      // wakeLock is best-effort; ignore if unsupported or denied
    }
  }

  function releaseWakeLock() {
    try {
      wakeLockRef.current?.release();
    } catch {
      // ignore
    }
    wakeLockRef.current = null;
  }

  async function uploadAndTranscribeSegment(blob: Blob, sequence: number): Promise<string> {
    const form = new FormData();
    form.append("file", blob, `segment-${sequence}`);
    form.append("session_id", sessionIdRef.current);
    form.append("sequence", String(sequence));

    const res = await fetch("/api/transcribe", { method: "POST", body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "文字起こしに失敗しました");
    }
    const data = await res.json();
    if (!audioPathPrefix) setAudioPathPrefix(data.audio_path);
    return data.transcript as string;
  }

  function startSegmentRecorder(isFinal: boolean) {
    const stream = streamRef.current;
    if (!stream) return;

    const recorder = new MediaRecorder(stream, mimeTypeRef.current ? { mimeType: mimeTypeRef.current } : undefined);
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || "audio/webm" });
      const sequence = sequenceRef.current;
      sequenceRef.current += 1;

      if (blob.size > 0) {
        const promise = uploadAndTranscribeSegment(blob, sequence);
        pendingTranscriptsRef.current.push(promise);
        promise.catch(() => {
          // surfaced later when all promises are awaited in stopRecording
        });
      }

      if (!isFinal && !stoppingRef.current) {
        startSegmentRecorder(false);
      }
    };

    recorder.start();
    recorderRef.current = recorder;

    if (mode === "meeting") {
      segmentTimerRef.current = setTimeout(() => {
        recorderRef.current?.stop();
      }, SEGMENT_MS);
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mimeTypeRef.current = pickMimeType();
      sessionIdRef.current = crypto.randomUUID();
      sequenceRef.current = 0;
      stoppingRef.current = false;
      pendingTranscriptsRef.current = [];
      setTranscript("");
      setAudioPathPrefix(null);

      await requestWakeLock();

      startedAtRef.current = Date.now();
      setElapsedMs(0);
      elapsedTimerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 500);

      startSegmentRecorder(false);
      setPhase("recording");

      if (consentEnabled) {
        setShowConsentToast(true);
        localStorage.setItem(CONSENT_TOAST_KEY, "true");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "マイクへのアクセスに失敗しました"
      );
    }
  }

  async function stopRecording() {
    stoppingRef.current = true;
    setShowConsentToast(false);

    if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);

    setPhase("processing");
    setProgressLabel("音声を処理中...");

    await new Promise<void>((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve();
        return;
      }
      const originalOnStop = recorder.onstop as ((ev: Event) => void) | null;
      recorder.onstop = (ev) => {
        originalOnStop?.call(recorder, ev);
        resolve();
      };
      recorder.stop();
    });

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    releaseWakeLock();

    try {
      setProgressLabel("文字起こし中...");
      const transcripts = await Promise.all(pendingTranscriptsRef.current);
      const fullTranscript = transcripts.join(" ").trim();
      setTranscript(fullTranscript);

      if (!fullTranscript) {
        throw new Error("音声を認識できませんでした。もう一度お試しください");
      }

      setProgressLabel("内容を構造化中...");
      const res = await fetch("/api/structure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transcript: fullTranscript,
          mode,
          date: todayIso,
          existingClients: clients.map((c) => c.name),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "構造化に失敗しました");
      }
      const data = (await res.json()) as StructuredResult;
      setStructured(data);
      setPhase("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "処理に失敗しました");
      setPhase("idle");
    }
  }

  function resetFlow() {
    setPhase("idle");
    setStructured(null);
    setTranscript("");
    setAudioPathPrefix(null);
    setElapsedMs(0);
    setError(null);
  }

  if (phase === "review" && structured) {
    return (
      <ReviewCard
        mode={mode}
        transcript={transcript}
        audioPath={audioPathPrefix}
        initial={structured}
        clients={clients}
        onSaved={resetFlow}
        onDiscard={resetFlow}
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-8 p-6 pt-10">
      <div className="flex w-full rounded-lg bg-neutral-100 p-1">
        {(["meeting", "quick"] as RecordMode[]).map((m) => (
          <button
            key={m}
            type="button"
            disabled={phase !== "idle"}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition disabled:opacity-50 ${
              mode === m ? "bg-white text-blue-700 shadow" : "text-neutral-500"
            }`}
          >
            {m === "meeting" ? "議事録モード" : "クイックモード"}
          </button>
        ))}
      </div>

      {phase === "idle" && (
        <button
          type="button"
          onClick={startRecording}
          className="flex h-40 w-40 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition active:scale-95"
        >
          <span className="text-base font-semibold">録音開始</span>
        </button>
      )}

      {phase === "recording" && (
        <div className="flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={stopRecording}
            className="relative flex h-40 w-40 items-center justify-center rounded-full bg-red-600 text-white shadow-lg"
          >
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
            <span className="relative text-base font-semibold">停止</span>
          </button>
          <p className="text-2xl font-mono tabular-nums text-neutral-800">
            {formatElapsed(elapsedMs)}
          </p>
        </div>
      )}

      {phase === "processing" && (
        <div className="flex flex-col items-center gap-4 py-10">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-200 border-t-blue-600" />
          <p className="text-sm text-neutral-600">{progressLabel}</p>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
      )}

      {showConsentToast && (
        <div className="fixed inset-x-4 bottom-20 z-50 rounded-lg bg-neutral-900 px-4 py-3 text-sm text-white shadow-lg">
          相手に録音の旨を伝えましたか？
          <button
            type="button"
            onClick={() => setShowConsentToast(false)}
            className="ml-3 underline"
          >
            閉じる
          </button>
          <button
            type="button"
            onClick={() => {
              localStorage.setItem(CONSENT_TOAST_KEY, "false");
              setConsentEnabled(false);
              setShowConsentToast(false);
            }}
            className="ml-3 underline"
          >
            今後表示しない
          </button>
        </div>
      )}
    </div>
  );
}
