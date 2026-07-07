import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callClaude, parseJsonResponse } from "@/lib/anthropic";
import type { StructuredResult } from "@/types/db";

export const runtime = "nodejs";

const DEAL_STATUSES = ["初回接触", "提案中", "検討中", "受注", "失注"];
const TEMPERATURES = ["高", "中", "低"];

function buildSystemPrompt(mode: string, todayIso: string, existingClients: string[]): string {
  return `あなたは営業担当者の音声メモ（文字起こし）から、営業活動記録を構造化するアシスタントです。
入力は${mode === "meeting" ? "商談・打ち合わせの議事録" : "移動中などに吹き込んだ短い口頭報告"}の文字起こしです。
今日の日付は ${todayIso} です。相対的な日付表現（例:「来週水曜」「明日」）はこの日付を基準に実際の日付(YYYY-MM-DD)に変換してください。

既存クライアント一覧（名称、読み仮名を含む場合あり）: ${
    existingClients.length > 0 ? existingClients.join(", ") : "（登録なし）"
  }

以下のJSONスキーマに厳密に従い、JSONのみを返してください。説明文やコードフェンス（\`\`\`）は一切付けないでください。

{
  "client": "文字起こしから読み取れる企業名。不明な場合はnull",
  "client_match": "既存クライアント一覧の中で読み仮名を含めたファジーマッチで一致する候補名。なければnull",
  "contacts": ["面談相手の氏名・役職など"],
  "summary": "商談内容の要約。2〜3文。雑談や本題と無関係な内容は除外する",
  "deals": [{"name": "案件名", "status": "初回接触|提案中|検討中|受注|失注のいずれか", "amount_note": "金額感（不明なら空文字）"}],
  "next_actions": [{"task": "次にやるべきこと", "due": "YYYY-MM-DD形式の期日。不明ならnull"}],
  "temperature": "高|中|低のいずれか（顧客の温度感・熱量）"
}

案件情報や次アクションが文字起こしから読み取れない場合は空配列を返してください。`;
}

function validate(result: StructuredResult): StructuredResult {
  return {
    client: result.client ?? null,
    client_match: result.client_match ?? null,
    contacts: Array.isArray(result.contacts) ? result.contacts : [],
    summary: result.summary ?? "",
    deals: (Array.isArray(result.deals) ? result.deals : []).map((d) => ({
      name: d.name ?? "",
      status: DEAL_STATUSES.includes(d.status) ? d.status : "初回接触",
      amount_note: d.amount_note ?? "",
    })),
    next_actions: (Array.isArray(result.next_actions) ? result.next_actions : []).map((a) => ({
      task: a.task ?? "",
      due: a.due ?? null,
    })),
    temperature: TEMPERATURES.includes(result.temperature) ? result.temperature : "中",
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { transcript, mode, date, existingClients } = body as {
    transcript: string;
    mode: string;
    date: string;
    existingClients: string[];
  };

  if (!transcript || !transcript.trim()) {
    return NextResponse.json({ error: "transcript は必須です" }, { status: 400 });
  }

  const system = buildSystemPrompt(mode, date, existingClients ?? []);

  try {
    const raw = await callClaude(system, transcript, 1536);
    const parsed = parseJsonResponse<StructuredResult>(raw);
    return NextResponse.json(validate(parsed));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "構造化に失敗しました" },
      { status: 500 }
    );
  }
}
