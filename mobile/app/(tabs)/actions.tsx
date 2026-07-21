import { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { supabase } from "../../src/lib/supabase";

interface ActionRow {
  id: string;
  task: string;
  due_date: string | null;
  records: { clients: { name: string } | null } | null;
}

export default function ActionsScreen() {
  const [actions, setActions] = useState<ActionRow[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("next_actions")
      .select("id, task, due_date, records(clients(name))")
      .eq("done", false)
      .order("due_date", { ascending: true, nullsFirst: false });
    setActions((data as unknown as ActionRow[]) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function complete(id: string) {
    setActions((prev) => prev.filter((a) => a.id !== id));
    const { error } = await supabase
      .from("next_actions")
      .update({ done: true })
      .eq("id", id);
    if (error) load();
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <FlatList
      style={styles.list}
      data={actions}
      keyExtractor={(a) => a.id}
      ListEmptyComponent={
        <Text style={styles.empty}>未完了のアクションはありません</Text>
      }
      renderItem={({ item }) => {
        const overdue = item.due_date && item.due_date < today;
        return (
          <View style={styles.card}>
            <TouchableOpacity style={styles.checkbox} onPress={() => complete(item.id)} />
            <View style={styles.body}>
              <Text style={styles.task}>{item.task}</Text>
              <View style={styles.meta}>
                {item.records?.clients?.name && (
                  <Text style={styles.client}>{item.records.clients.name}</Text>
                )}
                {item.due_date && (
                  <Text style={[styles.due, overdue && styles.overdue]}>
                    期日: {item.due_date}
                  </Text>
                )}
              </View>
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: "#fff", padding: 12 },
  empty: { textAlign: "center", color: "#a3a3a3", marginTop: 60, fontSize: 14 },
  card: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: "#a3a3a3",
    borderRadius: 4,
    marginTop: 2,
  },
  body: { flex: 1 },
  task: { fontSize: 14, fontWeight: "500", color: "#171717" },
  meta: { flexDirection: "row", gap: 10, marginTop: 4 },
  client: { fontSize: 12, color: "#737373" },
  due: { fontSize: 12, color: "#a3a3a3" },
  overdue: { color: "#dc2626", fontWeight: "600" },
});
