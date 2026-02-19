-- Migration 24: Year-End Closing & Annual Report (Bokslut & Arsredovisning)
-- Tables for managing the year-end closing process and generating annual reports

-- =============================================================================
-- 0. Drop pre-existing tables with incomplete schemas (from earlier remote migrations)
-- =============================================================================
DROP TABLE IF EXISTS public.annual_reports CASCADE;
DROP TABLE IF EXISTS public.year_end_closings CASCADE;

-- =============================================================================
-- 1. year_end_closings
-- =============================================================================
create table if not exists public.year_end_closings (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid references auth.users on delete cascade not null,
  fiscal_period_id          uuid references public.fiscal_periods (id) on delete restrict not null unique,
  status                    text not null default 'not_started'
                              check (status in (
                                'not_started', 'checklist', 'adjustments',
                                'review', 'closing', 'completed'
                              )),
  started_at                timestamptz,
  completed_at              timestamptz,
  closing_journal_entry_id  uuid references public.journal_entries (id) on delete set null,
  opening_balance_entry_id  uuid references public.journal_entries (id) on delete set null,
  net_result                numeric,
  result_account            text default '2099',
  notes                     text,
  checklist_data            jsonb default '{"items": []}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

alter table public.year_end_closings enable row level security;

drop policy if exists "year_end_closings_select" on public.year_end_closings;
create policy "year_end_closings_select" on public.year_end_closings
  for select using (auth.uid() = user_id);
drop policy if exists "year_end_closings_insert" on public.year_end_closings;
create policy "year_end_closings_insert" on public.year_end_closings
  for insert with check (auth.uid() = user_id);
drop policy if exists "year_end_closings_update" on public.year_end_closings;
create policy "year_end_closings_update" on public.year_end_closings
  for update using (auth.uid() = user_id);
drop policy if exists "year_end_closings_delete" on public.year_end_closings;
create policy "year_end_closings_delete" on public.year_end_closings
  for delete using (auth.uid() = user_id);

create index if not exists idx_year_end_closings_user_id on public.year_end_closings (user_id);
create index if not exists idx_year_end_closings_fiscal_period on public.year_end_closings (fiscal_period_id);
create index if not exists idx_year_end_closings_status on public.year_end_closings (status);

drop trigger if exists year_end_closings_updated_at on public.year_end_closings;
create trigger year_end_closings_updated_at
  before update on public.year_end_closings
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 2. annual_reports (arsredovisning)
-- =============================================================================
create table if not exists public.annual_reports (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users on delete cascade not null,
  fiscal_period_id      uuid references public.fiscal_periods (id) on delete restrict not null,
  year_end_closing_id   uuid references public.year_end_closings (id) on delete restrict not null,
  entity_type           text not null
                          check (entity_type in ('enskild_firma', 'aktiebolag')),
  status                text not null default 'draft'
                          check (status in ('draft', 'review', 'approved', 'filed')),
  report_data           jsonb default '{}'::jsonb,
  income_statement      jsonb,
  balance_sheet         jsonb,
  notes_data            jsonb default '[]'::jsonb,
  management_report     text,
  board_members         jsonb default '[]'::jsonb,
  auditor_info          jsonb,
  signed_at             timestamptz,
  filed_at              timestamptz,
  filing_reference      text,
  pdf_url               text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.annual_reports enable row level security;

drop policy if exists "annual_reports_select" on public.annual_reports;
create policy "annual_reports_select" on public.annual_reports
  for select using (auth.uid() = user_id);
drop policy if exists "annual_reports_insert" on public.annual_reports;
create policy "annual_reports_insert" on public.annual_reports
  for insert with check (auth.uid() = user_id);
drop policy if exists "annual_reports_update" on public.annual_reports;
create policy "annual_reports_update" on public.annual_reports
  for update using (auth.uid() = user_id);
drop policy if exists "annual_reports_delete" on public.annual_reports;
create policy "annual_reports_delete" on public.annual_reports
  for delete using (auth.uid() = user_id);

create index if not exists idx_annual_reports_user_id on public.annual_reports (user_id);
create index if not exists idx_annual_reports_fiscal_period on public.annual_reports (fiscal_period_id);
create index if not exists idx_annual_reports_year_end_closing on public.annual_reports (year_end_closing_id);
create index if not exists idx_annual_reports_status on public.annual_reports (status);

drop trigger if exists annual_reports_updated_at on public.annual_reports;
create trigger annual_reports_updated_at
  before update on public.annual_reports
  for each row execute function public.update_updated_at_column();
