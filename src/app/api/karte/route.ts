import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/apiAuth";
import { callClaude } from "@/lib/anthropic";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `あなたは営業担当者を支援するアシスタントです。
渡される特定クライアントとの過去の商談記録（日付・要約・面談相手・温度感の一覧）をもとに、
そのクライアントの「カルテ」を日本語で作成してください。

以下の4つの見出しで、簡潔に（各項目2〜4文程度）まとめてください。見出し以外の前置き・後書きは不要です。

## 経緯
これまでの取引・商談の流れ

## キーマン
重要な関係者とその役割・傾向

## 懸念点
リスクや障壁になりそうな点

## 有効だった提案
過去の商談で顧客の反応が良かった提案・アプローチ`;

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { supabase } = auth;

  const { client_id } = (await request.json()) as { client_id: string };
  if (!client_id) {
    return NextResponse.json({ error: "client_id は必須です" }, { status: 400 });
  }

  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", client_id)
    .single();

  if (!client) {
    return NextResponse.json({ error: "クライアントが見つかりません" }, { status: 404 });
  }

  const { data: records } = await supabase
    .from("records")
    .select("record_date, summary, contacts, temperature, transcript")
    .eq("client_id", client_id)
    .order("record_date", { ascending: true });

  if (!records || records.length === 0) {
    return NextResponse.json({ error: "このクライアントの記録がまだありません" }, { status: 400 });
  }

  const history = records
    .map(
      (r) =>
        `[${r.record_date}] 温度感:${r.temperature ?? "-"} 面談相手:${(r.contacts ?? []).join("、") || "-"}\n要約: ${r.summary ?? "-"}`
    )
    .join("\n\n");

  const userMessage = `クライアント名: ${client.name}\n\n過去の商談記録:\n${history}`;

  try {
    const karte = await callClaude(SYSTEM_PROMPT, userMessage, 1536);
    return NextResponse.json({ karte });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "カルテの生成に失敗しました" },
      { status: 500 }
    );
  }
}
