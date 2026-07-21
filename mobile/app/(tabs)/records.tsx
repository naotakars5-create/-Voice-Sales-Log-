import { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import type { RecordMode, Temperature } from "../../src/types";

interface RecordRow {
  id: string;
  record_date: string;
  mode: RecordMode;
  summary: string | null;
  contacts: string[];
  temperature: Temperature | null;
  clients: { id: string; name: string } | null;
}

export default function RecordsScreen() {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("records")
      .select("id, record_date, mode, summary, contacts, temperature, clients(id, name)")
      .order("record_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);
    setRecords((data as unknown as RecordRow[]) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <FlatList
      style={styles.list}
      data={records}
      keyExtractor={(r) => r.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
      ListEmptyComponent={
        <Text style={styles.empty}>記録がありません</Text>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.date}>{item.record_date}</Text>
            <Text style={styles.temp}>{item.temperature ?? "-"}</Text>
          </View>
          <Text style={styles.client}>
            {item.clients?.name ?? "クライアント未設定"}
            <Text style={styles.mode}>
              {"  "}{item.mode === "meeting" ? "議事録" : "クイック"}
            </Text>
          </Text>
          {item.contacts.length > 0 && (
            <Text style={styles.contacts}>{item.contacts.join(", ")}</Text>
          )}
          <Text style={styles.summary} numberOfLines={2}>
            {item.summary}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: "#fff", padding: 12 },
  empty: { textAlign: "center", color: "#a3a3a3", marginTop: 60, fontSize: 14 },
  card: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  date: { fontSize: 12, color: "#a3a3a3" },
  temp: { fontSize: 12, color: "#525252" },
  client: { fontSize: 14, fontWeight: "600", color: "#171717" },
  mode: { fontSize: 11, fontWeight: "400", color: "#a3a3a3" },
  contacts: { fontSize: 12, color: "#737373", marginTop: 2 },
  summary: { fontSize: 13, color: "#525252", marginTop: 4 },
});
