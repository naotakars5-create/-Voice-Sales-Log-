import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ClientsPage() {
  await requireUser();
  const supabase = await createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, memo, created_at")
    .order("name");

  return (
    <div className="p-4 pb-8">
      <h1 className="mb-4 text-lg font-bold">クライアント</h1>

      <div className="flex flex-col gap-2">
        {(clients ?? []).length === 0 && (
          <p className="py-10 text-center text-sm text-neutral-400">
            クライアントがまだ登録されていません
          </p>
        )}
        {(clients ?? []).map((c) => (
          <Link
            key={c.id}
            href={`/clients/${c.id}`}
            className="block rounded-lg border border-neutral-200 p-3"
          >
            <p className="text-sm font-semibold">{c.name}</p>
            {c.memo && <p className="mt-1 text-xs text-neutral-500">{c.memo}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}
