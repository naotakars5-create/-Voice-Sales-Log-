"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface ActionItem {
  id: string;
  task: string;
  due_date: string | null;
  done: boolean;
  deals: { name: string } | null;
  records: { client_id: string | null; clients: { name: string } | null } | null;
}

export default function ActionsList({
  initialActions,
}: {
  initialActions: unknown[];
}) {
  const [actions, setActions] = useState<ActionItem[]>(
    initialActions as ActionItem[]
  );

  async function complete(id: string) {
    setActions((prev) => prev.filter((a) => a.id !== id));
    const supabase = createClient();
    const { error } = await supabase
      .from("next_actions")
      .update({ done: true })
      .eq("id", id);
    if (error) {
      // revert on failure
      setActions((prev) => [...prev, ...(initialActions as ActionItem[]).filter((a) => a.id === id)]);
    }
  }

  if (actions.length === 0) {
    return <p className="py-10 text-center text-sm text-neutral-400">未完了のアクションはありません</p>;
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-2">
      {actions.map((a) => {
        const overdue = a.due_date && a.due_date < today;
        const clientName = a.records?.clients?.name ?? a.deals?.name;
        return (
          <label
            key={a.id}
            className="flex items-start gap-3 rounded-lg border border-neutral-200 p-3"
          >
            <input
              type="checkbox"
              onChange={() => complete(a.id)}
              className="mt-1 h-4 w-4"
            />
            <div className="flex-1">
              <p className="text-sm font-medium">{a.task}</p>
              <div className="mt-1 flex gap-2 text-xs">
                {clientName && <span className="text-neutral-500">{clientName}</span>}
                {a.due_date && (
                  <span className={overdue ? "font-semibold text-red-600" : "text-neutral-400"}>
                    期日: {a.due_date}
                  </span>
                )}
              </div>
            </div>
          </label>
        );
      })}
    </div>
  );
}
