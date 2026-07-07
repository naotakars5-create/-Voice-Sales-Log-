import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { temperatureClass, dealStatusClass } from "@/lib/ui";
import KarteButton from "@/components/KarteButton";
import type { DealStatus, Temperature } from "@/types/db";

interface DealRow {
  id: string;
  name: string;
  status: DealStatus;
  amount_note: string | null;
  updated_at: string;
}

interface RecordRow {
  id: string;
  record_date: string;
  mode: "meeting" | "quick";
  summary: string | null;
  contacts: string[];
  temperature: Temperature | null;
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();

  const { data: clientRow } = await supabase
    .from("clients")
    .select("id, name, name_kana, memo, created_at")
    .eq("id", id)
    .single();

  if (!clientRow) notFound();

  const { data: deals } = await supabase
    .from("deals")
    .select("id, name, status, amount_note, updated_at")
    .eq("client_id", id)
    .order("updated_at", { ascending: false });

  const { data: records } = await supabase
    .from("records")
    .select("id, record_date, mode, summary, contacts, temperature")
    .eq("client_id", id)
    .order("record_date", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <div className="p-4 pb-8">
      <h1 className="text-lg font-bold">{clientRow.name}</h1>
      {clientRow.memo && <p className="mt-1 text-sm text-neutral-500">{clientRow.memo}</p>}

      <KarteButton clientId={id} clientName={clientRow.name} />

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-neutral-700">案件</h2>
        <div className="flex flex-col gap-2">
          {(deals ?? []).length === 0 && (
            <p className="text-sm text-neutral-400">案件はまだありません</p>
          )}
          {((deals ?? []) as DealRow[]).map((d) => (
            <div key={d.id} className="rounded-lg border border-neutral-200 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{d.name}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${dealStatusClass(
                    d.status
                  )}`}
                >
                  {d.status}
                </span>
              </div>
              {d.amount_note && (
                <p className="mt-1 text-xs text-neutral-500">{d.amount_note}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-neutral-700">商談履歴</h2>
        <div className="flex flex-col gap-3 border-l border-neutral-200 pl-4">
          {((records ?? []) as RecordRow[]).length === 0 && (
            <p className="text-sm text-neutral-400">記録はまだありません</p>
          )}
          {((records ?? []) as RecordRow[]).map((r) => (
            <div key={r.id} className="relative">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-blue-500" />
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-neutral-400">{r.record_date}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${temperatureClass(
                    r.temperature
                  )}`}
                >
                  {r.temperature ?? "-"}
                </span>
              </div>
              {r.contacts.length > 0 && (
                <p className="text-xs text-neutral-500">{r.contacts.join(", ")}</p>
              )}
              <p className="text-sm text-neutral-700">{r.summary}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
