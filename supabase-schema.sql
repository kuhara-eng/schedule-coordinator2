create table if not exists public.schedule_boards (
  share_id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.schedule_boards enable row level security;

drop policy if exists "schedule_boards_select" on public.schedule_boards;
drop policy if exists "schedule_boards_insert" on public.schedule_boards;
drop policy if exists "schedule_boards_update" on public.schedule_boards;

create policy "schedule_boards_select"
  on public.schedule_boards for select
  to anon
  using (true);

create policy "schedule_boards_insert"
  on public.schedule_boards for insert
  to anon
  with check (true);

create policy "schedule_boards_update"
  on public.schedule_boards for update
  to anon
  using (true)
  with check (true);

-- Supabase Dashboard > Database > Replication で
-- schedule_boards のRealtimeを有効にしてください。
