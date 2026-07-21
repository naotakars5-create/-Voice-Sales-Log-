import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useAudioRecorder,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  IOSOutputFormat,
  AudioQuality,
  type RecordingOptions,
} from "expo-audio";
import { supabase } from "../../src/lib/supabase";
import { transcribeSegment, structureTranscript } from "../../src/lib/api";
import ReviewCard from "../../src/components/ReviewCard";
import type { ClientLike } from "../../src/lib/fuzzyMatch";
import type { RecordMode, StructuredResult } from "../../src/types";

// 4-minute segments keep each upload small and mean a mid-recording failure
// only loses the current segment (same strategy as the web app).
const SEGMENT_MS = 4 * 60 * 1000;
const CONSENT_KEY = "vsl_consent_notice_shown";

// Mono 64kbps AAC: ~2MB per 4-minute segment, well within API limits.
const RECORDING_OPTIONS: RecordingOptions = {
  extension: ".m4a",
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  android: {
    outputFormat: "mpeg4",
    audioEncoder: "aac",
  },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.HIGH,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 64000,
  },
};

type Phase = "idle" | "recording" | "processing" | "review";

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  return `${Math.floor(totalSec / 60)}:${(totalSec % 60).toString().padStart(2, "0")}`;
}

export default function RecordScreen() {
  const [mode, setMode] = useState<RecordMode>("meeting");
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientLike[]>([]);
  const [structured, setStructured] = useState<StructuredResult | null>(null);
  const [transcript, setTranscript] = useState("");
  const [audioPathPrefix, setAudioPathPrefix] = useState<string | null>(null);

  const recorder = useAudioRecorder(RECORDING_OPTIONS);

  const sessionIdRef = useRef("");
  const sequenceRef = useRef(0);
  const stoppingRef = useRef(false);
  const startedAtRef = useRef(0);
  const segmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingRef = useRef<Promise<{ transcript: string; audio_path: string }>[]>([]);

  useEffect(() => {
    if (phase !== "idle") return;
    supabase
      .from("clients")
      .select("id, name, name_kana")
      .order("name")
      .then(({ data }) => setClients((data as ClientLike[]) ?? []));
  }, [phase]);

  function uploadCurrentSegment() {
    const uri = recorder.uri;
    if (!uri) return;
    const sequence = sequenceRef.current;
    sequenceRef.current += 1;
    const p = transcribeSegment(uri, sessionIdRef.current, sequence);
    pendingRef.current.push(p);
    p.then((res) => setAudioPathPrefix((prev) => prev ?? res.audio_path)).catch(() => {
      // surfaced when all promises are awaited in stopRecording
    });
  }

  function scheduleSegmentRotation() {
    if (mode !== "meeting") return;
    segmentTimerRef.current = setTimeout(async () => {
      if (stoppingRef.current) return;
      try {
        await recorder.stop();
        uploadCurrentSegment();
        await recorder.prepareToRecordAsync();
        recorder.record();
        scheduleSegmentRotation();
      } catch {
        // keep the recording alive; failed rotation is picked up at stop time
      }
    }, SEGMENT_MS);
  }

  async function startRecording() {
    setError(null);
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        setError("マイクの使用が許可されていません。設定から許可してください。");
        return;
      }

      const consentShown = await AsyncStorage.getItem(CONSENT_KEY);
      if (!consentShown) {
        await AsyncStorage.setItem(CONSENT_KEY, "1");
        Alert.alert("録音の確認", "相手に録音の旨を伝えましたか？");
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: "doNotMix",
      });

      sessionIdRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sequenceRef.current = 0;
      stoppingRef.current = false;
      pendingRef.current = [];
      setTranscript("");
      setAudioPathPrefix(null);

      await recorder.prepareToRecordAsync();
      recorder.record();

      startedAtRef.current = Date.now();
      setElapsedMs(0);
      elapsedTimerRef.current = setInterval(
        () => setElapsedMs(Date.now() - startedAtRef.current),
        500
      );
      scheduleSegmentRotation();
      setPhase("recording");
    } catch (err) {
      setError(err instanceof Error ? err.message : "録音を開始できませんでした");
    }
  }

  async function stopRecording() {
    stoppingRef.current = true;
    if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);

    setPhase("processing");
    setProgressLabel("音声を処理中...");

    try {
      await recorder.stop();
      uploadCurrentSegment();

      setProgressLabel("文字起こし中...");
      const results = await Promise.all(pendingRef.current);
      const fullTranscript = results.map((r) => r.transcript).join(" ").trim();
      setTranscript(fullTranscript);

      if (!fullTranscript) {
        throw new Error("音声を認識できませんでした。もう一度お試しください");
      }

      setProgressLabel("内容を構造化中...");
      const data = (await structureTranscript({
        transcript: fullTranscript,
        mode,
        date: new Date().toISOString().slice(0, 10),
        existingClients: clients.map((c) => c.name),
      })) as StructuredResult;

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
      <ScrollView style={styles.reviewScroll}>
        <ReviewCard
          mode={mode}
          transcript={transcript}
          audioPath={audioPathPrefix}
          initial={structured}
          clients={clients}
          onDone={resetFlow}
        />
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.modeTabs}>
        {(["meeting", "quick"] as RecordMode[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.modeTab, mode === m && styles.modeTabActive]}
            onPress={() => phase === "idle" && setMode(m)}
            disabled={phase !== "idle"}
          >
            <Text style={[styles.modeTabText, mode === m && styles.modeTabTextActive]}>
              {m === "meeting" ? "議事録モード" : "クイックモード"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {phase === "idle" && (
        <TouchableOpacity style={styles.recordButton} onPress={startRecording}>
          <Text style={styles.recordButtonText}>録音開始</Text>
        </TouchableOpacity>
      )}

      {phase === "recording" && (
        <View style={styles.recordingArea}>
          <TouchableOpacity
            style={[styles.recordButton, styles.recordingButton]}
            onPress={stopRecording}
          >
            <Text style={styles.recordButtonText}>停止</Text>
          </TouchableOpacity>
          <Text style={styles.elapsed}>{formatElapsed(elapsedMs)}</Text>
          <Text style={styles.recordingHint}>
            録音中（画面を閉じても録音は続きます）
          </Text>
        </View>
      )}

      {phase === "processing" && (
        <View style={styles.recordingArea}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.progressLabel}>{progressLabel}</Text>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", padding: 24, backgroundColor: "#fff" },
  reviewScroll: { flex: 1, backgroundColor: "#fff" },
  modeTabs: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 4,
    alignSelf: "stretch",
    marginBottom: 40,
  },
  modeTab: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: "center" },
  modeTabActive: { backgroundColor: "#fff", elevation: 1 },
  modeTabText: { fontSize: 14, color: "#737373" },
  modeTabTextActive: { color: "#2563eb", fontWeight: "600" },
  recordButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 40,
  },
  recordingButton: { backgroundColor: "#b91c1c" },
  recordButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  recordingArea: { alignItems: "center", marginTop: 40, gap: 16 },
  elapsed: { fontSize: 28, fontVariant: ["tabular-nums"], color: "#171717" },
  recordingHint: { fontSize: 12, color: "#737373" },
  progressLabel: { fontSize: 14, color: "#525252" },
  error: {
    marginTop: 24,
    color: "#dc2626",
    backgroundColor: "#fef2f2",
    padding: 12,
    borderRadius: 8,
    fontSize: 13,
  },
});
