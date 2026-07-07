"use client";

import { useState } from "react";

export default function KarteButton({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [karte, setKarte] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/karte", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_id: clientId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "カルテの生成に失敗しました");
      }
      const data = await res.json();
      setKarte(data.karte as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "カルテの生成に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={generate}
        disabled={loading}
        className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {loading ? "生成中..." : `AIカルテ生成（${clientName}）`}
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {karte && (
        <div className="mt-3 whitespace-pre-wrap rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
          {karte}
        </div>
      )}
    </div>
  );
}
