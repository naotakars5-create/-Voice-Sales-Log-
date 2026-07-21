import { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { supabase } from "../lib/supabase";
import { findClientMatches, type ClientLike } from "../lib/fuzzyMatch";
import type {
  DealStatus,
  RecordMode,
  StructuredResult,
  Temperature,
} from "../types";

const DEAL_STATUSES: DealStatus[] = ["初回接触", "提案中", "検討中", "受注", "失注"];
const TEMPERATURES: Temperature[] = ["高", "中", "低"];

interface EditableDeal {
  name: string;
  status: DealStatus;
  amount_note: string;
}

interface EditableAction {
  task: string;
  due: string;
}

export default function ReviewCard({
  mode,
  transcript,
  audioPath,
  initial,
  clients,
  onDone,
}: {
  mode: RecordMode;
  transcript: string;
  audioPath: string | null;
  initial: StructuredResult;
  clients: ClientLike[];
  onDone: () => void;
}) {
  const [clientName, setClientName] = useState(
    initial.client_match || initial.client || ""
  );
  const [selectedClientId, setSelectedClientId] = useState<string | null>(() => {
    const preset = initial.client_match || initial.client;
    if (!preset) return null;
    return clients.find((c) => c.name === preset)?.id ?? null;
  });
  const [contactsText, setContactsText] = useState(initial.contacts.join(", "));
  const [summary, setSummary] = useState(initial.summary);
  const [temperature, setTemperature] = useState<Temperature>(initial.temperature);
  const [deals, setDeals] = useState<EditableDeal[]>(
    initial.deals.map((d) => ({ ...d }))
  );
  const [actions, setActions] = useState<EditableAction[]>(
    initial.next_actions.map((a) => ({ task: a.task, due: a.due ?? "" }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  const suggestions = useMemo(() => {
    if (selectedClientId) return [];
    return findClientMatches(clientName, clients).slice(0, 3);
  }, [clientName, clients, selectedClientId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("ログインが必要です");

      let clientId = selectedClientId;
      if (!clientId && clientName.trim()) {
        const { data: newClient, error: clientErr } = await supabase
          .from("clients")
          .insert({ user_id: user.id, name: clientName.trim() })
          .select("id")
          .single();
        if (clientErr) throw clientErr;
        clientId = newClient.id as string;
      }

      const contacts = contactsText
        .split(/[,、]/)
        .map((c) => c.trim())
        .filter(Boolean);

      const { data: record, error: recordErr } = await supabase
        .from("records")
        .insert({
          user_id: user.id,
          client_id: clientId,
          record_date: new Date().toISOString().slice(0, 10),
          mode,
          audio_path: audioPath,
          transcript,
          summary,
          contacts,
          temperature,
        })
        .select("id")
        .single();
      if (recordErr) throw recordErr;

      const dealIds: string[] = [];
      if (clientId) {
        for (const deal of deals) {
          if (!deal.name.trim()) continue;
          const { data: dealRow, error: dealErr } = await supabase
            .from("deals")
            .insert({
              user_id: user.id,
              client_id: clientId,
              name: deal.name.trim(),
              status: deal.status,
              amount_note: deal.amount_note || null,
            })
            .select("id")
            .single();
          if (dealErr) throw dealErr;
          dealIds.push(dealRow.id as string);
          const { error: linkErr } = await supabase
            .from("record_deals")
            .insert({ record_id: record.id, deal_id: dealRow.id });
          if (linkErr) throw linkErr;
        }
      }

      for (const action of actions) {
        if (!action.task.trim()) continue;
        const { error: actionErr } = await supabase.from("next_actions").insert({
          user_id: user.id,
          record_id: record.id,
          deal_id: dealIds[0] ?? null,
          task: action.task.trim(),
          due_date: action.due || null,
          done: false,
        });
        if (actionErr) throw actionErr;
      }

      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>内容を確認</Text>

      <Text style={styles.label}>クライアント</Text>
      <TextInput
        style={styles.input}
        value={clientName}
        onChangeText={(t) => {
          setClientName(t);
          setSelectedClientId(null);
        }}
        placeholder="企業名を入力"
      />
      {suggestions.map(({ client }) => (
        <TouchableOpacity
          key={client.id}
          style={styles.suggestion}
          onPress={() => {
            setClientName(client.name);
            setSelectedClientId(client.id);
          }}
        >
          <Text style={styles.suggestionText}>{client.name}</Text>
        </TouchableOpacity>
      ))}
      {clientName.trim().length > 0 && !selectedClientId &&
        !clients.some((c) => c.name === clientName.trim()) && (
          <Text style={styles.newClientNote}>新規クライアントとして登録されます</Text>
        )}

      <Text style={styles.label}>面談相手（カンマ区切り）</Text>
      <TextInput style={styles.input} value={contactsText} onChangeText={setContactsText} />

      <Text style={styles.label}>要約</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={summary}
        onChangeText={setSummary}
        multiline
      />

      <Text style={styles.label}>温度感</Text>
      <View style={styles.row}>
        {TEMPERATURES.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.chip, temperature === t && styles.chipActive]}
            onPress={() => setTemperature(t)}
          >
            <Text style={[styles.chipText, temperature === t && styles.chipTextActive]}>
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.label}>案件</Text>
        <TouchableOpacity
          onPress={() =>
            setDeals((prev) => [...prev, { name: "", status: "初回接触", amount_note: "" }])
          }
        >
          <Text style={styles.addLink}>+ 追加</Text>
        </TouchableOpacity>
      </View>
      {deals.map((deal, i) => (
        <View key={i} style={styles.card}>
          <TextInput
            style={styles.input}
            value={deal.name}
            placeholder="案件名"
            onChangeText={(t) =>
              setDeals((prev) => prev.map((d, idx) => (idx === i ? { ...d, name: t } : d)))
            }
          />
          <View style={styles.rowWrap}>
            {DEAL_STATUSES.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.chipSmall, deal.status === s && styles.chipActive]}
                onPress={() =>
                  setDeals((prev) =>
                    prev.map((d, idx) => (idx === i ? { ...d, status: s } : d))
                  )
                }
              >
                <Text
                  style={[styles.chipTextSmall, deal.status === s && styles.chipTextActive]}
                >
                  {s}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={deal.amount_note}
            placeholder="金額感"
            onChangeText={(t) =>
              setDeals((prev) =>
                prev.map((d, idx) => (idx === i ? { ...d, amount_note: t } : d))
              )
            }
          />
          <TouchableOpacity
            onPress={() => setDeals((prev) => prev.filter((_, idx) => idx !== i))}
          >
            <Text style={styles.deleteLink}>削除</Text>
          </TouchableOpacity>
        </View>
      ))}

      <View style={styles.sectionHeader}>
        <Text style={styles.label}>次アクション</Text>
        <TouchableOpacity
          onPress={() => setActions((prev) => [...prev, { task: "", due: "" }])}
        >
          <Text style={styles.addLink}>+ 追加</Text>
        </TouchableOpacity>
      </View>
      {actions.map((action, i) => (
        <View key={i} style={styles.card}>
          <TextInput
            style={styles.input}
            value={action.task}
            placeholder="タスク"
            onChangeText={(t) =>
              setActions((prev) =>
                prev.map((a, idx) => (idx === i ? { ...a, task: t } : a))
              )
            }
          />
          <TextInput
            style={styles.input}
            value={action.due}
            placeholder="期日 (YYYY-MM-DD)"
            onChangeText={(t) =>
              setActions((prev) =>
                prev.map((a, idx) => (idx === i ? { ...a, due: t } : a))
              )
            }
          />
          <TouchableOpacity
            onPress={() => setActions((prev) => prev.filter((_, idx) => idx !== i))}
          >
            <Text style={styles.deleteLink}>削除</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity onPress={() => setShowTranscript((v) => !v)}>
        <Text style={styles.transcriptToggle}>
          {showTranscript ? "▼ 文字起こし全文を隠す" : "▶ 文字起こし全文を表示"}
        </Text>
      </TouchableOpacity>
      {showTranscript && <Text style={styles.transcript}>{transcript}</Text>}

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.secondaryButton} onPress={onDone} disabled={saving}>
          <Text style={styles.secondaryButtonText}>やり直す</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, saving && styles.disabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.primaryButtonText}>{saving ? "保存中..." : "保存"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  heading: { fontSize: 18, fontWeight: "bold", marginBottom: 8 },
  label: { fontSize: 13, fontWeight: "600", color: "#404040", marginTop: 16, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#d4d4d4",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    marginBottom: 6,
    backgroundColor: "#fff",
  },
  multiline: { minHeight: 72, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 8 },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 6 },
  chip: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d4d4d4",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  chipSmall: {
    borderWidth: 1,
    borderColor: "#d4d4d4",
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  chipActive: { borderColor: "#2563eb", backgroundColor: "#eff6ff" },
  chipText: { fontSize: 14, color: "#525252" },
  chipTextSmall: { fontSize: 12, color: "#525252" },
  chipTextActive: { color: "#1d4ed8", fontWeight: "600" },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  addLink: { color: "#2563eb", fontSize: 13, marginTop: 16 },
  deleteLink: { color: "#ef4444", fontSize: 12, textAlign: "right" },
  card: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  suggestion: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 6,
    padding: 8,
    marginBottom: 4,
    backgroundColor: "#fafafa",
  },
  suggestionText: { fontSize: 14, color: "#171717" },
  newClientNote: { fontSize: 12, color: "#2563eb", marginBottom: 4 },
  transcriptToggle: { color: "#525252", fontSize: 13, marginTop: 20 },
  transcript: {
    fontSize: 13,
    color: "#525252",
    backgroundColor: "#fafafa",
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  error: { color: "#dc2626", fontSize: 13, marginTop: 12 },
  buttonRow: { flexDirection: "row", gap: 12, marginTop: 24 },
  primaryButton: {
    flex: 1,
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d4d4d4",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryButtonText: { color: "#525252", fontWeight: "600", fontSize: 15 },
  disabled: { opacity: 0.5 },
});
