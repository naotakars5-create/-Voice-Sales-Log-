import { useCallback, useState } from "react";
import { Text, FlatList, StyleSheet, TouchableOpacity } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { supabase } from "../../src/lib/supabase";

interface ClientRow {
  id: string;
  name: string;
  memo: string | null;
}

export default function ClientsScreen() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      supabase
        .from("clients")
        .select("id, name, memo")
        .order("name")
        .then(({ data }) => setClients((data as ClientRow[]) ?? []));
    }, [])
  );

  return (
    <FlatList
      style={styles.list}
      data={clients}
      keyExtractor={(c) => c.id}
      ListEmptyComponent={
        <Text style={styles.empty}>クライアントがまだ登録されていません</Text>
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push(`/client/${item.id}`)}
        >
          <Text style={styles.name}>{item.name}</Text>
          {item.memo && <Text style={styles.memo}>{item.memo}</Text>}
        </TouchableOpacity>
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
    marginBottom: 8,
  },
  name: { fontSize: 14, fontWeight: "600", color: "#171717" },
  memo: { fontSize: 12, color: "#737373", marginTop: 2 },
});
