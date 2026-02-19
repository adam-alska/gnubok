-- Migration 23: Bank Reconciliation
-- bank_reconciliation_sessions, bank_reconciliation_items, payment_methods
-- Also adds swish_number to company_settings

-- =============================================================================
-- 0. Drop pre-existing tables with incomplete schemas (from earlier remote migrations)
-- =============================================================================
DROP TABLE IF EXISTS public.bank_reconciliation_items CASCADE;
DROP TABLE IF EXISTS public.bank_reconciliation_sessions CASCADE;
DROP TABLE IF EXISTS public.payment_methods CASCADE;

-- =============================================================================
-- 1. Add swish_number to company_settings (bankgiro and plusgiro already exist)
-- =============================================================================
alter table public.company_settings
  add column if not exists swish_number text;

-- =============================================================================
-- 2. payment_methods (reference table for payment configuration)
-- =============================================================================
create table if not exists public.payment_methods (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users on delete cascade not null,
  method_type         text not null
                        check (method_type in (
                          'bankgiro', 'plusgiro', 'swish', 'bank_transfer', 'cash', 'card'
                        )),
  account_number      text,
  description         text,
  is_default          boolean default false,
  linked_bank_account text,
  is_active           boolean default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.payment_methods enable row level security;

drop policy if exists "payment_methods_select" on public.payment_methods;
create policy "payment_methods_select" on public.payment_methods
  for select using (auth.uid() = user_id);
drop policy if exists "payment_methods_insert" on public.payment_methods;
create policy "payment_methods_insert" on public.payment_methods
  for insert with check (auth.uid() = user_id);
drop policy if exists "payment_methods_update" on public.payment_methods;
create policy "payment_methods_update" on public.payment_methods
  for update using (auth.uid() = user_id);
drop policy if exists "payment_methods_delete" on public.payment_methods;
create policy "payment_methods_delete" on public.payment_methods
  for delete using (auth.uid() = user_id);

create index if not exists idx_payment_methods_user_id on public.payment_methods (user_id);
create index if not exists idx_payment_methods_type on public.payment_methods (user_id, method_type);

drop trigger if exists payment_methods_updated_at on public.payment_methods;
create trigger payment_methods_updated_at
  before update on public.payment_methods
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 3. bank_reconciliation_sessions
-- =============================================================================
create table if not exists public.bank_reconciliation_sessions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users on delete cascade not null,
  bank_connection_id    uuid references public.bank_connections (id) on delete set null,
  account_name          text,
  account_iban          text,
  period_start          date not null,
  period_end            date not null,
  opening_balance       numeric default 0,
  closing_balance       numeric default 0,
  status                text default 'in_progress'
                          check (status in ('in_progress', 'completed', 'cancelled')),
  matched_count         integer default 0,
  unmatched_count       integer default 0,
  total_transactions    integer default 0,
  completed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.bank_reconciliation_sessions enable row level security;

drop policy if exists "bank_reconciliation_sessions_select" on public.bank_reconciliation_sessions;
create policy "bank_reconciliation_sessions_select" on public.bank_reconciliation_sessions
  for select using (auth.uid() = user_id);
drop policy if exists "bank_reconciliation_sessions_insert" on public.bank_reconciliation_sessions;
create policy "bank_reconciliation_sessions_insert" on public.bank_reconciliation_sessions
  for insert with check (auth.uid() = user_id);
drop policy if exists "bank_reconciliation_sessions_update" on public.bank_reconciliation_sessions;
create policy "bank_reconciliation_sessions_update" on public.bank_reconciliation_sessions
  for update using (auth.uid() = user_id);
drop policy if exists "bank_reconciliation_sessions_delete" on public.bank_reconciliation_sessions;
create policy "bank_reconciliation_sessions_delete" on public.bank_reconciliation_sessions
  for delete using (auth.uid() = user_id);

create index if not exists idx_bank_recon_sessions_user_id on public.bank_reconciliation_sessions (user_id);
create index if not exists idx_bank_recon_sessions_status on public.bank_reconciliation_sessions (user_id, status);
create index if not exists idx_bank_recon_sessions_period on public.bank_reconciliation_sessions (period_start, period_end);

drop trigger if exists bank_reconciliation_sessions_updated_at on public.bank_reconciliation_sessions;
create trigger bank_reconciliation_sessions_updated_at
  before update on public.bank_reconciliation_sessions
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 4. bank_reconciliation_items
-- =============================================================================
create table if not exists public.bank_reconciliation_items (
  id                          uuid primary key default gen_random_uuid(),
  session_id                  uuid references public.bank_reconciliation_sessions (id) on delete cascade not null,
  transaction_id              uuid references public.transactions (id) on delete cascade not null,
  match_type                  text default 'unmatched'
                                check (match_type in (
                                  'auto_invoice', 'auto_rule', 'manual', 'split', 'unmatched'
                                )),
  matched_invoice_id          uuid references public.invoices (id) on delete set null,
  matched_supplier_invoice_id uuid,
  journal_entry_id            uuid references public.journal_entries (id) on delete set null,
  confidence_score            numeric default 0,
  is_reconciled               boolean default false,
  reconciled_at               timestamptz,
  notes                       text,
  created_at                  timestamptz not null default now()
);

alter table public.bank_reconciliation_items enable row level security;

drop policy if exists "bank_reconciliation_items_select" on public.bank_reconciliation_items;
create policy "bank_reconciliation_items_select" on public.bank_reconciliation_items
  for select using (
    exists (
      select 1 from public.bank_reconciliation_sessions
      where bank_reconciliation_sessions.id = bank_reconciliation_items.session_id
        and bank_reconciliation_sessions.user_id = auth.uid()
    )
  );
drop policy if exists "bank_reconciliation_items_insert" on public.bank_reconciliation_items;
create policy "bank_reconciliation_items_insert" on public.bank_reconciliation_items
  for insert with check (
    exists (
      select 1 from public.bank_reconciliation_sessions
      where bank_reconciliation_sessions.id = bank_reconciliation_items.session_id
        and bank_reconciliation_sessions.user_id = auth.uid()
    )
  );
drop policy if exists "bank_reconciliation_items_update" on public.bank_reconciliation_items;
create policy "bank_reconciliation_items_update" on public.bank_reconciliation_items
  for update using (
    exists (
      select 1 from public.bank_reconciliation_sessions
      where bank_reconciliation_sessions.id = bank_reconciliation_items.session_id
        and bank_reconciliation_sessions.user_id = auth.uid()
    )
  );
drop policy if exists "bank_reconciliation_items_delete" on public.bank_reconciliation_items;
create policy "bank_reconciliation_items_delete" on public.bank_reconciliation_items
  for delete using (
    exists (
      select 1 from public.bank_reconciliation_sessions
      where bank_reconciliation_sessions.id = bank_reconciliation_items.session_id
        and bank_reconciliation_sessions.user_id = auth.uid()
    )
  );

create index if not exists idx_bank_recon_items_session_id on public.bank_reconciliation_items (session_id);
create index if not exists idx_bank_recon_items_transaction_id on public.bank_reconciliation_items (transaction_id);
create index if not exists idx_bank_recon_items_reconciled on public.bank_reconciliation_items (session_id, is_reconciled);
create index if not exists idx_bank_recon_items_match_type on public.bank_reconciliation_items (session_id, match_type);

-- =============================================================================
-- 5. Helper function: update session counts after item changes
-- =============================================================================
create or replace function public.update_reconciliation_session_counts()
returns trigger as $$
begin
  update public.bank_reconciliation_sessions
  set
    matched_count = (
      select count(*) from public.bank_reconciliation_items
      where session_id = coalesce(new.session_id, old.session_id)
        and is_reconciled = true
    ),
    unmatched_count = (
      select count(*) from public.bank_reconciliation_items
      where session_id = coalesce(new.session_id, old.session_id)
        and is_reconciled = false
    ),
    total_transactions = (
      select count(*) from public.bank_reconciliation_items
      where session_id = coalesce(new.session_id, old.session_id)
    )
  where id = coalesce(new.session_id, old.session_id);

  return coalesce(new, old);
end;
$$ language plpgsql security definer;

drop trigger if exists bank_recon_items_count_update on public.bank_reconciliation_items;
create trigger bank_recon_items_count_update
  after insert or update or delete on public.bank_reconciliation_items
  for each row execute function public.update_reconciliation_session_counts();
