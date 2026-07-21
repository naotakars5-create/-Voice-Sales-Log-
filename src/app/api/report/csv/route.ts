import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/apiAuth";
import { fetchReportRows, toCsv } from "@/lib/report";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "from と to は必須です" }, { status: 400 });
  }

  const rows = await fetchReportRows(supabase, from, to);
  const csv = toCsv(rows);

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="report_${from}_${to}.csv"`,
    },
  });
}
