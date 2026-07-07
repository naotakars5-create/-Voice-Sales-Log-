import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { temperatureClass } from "@/lib/ui";

interface RecordRow {
  id: string;
  record_date: string;
  mode: "meeting" | "quick";
  summary: string | null;
  contacts: string[];
  temperature: "高" | "中" | "低" | null;
  clients: { id: string; name: string } | null;
}

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string; from?: string; to?: string }>;
}) {
  await requireUser();
  const supabase = await createClient();
  const { client_id, from, to } = await searchParams;

  let query = supabase
    .from("records")
    .select("id, record_date, mode, summary, contacts, temperature, clients(id, name)")
    .order("record_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (client_id) query = query.eq("client_id", client_id);
  if (from) query = query.gte("record_date", from);
  if (to) query = query.lte("record_date", to);

  const { data: records } = await query;

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .order("name");

  return (
    <div className="p-4 pb-8">
      <h1 className="mb-4 text-lg font-bold">活動記録</h1>

      <form className="mb-5 flex flex-col gap-2 rounded-lg border border-neutral-200 p-3 text-sm">
        <select
          name="client_id"
          defaultValue={client_id ?? ""}
          className="rounded-md border border-neutral-300 px-2 py-1.5"
        >
          <option value="">すべてのクライアント</option>
          {(clients ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            type="date"
            name="from"
            defaultValue={from ?? ""}
            className="flex-1 rounded-md border border-neutral-300 px-2 py-1.5"
          />
          <input
            type="date"
            name="to"
            defaultValue={to ?? ""}
            className="flex-1 rounded-md border border-neutral-300 px-2 py-1.5"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-neutral-900 py-1.5 font-medium text-white"
        >
          絞り込み
        </button>
      </form>

      <div className="flex flex-col gap-3">
        {(records ?? []).length === 0 && (
          <p className="py-10 text-center text-sm text-neutral-400">記録がありません</p>
        )}
        {(records as unknown as RecordRow[] | null ?? []).map((r) => (
          <Link
            key={r.id}
            href={r.clients ? `/clients/${r.clients.id}` : "/records"}
            className="block rounded-lg border border-neutral-200 p-3"
          >
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
            <p className="text-sm font-semibold">
              {r.clients?.name ?? "クライアント未設定"}
              <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-normal text-neutral-500">
                {r.mode === "meeting" ? "議事録" : "クイック"}
              </span>
            </p>
            {r.contacts.length > 0 && (
              <p className="text-xs text-neutral-500">{r.contacts.join(", ")}</p>
            )}
            <p className="mt-1 line-clamp-2 text-sm text-neutral-600">{r.summary}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
