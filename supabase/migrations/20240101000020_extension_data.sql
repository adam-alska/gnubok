-- ============================================================
-- Extension Data & Event Log Tables
-- Part 3: Event Bus & Extension Registry
-- ============================================================

-- Generic key-value store for extensions
create table if not exists extension_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  extension_id text not null,
  key text not null,
  value jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, extension_id, key)
);

-- RLS: users can only access their own extension data
alter table extension_data enable row level security;

create policy "Users can select own extension data"
  on extension_data for select
  using (auth.uid() = user_id);

create policy "Users can insert own extension data"
  on extension_data for insert
  with check (auth.uid() = user_id);

create policy "Users can update own extension data"
  on extension_data for update
  using (auth.uid() = user_id);

create policy "Users can delete own extension data"
  on extension_data for delete
  using (auth.uid() = user_id);

-- Auto-update updated_at
create trigger extension_data_updated_at
  before update on extension_data
  for each row execute function update_updated_at();

-- Append-only event log for observability
create table if not exists event_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  event_type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz default now()
);

-- RLS: users can select and insert only (no update, no delete)
alter table event_log enable row level security;

create policy "Users can select own event log"
  on event_log for select
  using (auth.uid() = user_id);

create policy "Users can insert own event log"
  on event_log for insert
  with check (auth.uid() = user_id);

-- Index for querying by event type
create index if not exists idx_event_log_user_type on event_log (user_id, event_type);
create index if not exists idx_event_log_created_at on event_log (created_at);
