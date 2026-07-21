export type RecordMode = "meeting" | "quick";
export type Temperature = "高" | "中" | "低";
export type DealStatus = "初回接触" | "提案中" | "検討中" | "受注" | "失注";

export interface Client {
  id: string;
  user_id: string;
  name: string;
  name_kana: string | null;
  memo: string | null;
  created_at: string;
}

export interface Record_ {
  id: string;
  user_id: string;
  client_id: string | null;
  record_date: string;
  mode: RecordMode;
  audio_path: string | null;
  transcript: string | null;
  summary: string | null;
  contacts: string[];
  temperature: Temperature | null;
  created_at: string;
}

export interface Deal {
  id: string;
  user_id: string;
  client_id: string;
  name: string;
  status: DealStatus;
  amount_note: string | null;
  updated_at: string;
  created_at: string;
}

export interface RecordDeal {
  record_id: string;
  deal_id: string;
}

export interface NextAction {
  id: string;
  user_id: string;
  record_id: string | null;
  deal_id: string | null;
  task: string;
  due_date: string | null;
  done: boolean;
  created_at: string;
}

export interface StructuredDeal {
  name: string;
  status: DealStatus;
  amount_note: string;
}

export interface StructuredNextAction {
  task: string;
  due: string | null;
}

export interface StructuredResult {
  client: string | null;
  client_match: string | null;
  contacts: string[];
  summary: string;
  deals: StructuredDeal[];
  next_actions: StructuredNextAction[];
  temperature: Temperature;
}
