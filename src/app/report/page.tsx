import { startOfMonth, endOfMonth, format } from "date-fns";
import { requireUser } from "@/lib/auth";
import { fetchReportRows } from "@/lib/report";
import { dealStatusClass } from "@/lib/ui";

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireUser();
  const { from: fromParam, to: toParam } = await searchParams;

  const now = new Date();
  const from = fromParam || format(startOfMonth(now), "yyyy-MM-dd");
  const to = toParam || format(endOfMonth(now), "yyyy-MM-dd");

  const rows = await fetchReportRows(from, to);

  return (
    <div className="p-4 pb-8">
      <h1 className="mb-4 text-lg font-bold">レポート</h1>

      <form className="mb-5 flex items-end gap-2 rounded-lg border border-neutral-200 p-3 text-sm">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-neutral-500">開始日</label>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs text-neutral-500">終了日</label>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-3 py-1.5 font-medium text-white"
        >
          集計
        </button>
      </form>

      <a
        href={`/api/report/csv?from=${from}&to=${to}`}
        className="mb-4 inline-block rounded-lg border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600"
      >
        CSVダウンロード
      </a>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <th className="py-2 pr-3">クライアント</th>
              <th className="py-2 pr-3">案件名</th>
              <th className="py-2 pr-3">ステータス</th>
              <th className="py-2 pr-3">金額感</th>
              <th className="py-2 pr-3">最終接触日</th>
              <th className="py-2 pr-3">次アクション</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-neutral-400">
                  この期間の案件はありません
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.dealId} className="border-b border-neutral-100">
                <td className="py-2 pr-3">{r.clientName}</td>
                <td className="py-2 pr-3">{r.dealName}</td>
                <td className="py-2 pr-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${dealStatusClass(
                      r.status
                    )}`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="py-2 pr-3">{r.amountNote}</td>
                <td className="py-2 pr-3">{r.lastContactDate}</td>
                <td className="py-2 pr-3">{r.nextAction ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
