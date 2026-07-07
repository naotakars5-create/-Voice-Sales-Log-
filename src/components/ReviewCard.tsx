"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { findClientMatches, type ClientLike } from "@/lib/fuzzyMatch";
import type {
  DealStatus,
  RecordMode,
  StructuredResult,
  Temperature,
} from "@/types/db";

interface EditableDeal {
  name: string;
  status: DealStatus;
  amount_note: string;
}

interface EditableAction {
  task: string;
  due: string;
}

const DEAL_STATUSES: DealStatus[] = ["初回接触", "提案中", "検討中", "受注", "失注"];
const TEMPERATURES: Temperature[] = ["高", "中", "低"];

export default function ReviewCard({
  mode,
  transcript,
  audioPath,
  initial,
  clients,
  onSaved,
  onDiscard,
}: {
  mode: RecordMode;
  transcript: string;
  audioPath: string | null;
  initial: StructuredResult;
  clients: ClientLike[];
  onSaved: () => void;
  onDiscard: () => void;
}) {
  const router = useRouter();

  const [recordDate, setRecordDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [clientName, setClientName] = useState(
    initial.client_match || initial.client || ""
  );
  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    () => {
      const preset = initial.client_match || initial.client;
      if (!preset) return null;
      const exact = clients.find((c) => c.name === preset);
      return exact ? exact.id : null;
    }
  );
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [contactsText, setContactsText] = useState(initial.contacts.join(", "));
  const [summary, setSummary] = useState(initial.summary);
  const [temperature, setTemperature] = useState<Temperature>(initial.temperature);
  const [deals, setDeals] = useState<EditableDeal[]>(
    initial.deals.map((d) => ({ ...d }))
  );
  const [nextActions, setNextActions] = useState<EditableAction[]>(
    initial.next_actions.map((a) => ({ task: a.task, due: a.due ?? "" }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestions = useMemo(
    () => findClientMatches(clientName, clients).slice(0, 5),
    [clientName, clients]
  );

  const isNewClient =
    clientName.trim().length > 0 &&
    !selectedClientId &&
    !clients.some((c) => c.name === clientName.trim());

  function updateDeal(index: number, patch: Partial<EditableDeal>) {
    setDeals((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...patch } : d))
    );
  }

  function updateAction(index: number, patch: Partial<EditableAction>) {
    setNextActions((prev) =>
      prev.map((a, i) => (i === index ? { ...a, ...patch } : a))
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const supabase = createClient();

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
        clientId = newClient.id;
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
          record_date: recordDate,
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
          dealIds.push(dealRow.id);

          const { error: linkErr } = await supabase.from("record_deals").insert({
            record_id: record.id,
            deal_id: dealRow.id,
          });
          if (linkErr) throw linkErr;
        }
      }

      for (const action of nextActions) {
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

      onSaved();
      router.push("/records");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 p-4 pb-8">
      <h2 className="text-lg font-bold">内容を確認</h2>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">日付</label>
        <input
          type="date"
          value={recordDate}
          onChange={(e) => setRecordDate(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2"
        />
      </div>

      <div className="relative">
        <label className="mb-1 block text-sm font-medium text-neutral-700">クライアント</label>
        <input
          type="text"
          value={clientName}
          onChange={(e) => {
            setClientName(e.target.value);
            setSelectedClientId(null);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder="企業名を入力"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2"
        />
        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full rounded-lg border border-neutral-200 bg-white shadow-lg">
            {suggestions.map(({ client }) => (
              <li key={client.id}>
                <button
                  type="button"
                  onMouseDown={() => {
                    setClientName(client.name);
                    setSelectedClientId(client.id);
                    setShowSuggestions(false);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
                >
                  {client.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {isNewClient && (
          <p className="mt-1 text-xs text-blue-600">
            新規クライアントとして登録されます
          </p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">面談相手</label>
        <input
          type="text"
          value={contactsText}
          onChange={(e) => setContactsText(e.target.value)}
          placeholder="カンマ区切りで入力"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">要約</label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">温度感</label>
        <div className="flex gap-2">
          {TEMPERATURES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTemperature(t)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                temperature === t
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-neutral-300 text-neutral-600"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-sm font-medium text-neutral-700">案件</label>
          <button
            type="button"
            onClick={() =>
              setDeals((prev) => [...prev, { name: "", status: "初回接触", amount_note: "" }])
            }
            className="text-xs text-blue-600"
          >
            + 追加
          </button>
        </div>
        {!hasClientTarget(clientName, isNewClient, selectedClientId) && deals.length > 0 && (
          <p className="mb-2 text-xs text-amber-600">
            クライアントを指定すると案件が保存されます
          </p>
        )}
        <div className="flex flex-col gap-3">
          {deals.map((deal, i) => (
            <div key={i} className="rounded-lg border border-neutral-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <input
                  type="text"
                  value={deal.name}
                  onChange={(e) => updateDeal(i, { name: e.target.value })}
                  placeholder="案件名"
                  className="mr-2 flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setDeals((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-xs text-red-500"
                >
                  削除
                </button>
              </div>
              <div className="flex gap-2">
                <select
                  value={deal.status}
                  onChange={(e) =>
                    updateDeal(i, { status: e.target.value as DealStatus })
                  }
                  className="flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                >
                  {DEAL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={deal.amount_note}
                  onChange={(e) => updateDeal(i, { amount_note: e.target.value })}
                  placeholder="金額感"
                  className="flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-sm font-medium text-neutral-700">次アクション</label>
          <button
            type="button"
            onClick={() => setNextActions((prev) => [...prev, { task: "", due: "" }])}
            className="text-xs text-blue-600"
          >
            + 追加
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {nextActions.map((action, i) => (
            <div key={i} className="rounded-lg border border-neutral-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <input
                  type="text"
                  value={action.task}
                  onChange={(e) => updateAction(i, { task: e.target.value })}
                  placeholder="タスク"
                  className="mr-2 flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() =>
                    setNextActions((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  className="text-xs text-red-500"
                >
                  削除
                </button>
              </div>
              <input
                type="date"
                value={action.due}
                onChange={(e) => updateAction(i, { due: e.target.value })}
                className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      <details className="rounded-lg border border-neutral-200 p-3 text-sm text-neutral-600">
        <summary className="cursor-pointer font-medium">文字起こし全文</summary>
        <p className="mt-2 whitespace-pre-wrap">{transcript}</p>
      </details>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onDiscard}
          disabled={saving}
          className="flex-1 rounded-lg border border-neutral-300 py-3 font-semibold text-neutral-600 disabled:opacity-50"
        >
          やり直す
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-lg bg-blue-600 py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}

function hasClientTarget(
  clientName: string,
  isNewClient: boolean,
  selectedClientId: string | null
): boolean {
  return Boolean(selectedClientId) || (isNewClient && clientName.trim().length > 0);
}
