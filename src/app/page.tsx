import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import Recorder from "@/components/Recorder";

export default async function HomePage() {
  await requireUser();
  const supabase = await createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, name_kana")
    .order("name");

  const todayIso = new Date().toISOString().slice(0, 10);

  return <Recorder clients={clients ?? []} todayIso={todayIso} />;
}
