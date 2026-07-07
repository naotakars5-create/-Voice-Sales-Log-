# Voice Sales Log — 喋るだけ営業記録

営業活動を「書く」のではなく「喋る」だけで記録できるWebアプリのMVPです。

- **議事録モード**: 打ち合わせ中に録音 → 終了後にAIが議事録・案件情報・次アクションを自動抽出
- **クイックモード**: 移動中の30秒口頭報告を同様に構造化
- 記録はクライアント別に蓄積され、商談カルテになる
- 期間指定で案件一覧レポートをCSV出力（部会用）

## 技術スタック

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Supabase (Auth / PostgreSQL / Storage)
- OpenAI Whisper API (`whisper-1`) — 文字起こし
- Anthropic Claude API — 構造化・要約・カルテ生成
- MediaRecorder API — ブラウザ録音（iOS Safari / Android Chrome 両対応）

## セットアップ

### 1. Supabaseプロジェクトの準備

1. [supabase.com](https://supabase.com) でプロジェクトを作成（無料枠でOK）
2. SQL Editor で `supabase/migrations/0001_init.sql` の内容を実行
   - 全テーブル（clients / records / deals / record_deals / next_actions）とRLSポリシー、音声用Storageバケット `audio` が作成されます
3. Authentication → Providers → Email を有効化

### 2. 環境変数

```bash
cp .env.local.example .env.local
```

| 変数 | 取得場所 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 同上（anon public） |
| `SUPABASE_SERVICE_ROLE_KEY` | 同上（service_role・秘匿） |
| `OPENAI_API_KEY` | platform.openai.com（Whisper用） |
| `ANTHROPIC_API_KEY` | console.anthropic.com |

APIキーはすべてサーバー側のみで使用され、クライアントには露出しません。

### 3. 起動

```bash
npm install
npm run dev
```

http://localhost:3000 を開くとログイン画面にリダイレクトされます。

### 4. Vercelへのデプロイ

リポジトリをVercelにインポートし、上記の環境変数を設定するだけです。
`/api/transcribe` は長時間音声を処理するため、`maxDuration = 300` を指定しています（Pro プラン推奨。Hobbyでは60秒制限のため長時間録音は分割送信で対応）。

## 動作確認の手順

1. **認証**: `/login` で新規登録 → 確認メール → ログインできること
2. **録音フロー（核）**: ホームで録音開始 → 停止 → 「文字起こし中…」→「構造化中…」→ 確認カードに要約・案件・次アクション・温度感が表示され、編集して保存できること
   - クライアント名入力時に既存クライアントの候補がドロップダウン表示されること
3. **記録一覧**: `/records` で保存した記録が日付降順で表示され、クライアント・期間で絞り込めること
4. **カルテ**: `/clients/[id]` で商談履歴が時系列表示され、「AIカルテ生成」で経緯・キーマン・懸念点・有効だった提案が表示されること
5. **レポート**: `/report` で期間集計表が表示され、CSVダウンロードできること（Excelで文字化けしないようBOM付きUTF-8）
6. **アクション**: `/actions` で未完了タスクが期日順に表示され、チェックで完了にできること

## 設計上のポイント

- **transcript（生の文字起こし）は必ず保存**: AI抽出が誤っていても原本に戻れます（確認カードの「文字起こし全文」で参照可能）
- **分割録音**: 議事録モードでは4分ごとにセグメント分割し、各セグメントを即座にアップロード＋文字起こし。途中でエラーが起きてもそこまでの音声は失われません
- **RLS**: 全テーブルでRow Level Securityを有効化し、ユーザーは自分のレコードのみ読み書き可能
- **wakeLock**: 録音中の画面ロック抑止をtry-catchで実装（非対応ブラウザでは無視）
- **録音確認トースト**: 初回録音時に「相手に録音の旨を伝えましたか？」を表示（「今後表示しない」可）
