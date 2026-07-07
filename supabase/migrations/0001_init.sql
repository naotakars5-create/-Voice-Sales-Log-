-- Voice Sales Log: initial schema
-- All tables are scoped to auth.uid() via RLS so each user only sees their own data.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  name_kana text,
  memo text,
  created_at timestamptz not null default now()
);

create index if not exists clients_user_id_idx on public.clients(user_id);

alter table public.clients enable row level security;

create policy "clients_select_own" on public.clients
  for select using (auth.uid() = user_id);
create policy "clients_insert_own" on public.clients
  for insert with check (auth.uid() = user_id);
create policy "clients_update_own" on public.clients
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "clients_delete_own" on public.clients
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- records (activity logs, one per recording)
-- ---------------------------------------------------------------------------
create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  record_date date not null default current_date,
  mode text not null check (mode in ('meeting', 'quick')),
  audio_path text,
  transcript text,
  summary text,
  contacts text[] not null default '{}',
  temperature text check (temperature in ('高', '中', '低')),
  created_at timestamptz not null default now()
);

create index if not exists records_user_id_idx on public.records(user_id);
create index if not exists records_client_id_idx on public.records(client_id);
create index if not exists records_record_date_idx on public.records(record_date);

alter table public.records enable row level security;

create policy "records_select_own" on public.records
  for select using (auth.uid() = user_id);
create policy "records_insert_own" on public.records
  for insert with check (auth.uid() = user_id);
create policy "records_update_own" on public.records
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "records_delete_own" on public.records
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- deals
-- ---------------------------------------------------------------------------
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  status text not null check (status in ('初回接触', '提案中', '検討中', '受注', '失注')) default '初回接触',
  amount_note text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists deals_user_id_idx on public.deals(user_id);
create index if not exists deals_client_id_idx on public.deals(client_id);

alter table public.deals enable row level security;

create policy "deals_select_own" on public.deals
  for select using (auth.uid() = user_id);
create policy "deals_insert_own" on public.deals
  for insert with check (auth.uid() = user_id);
create policy "deals_update_own" on public.deals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "deals_delete_own" on public.deals
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- record_deals (join table)
-- ---------------------------------------------------------------------------
create table if not exists public.record_deals (
  record_id uuid not null references public.records(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  primary key (record_id, deal_id)
);

alter table public.record_deals enable row level security;

-- record_deals has no user_id column; scope through the parent record/deal ownership.
create policy "record_deals_select_own" on public.record_deals
  for select using (
    exists (select 1 from public.records r where r.id = record_id and r.user_id = auth.uid())
  );
create policy "record_deals_insert_own" on public.record_deals
  for insert with check (
    exists (select 1 from public.records r where r.id = record_id and r.user_id = auth.uid())
    and exists (select 1 from public.deals d where d.id = deal_id and d.user_id = auth.uid())
  );
create policy "record_deals_delete_own" on public.record_deals
  for delete using (
    exists (select 1 from public.records r where r.id = record_id and r.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- next_actions
-- ---------------------------------------------------------------------------
create table if not exists public.next_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_id uuid references public.records(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  task text not null,
  due_date date,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists next_actions_user_id_idx on public.next_actions(user_id);
create index if not exists next_actions_due_date_idx on public.next_actions(due_date);

alter table public.next_actions enable row level security;

create policy "next_actions_select_own" on public.next_actions
  for select using (auth.uid() = user_id);
create policy "next_actions_insert_own" on public.next_actions
  for insert with check (auth.uid() = user_id);
create policy "next_actions_update_own" on public.next_actions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "next_actions_delete_own" on public.next_actions
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Storage bucket for recorded audio
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('audio', 'audio', false)
on conflict (id) do nothing;

create policy "audio_select_own" on storage.objects
  for select using (bucket_id = 'audio' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "audio_insert_own" on storage.objects
  for insert with check (bucket_id = 'audio' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "audio_delete_own" on storage.objects
  for delete using (bucket_id = 'audio' and auth.uid()::text = (storage.foldername(name))[1]);
