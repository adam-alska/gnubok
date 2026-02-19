-- Migration 26: Budget, Cost Centers, and Project Accounting
-- Adds cost_centers, projects, budgets, budget_entries tables
-- and extends journal_entry_lines with cost_center_id and project_id

-- =============================================================================
-- 0. Drop pre-existing tables with incomplete schemas (from earlier remote migrations)
-- =============================================================================
DROP TABLE IF EXISTS public.budget_entries CASCADE;
DROP TABLE IF EXISTS public.budgets CASCADE;
DROP TABLE IF EXISTS public.projects CASCADE;
DROP TABLE IF EXISTS public.cost_centers CASCADE;

-- =============================================================================
-- 1. cost_centers
-- =============================================================================
create table if not exists public.cost_centers (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users on delete cascade not null,
  code          text not null,
  name          text not null,
  description   text,
  parent_id     uuid references public.cost_centers (id) on delete set null,
  manager_name  text,
  is_active     boolean default true,
  sort_order    integer default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (user_id, code)
);

alter table public.cost_centers enable row level security;

drop policy if exists "cost_centers_select" on public.cost_centers;
create policy "cost_centers_select" on public.cost_centers
  for select using (auth.uid() = user_id);
drop policy if exists "cost_centers_insert" on public.cost_centers;
create policy "cost_centers_insert" on public.cost_centers
  for insert with check (auth.uid() = user_id);
drop policy if exists "cost_centers_update" on public.cost_centers;
create policy "cost_centers_update" on public.cost_centers
  for update using (auth.uid() = user_id);
drop policy if exists "cost_centers_delete" on public.cost_centers;
create policy "cost_centers_delete" on public.cost_centers
  for delete using (auth.uid() = user_id);

create index if not exists idx_cost_centers_user_id on public.cost_centers (user_id);
create index if not exists idx_cost_centers_parent_id on public.cost_centers (parent_id);
create index if not exists idx_cost_centers_code on public.cost_centers (user_id, code);

drop trigger if exists cost_centers_updated_at on public.cost_centers;
create trigger cost_centers_updated_at
  before update on public.cost_centers
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 2. projects
-- =============================================================================
create table if not exists public.projects (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users on delete cascade not null,
  project_number  text not null,
  name            text not null,
  description     text,
  customer_id     uuid references public.customers (id) on delete set null,
  status          text default 'planning'
                    check (status in ('planning', 'active', 'completed', 'cancelled', 'on_hold')),
  start_date      date,
  end_date        date,
  budget_amount   numeric default 0,
  is_active       boolean default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (user_id, project_number)
);

alter table public.projects enable row level security;

drop policy if exists "projects_select" on public.projects;
create policy "projects_select" on public.projects
  for select using (auth.uid() = user_id);
drop policy if exists "projects_insert" on public.projects;
create policy "projects_insert" on public.projects
  for insert with check (auth.uid() = user_id);
drop policy if exists "projects_update" on public.projects;
create policy "projects_update" on public.projects
  for update using (auth.uid() = user_id);
drop policy if exists "projects_delete" on public.projects;
create policy "projects_delete" on public.projects
  for delete using (auth.uid() = user_id);

create index if not exists idx_projects_user_id on public.projects (user_id);
create index if not exists idx_projects_status on public.projects (status);
create index if not exists idx_projects_customer_id on public.projects (customer_id);
create index if not exists idx_projects_project_number on public.projects (user_id, project_number);

drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 3. Extend journal_entry_lines with cost_center_id and project_id
-- =============================================================================
alter table public.journal_entry_lines
  add column if not exists cost_center_id uuid references public.cost_centers (id) on delete set null;

alter table public.journal_entry_lines
  add column if not exists project_id uuid references public.projects (id) on delete set null;

create index if not exists idx_journal_entry_lines_cost_center on public.journal_entry_lines (cost_center_id);
create index if not exists idx_journal_entry_lines_project on public.journal_entry_lines (project_id);

-- =============================================================================
-- 4. budgets
-- =============================================================================
create table if not exists public.budgets (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users on delete cascade not null,
  name              text not null,
  fiscal_period_id  uuid references public.fiscal_periods (id) on delete restrict not null,
  status            text default 'draft'
                      check (status in ('draft', 'active', 'locked')),
  description       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.budgets enable row level security;

drop policy if exists "budgets_select" on public.budgets;
create policy "budgets_select" on public.budgets
  for select using (auth.uid() = user_id);
drop policy if exists "budgets_insert" on public.budgets;
create policy "budgets_insert" on public.budgets
  for insert with check (auth.uid() = user_id);
drop policy if exists "budgets_update" on public.budgets;
create policy "budgets_update" on public.budgets
  for update using (auth.uid() = user_id);
drop policy if exists "budgets_delete" on public.budgets;
create policy "budgets_delete" on public.budgets
  for delete using (auth.uid() = user_id);

create index if not exists idx_budgets_user_id on public.budgets (user_id);
create index if not exists idx_budgets_fiscal_period on public.budgets (fiscal_period_id);
create index if not exists idx_budgets_status on public.budgets (status);

drop trigger if exists budgets_updated_at on public.budgets;
create trigger budgets_updated_at
  before update on public.budgets
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 5. budget_entries
-- =============================================================================
create table if not exists public.budget_entries (
  id              uuid primary key default gen_random_uuid(),
  budget_id       uuid references public.budgets (id) on delete cascade not null,
  account_number  text not null,
  cost_center_id  uuid references public.cost_centers (id) on delete set null,
  project_id      uuid references public.projects (id) on delete set null,
  month_1         numeric default 0,
  month_2         numeric default 0,
  month_3         numeric default 0,
  month_4         numeric default 0,
  month_5         numeric default 0,
  month_6         numeric default 0,
  month_7         numeric default 0,
  month_8         numeric default 0,
  month_9         numeric default 0,
  month_10        numeric default 0,
  month_11        numeric default 0,
  month_12        numeric default 0,
  annual_total    numeric default 0,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.budget_entries enable row level security;

drop policy if exists "budget_entries_select" on public.budget_entries;
create policy "budget_entries_select" on public.budget_entries
  for select using (
    exists (
      select 1 from public.budgets
      where budgets.id = budget_entries.budget_id
        and budgets.user_id = auth.uid()
    )
  );
drop policy if exists "budget_entries_insert" on public.budget_entries;
create policy "budget_entries_insert" on public.budget_entries
  for insert with check (
    exists (
      select 1 from public.budgets
      where budgets.id = budget_entries.budget_id
        and budgets.user_id = auth.uid()
    )
  );
drop policy if exists "budget_entries_update" on public.budget_entries;
create policy "budget_entries_update" on public.budget_entries
  for update using (
    exists (
      select 1 from public.budgets
      where budgets.id = budget_entries.budget_id
        and budgets.user_id = auth.uid()
    )
  );
drop policy if exists "budget_entries_delete" on public.budget_entries;
create policy "budget_entries_delete" on public.budget_entries
  for delete using (
    exists (
      select 1 from public.budgets
      where budgets.id = budget_entries.budget_id
        and budgets.user_id = auth.uid()
    )
  );

create index if not exists idx_budget_entries_budget_id on public.budget_entries (budget_id);
create index if not exists idx_budget_entries_account on public.budget_entries (account_number);
create index if not exists idx_budget_entries_cost_center on public.budget_entries (cost_center_id);
create index if not exists idx_budget_entries_project on public.budget_entries (project_id);

-- Unique constraint handling nulls for cost_center_id and project_id
create unique index if not exists idx_budget_entries_unique on public.budget_entries (
  budget_id,
  account_number,
  coalesce(cost_center_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

drop trigger if exists budget_entries_updated_at on public.budget_entries;
create trigger budget_entries_updated_at
  before update on public.budget_entries
  for each row execute function public.update_updated_at_column();
