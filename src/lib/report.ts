import { createClient } from "@/lib/supabase/server";
import type { DealStatus } from "@/types/db";

export interface ReportRow {
  dealId: string;
  clientName: string;
  dealName: string;
  status: DealStatus;
  amountNote: string;
  lastContactDate: string | null;
  nextAction: string | null;
}

interface DealQueryRow {
  id: string;
  name: string;
  status: DealStatus;
  amount_note: string | null;
  updated_at: string;
  clients: { name: string } | null;
  record_deals: { records: { record_date: string } | null }[];
}

export async function fetchReportRows(from: string, to: string): Promise<ReportRow[]> {
  const supabase = await createClient();

  const { data: deals } = await supabase
    .from("deals")
    .select(
      "id, name, status, amount_note, updated_at, clients(name), record_deals(records(record_date))"
    )
    .order("updated_at", { ascending: false });

  const { data: actions } = await supabase
    .from("next_actions")
    .select("deal_id, task, due_date, done")
    .eq("done", false)
    .order("due_date", { ascending: true });

  const actionsByDeal = new Map<string, string>();
  for (const a of actions ?? []) {
    if (!a.deal_id || actionsByDeal.has(a.deal_id)) continue;
    actionsByDeal.set(a.deal_id, a.due_date ? `${a.task}（${a.due_date}）` : a.task);
  }

  const rows: ReportRow[] = [];
  for (const d of (deals ?? []) as unknown as DealQueryRow[]) {
    const contactDates = d.record_deals
      .map((rd) => rd.records?.record_date)
      .filter((v): v is string => Boolean(v))
      .sort();
    const lastContactDate = contactDates.at(-1) ?? d.updated_at.slice(0, 10);

    const inRange = lastContactDate >= from && lastContactDate <= to;
    if (!inRange) continue;

    rows.push({
      dealId: d.id,
      clientName: d.clients?.name ?? "-",
      dealName: d.name,
      status: d.status,
      amountNote: d.amount_note ?? "",
      lastContactDate,
      nextAction: actionsByDeal.get(d.id) ?? null,
    });
  }

  return rows;
}

export function toCsv(rows: ReportRow[]): string {
  const header = ["クライアント", "案件名", "ステータス", "金額感", "最終接触日", "次アクション"];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [header.map(escape).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.clientName,
        r.dealName,
        r.status,
        r.amountNote,
        r.lastContactDate ?? "",
        r.nextAction ?? "",
      ]
        .map(escape)
        .join(",")
    );
  }
  return "﻿" + lines.join("\r\n");
}
