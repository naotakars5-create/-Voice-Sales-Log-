import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import ActionsList from "@/components/ActionsList";

export default async function ActionsPage() {
  await requireUser();
  const supabase = await createClient();

  const { data: actions } = await supabase
    .from("next_actions")
    .select("id, task, due_date, done, deals(name), records(client_id, clients(name))")
    .eq("done", false)
    .order("due_date", { ascending: true, nullsFirst: false });

  return (
    <div className="p-4 pb-8">
      <h1 className="mb-4 text-lg font-bold">次アクション</h1>
      <ActionsList initialActions={actions ?? []} />
    </div>
  );
}
