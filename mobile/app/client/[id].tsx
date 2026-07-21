import { useCallback, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import { generateKarte } from "../../src/lib/api";
import type { DealStatus, Temperature } from "../../src/types";

interface DealRow {
  id: string;
  name: string;
  status: DealStatus;
  amount_note: string | null;
}

interface RecordRow {
  id: string;
  record_date: string;
  summary: string | null;
  contacts: string[];
  temperature: Temperature | null;
}

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [clientName, setClientName] = useState("");
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [karte, setKarte] = useState<string | null>(null);
  const [karteLoading, setKarteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      supabase
        .from("clients")
        .select("name")
        .eq("id", id)
        .single()
        .then(({ data }) => {
          if (data) {
            setClientName(data.name);
            navigation.setOptions({ title: data.name });
          }
        });
      supabase
        .from("deals")
        .select("id, name, status, amount_note")
        .eq("client_id", id)
        .order("updated_at", { ascending: false })
        .then(({ data }) => setDeals((data as DealRow[]) ?? []));
      supabase
        .from("records")
        .select("id, record_date, summary, contacts, temperature")
        .eq("client_id", id)
        .order("record_date", { ascending: false })
        .then(({ data }) => setRecords((data as RecordRow[]) ?? []));
    }, [id, navigation])
  );

  async function handleKarte() {
    if (!id) return;
    setKarteLoading(true);
    setError(null);
    try {
      setKarte(await generateKarte(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "カルテの生成に失敗しました");
    } finally {
      setKarteLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity
        style={[styles.karteButton, karteLoading && styles.disabled]}
        onPress={handleKarte}
        disabled={karteLoading}
      >
        {karteLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.karteButtonText}>AIカルテ生成（{clientName}）</Text>
        )}
      </TouchableOpacity>

      {error && <Text style={styles.error}>{error}</Text>}
      {karte && <Text style={styles.karte}>{karte}</Text>}

      <Text style={styles.sectionTitle}>案件</Text>
      {deals.length === 0 && <Text style={styles.emptyText}>案件はまだありません</Text>}
      {deals.map((d) => (
        <View key={d.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.dealName}>{d.name}</Text>
            <Text style={styles.dealStatus}>{d.status}</Text>
          </View>
          {d.amount_note && <Text style={styles.amountNote}>{d.amount_note}</Text>}
        </View>
      ))}

      <Text style={styles.sectionTitle}>商談履歴</Text>
      {records.length === 0 && <Text style={styles.emptyText}>記録はまだありません</Text>}
      {records.map((r) => (
        <View key={r.id} style={styles.timelineItem}>
          <View style={styles.timelineHeader}>
            <Text style={styles.date}>{r.record_date}</Text>
            <Text style={styles.temp}>{r.temperature ?? "-"}</Text>
          </View>
          {r.contacts.length > 0 && (
            <Text style={styles.contacts}>{r.contacts.join(", ")}</Text>
          )}
          <Text style={styles.summary}>{r.summary}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, paddingBottom: 48 },
  karteButton: {
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  karteButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  disabled: { opacity: 0.6 },
  karte: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 20,
    color: "#404040",
    backgroundColor: "#fafafa",
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 8,
    padding: 12,
  },
  error: { color: "#dc2626", fontSize: 13, marginTop: 8 },
  sectionTitle: { fontSize: 14, fontWeight: "600", color: "#404040", marginTop: 24, marginBottom: 8 },
  emptyText: { fontSize: 13, color: "#a3a3a3" },
  card: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between" },
  dealName: { fontSize: 14, fontWeight: "600", color: "#171717" },
  dealStatus: { fontSize: 12, color: "#525252" },
  amountNote: { fontSize: 12, color: "#737373", marginTop: 4 },
  timelineItem: {
    borderLeftWidth: 2,
    borderLeftColor: "#bfdbfe",
    paddingLeft: 12,
    paddingBottom: 16,
  },
  timelineHeader: { flexDirection: "row", justifyContent: "space-between" },
  date: { fontSize: 12, color: "#a3a3a3" },
  temp: { fontSize: 12, color: "#525252" },
  contacts: { fontSize: 12, color: "#737373", marginTop: 2 },
  summary: { fontSize: 13, color: "#404040", marginTop: 4 },
});
