import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchReportRows, toCsv } from "@/lib/report";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "from と to は必須です" }, { status: 400 });
  }

  const rows = await fetchReportRows(from, to);
  const csv = toCsv(rows);

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="report_${from}_${to}.csv"`,
    },
  });
}
