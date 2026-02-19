-- Migration 25: Full Payroll System (Lonehantering)
-- employees, salary_runs, salary_run_items, salary_additions, absence_records, agi_declarations

-- =============================================================================
-- 0. Drop pre-existing tables with incomplete schemas (from earlier remote migrations)
-- =============================================================================
DROP TABLE IF EXISTS public.agi_declarations CASCADE;
DROP TABLE IF EXISTS public.absence_records CASCADE;
DROP TABLE IF EXISTS public.salary_additions CASCADE;
DROP TABLE IF EXISTS public.salary_run_items CASCADE;
DROP TABLE IF EXISTS public.salary_runs CASCADE;
DROP TABLE IF EXISTS public.employees CASCADE;

-- =============================================================================
-- 1. employees (Anstallda)
-- =============================================================================
create table if not exists public.employees (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users on delete cascade not null,
  employee_number       text not null,
  first_name            text not null,
  last_name             text not null,
  personal_number       text, -- personnummer, stored encrypted/masked
  email                 text,
  phone                 text,
  address_line1         text,
  postal_code           text,
  city                  text,
  employment_type       text not null
                          check (employment_type in ('permanent', 'temporary', 'hourly', 'intern')),
  employment_start_date date not null,
  employment_end_date   date,
  department            text,
  title                 text,
  monthly_salary        numeric default 0,
  hourly_rate           numeric default 0,
  tax_table             integer, -- skattetabell
  tax_column            integer, -- kolumn
  tax_municipality      text, -- kommun
  bank_clearing         text,
  bank_account          text,
  vacation_days_total   integer default 25,
  vacation_days_used    integer default 0,
  is_active             boolean default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  unique (user_id, employee_number)
);

alter table public.employees enable row level security;

drop policy if exists "employees_select" on public.employees;
create policy "employees_select" on public.employees
  for select using (auth.uid() = user_id);
drop policy if exists "employees_insert" on public.employees;
create policy "employees_insert" on public.employees
  for insert with check (auth.uid() = user_id);
drop policy if exists "employees_update" on public.employees;
create policy "employees_update" on public.employees
  for update using (auth.uid() = user_id);
drop policy if exists "employees_delete" on public.employees;
create policy "employees_delete" on public.employees
  for delete using (auth.uid() = user_id);

create index if not exists idx_employees_user_id on public.employees (user_id);
create index if not exists idx_employees_active on public.employees (user_id, is_active);
create index if not exists idx_employees_department on public.employees (user_id, department);

drop trigger if exists employees_updated_at on public.employees;
create trigger employees_updated_at
  before update on public.employees
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 2. salary_runs (Lonekornin)
-- =============================================================================
create table if not exists public.salary_runs (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users on delete cascade not null,
  run_name              text not null,
  period_year           integer not null,
  period_month          integer not null check (period_month between 1 and 12),
  payment_date          date not null,
  status                text default 'draft'
                          check (status in ('draft', 'calculated', 'approved', 'paid', 'reported')),
  total_gross           numeric default 0,
  total_net             numeric default 0,
  total_employer_tax    numeric default 0,
  total_preliminary_tax numeric default 0,
  employee_count        integer default 0,
  journal_entry_id      uuid references public.journal_entries (id) on delete set null,
  agi_reported          boolean default false,
  agi_reported_at       timestamptz,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.salary_runs enable row level security;

drop policy if exists "salary_runs_select" on public.salary_runs;
create policy "salary_runs_select" on public.salary_runs
  for select using (auth.uid() = user_id);
drop policy if exists "salary_runs_insert" on public.salary_runs;
create policy "salary_runs_insert" on public.salary_runs
  for insert with check (auth.uid() = user_id);
drop policy if exists "salary_runs_update" on public.salary_runs;
create policy "salary_runs_update" on public.salary_runs
  for update using (auth.uid() = user_id);
drop policy if exists "salary_runs_delete" on public.salary_runs;
create policy "salary_runs_delete" on public.salary_runs
  for delete using (auth.uid() = user_id);

create index if not exists idx_salary_runs_user_id on public.salary_runs (user_id);
create index if not exists idx_salary_runs_period on public.salary_runs (user_id, period_year, period_month);
create index if not exists idx_salary_runs_status on public.salary_runs (status);

drop trigger if exists salary_runs_updated_at on public.salary_runs;
create trigger salary_runs_updated_at
  before update on public.salary_runs
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 3. salary_run_items (Per anstall per lonekornin)
-- =============================================================================
create table if not exists public.salary_run_items (
  id                    uuid primary key default gen_random_uuid(),
  salary_run_id         uuid references public.salary_runs (id) on delete cascade not null,
  employee_id           uuid references public.employees (id) on delete restrict not null,
  gross_salary          numeric default 0,
  net_salary            numeric default 0,
  preliminary_tax       numeric default 0,
  employer_tax          numeric default 0,
  vacation_pay_accrued  numeric default 0,
  salary_type           text default 'monthly'
                          check (salary_type in ('monthly', 'hourly', 'bonus', 'commission', 'vacation_payout')),
  hours_worked          numeric default 0,
  overtime_hours        numeric default 0,
  overtime_rate         numeric default 0,
  deductions            jsonb default '[]'::jsonb,
  additions             jsonb default '[]'::jsonb,
  is_tax_free           boolean default false,
  notes                 text,
  created_at            timestamptz not null default now()
);

alter table public.salary_run_items enable row level security;

drop policy if exists "salary_run_items_select" on public.salary_run_items;
create policy "salary_run_items_select" on public.salary_run_items
  for select using (
    exists (
      select 1 from public.salary_runs
      where salary_runs.id = salary_run_items.salary_run_id
        and salary_runs.user_id = auth.uid()
    )
  );
drop policy if exists "salary_run_items_insert" on public.salary_run_items;
create policy "salary_run_items_insert" on public.salary_run_items
  for insert with check (
    exists (
      select 1 from public.salary_runs
      where salary_runs.id = salary_run_items.salary_run_id
        and salary_runs.user_id = auth.uid()
    )
  );
drop policy if exists "salary_run_items_update" on public.salary_run_items;
create policy "salary_run_items_update" on public.salary_run_items
  for update using (
    exists (
      select 1 from public.salary_runs
      where salary_runs.id = salary_run_items.salary_run_id
        and salary_runs.user_id = auth.uid()
    )
  );
drop policy if exists "salary_run_items_delete" on public.salary_run_items;
create policy "salary_run_items_delete" on public.salary_run_items
  for delete using (
    exists (
      select 1 from public.salary_runs
      where salary_runs.id = salary_run_items.salary_run_id
        and salary_runs.user_id = auth.uid()
    )
  );

create index if not exists idx_salary_run_items_run_id on public.salary_run_items (salary_run_id);
create index if not exists idx_salary_run_items_employee_id on public.salary_run_items (employee_id);

-- =============================================================================
-- 4. salary_additions (Lonetillagg - reusable salary types)
-- =============================================================================
create table if not exists public.salary_additions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users on delete cascade not null,
  code                  text not null,
  name                  text not null,
  type                  text not null
                          check (type in ('addition', 'deduction')),
  default_amount        numeric default 0,
  is_taxable            boolean default true,
  affects_vacation_pay  boolean default true,
  account_number        text, -- BAS account
  is_active             boolean default true,
  created_at            timestamptz not null default now(),

  unique (user_id, code)
);

alter table public.salary_additions enable row level security;

drop policy if exists "salary_additions_select" on public.salary_additions;
create policy "salary_additions_select" on public.salary_additions
  for select using (auth.uid() = user_id);
drop policy if exists "salary_additions_insert" on public.salary_additions;
create policy "salary_additions_insert" on public.salary_additions
  for insert with check (auth.uid() = user_id);
drop policy if exists "salary_additions_update" on public.salary_additions;
create policy "salary_additions_update" on public.salary_additions
  for update using (auth.uid() = user_id);
drop policy if exists "salary_additions_delete" on public.salary_additions;
create policy "salary_additions_delete" on public.salary_additions
  for delete using (auth.uid() = user_id);

create index if not exists idx_salary_additions_user_id on public.salary_additions (user_id);

-- =============================================================================
-- 5. absence_records (Franvaro)
-- =============================================================================
create table if not exists public.absence_records (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users on delete cascade not null,
  employee_id           uuid references public.employees (id) on delete cascade not null,
  absence_type          text not null
                          check (absence_type in ('sick_leave', 'parental_leave', 'vacation', 'child_care', 'unpaid_leave', 'other')),
  start_date            date not null,
  end_date              date not null,
  days_count            numeric not null,
  hours_per_day         numeric default 8,
  deduction_percentage  numeric default 100,
  notes                 text,
  approved              boolean default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.absence_records enable row level security;

drop policy if exists "absence_records_select" on public.absence_records;
create policy "absence_records_select" on public.absence_records
  for select using (auth.uid() = user_id);
drop policy if exists "absence_records_insert" on public.absence_records;
create policy "absence_records_insert" on public.absence_records
  for insert with check (auth.uid() = user_id);
drop policy if exists "absence_records_update" on public.absence_records;
create policy "absence_records_update" on public.absence_records
  for update using (auth.uid() = user_id);
drop policy if exists "absence_records_delete" on public.absence_records;
create policy "absence_records_delete" on public.absence_records
  for delete using (auth.uid() = user_id);

create index if not exists idx_absence_records_user_id on public.absence_records (user_id);
create index if not exists idx_absence_records_employee_id on public.absence_records (employee_id);
create index if not exists idx_absence_records_dates on public.absence_records (start_date, end_date);

drop trigger if exists absence_records_updated_at on public.absence_records;
create trigger absence_records_updated_at
  before update on public.absence_records
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 6. agi_declarations (Arbetsgivardeklaration)
-- =============================================================================
create table if not exists public.agi_declarations (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references auth.users on delete cascade not null,
  period_year             integer not null,
  period_month            integer not null check (period_month between 1 and 12),
  status                  text default 'draft'
                            check (status in ('draft', 'submitted', 'confirmed')),
  total_gross_salaries    numeric default 0,
  total_employer_tax      numeric default 0,
  total_preliminary_tax   numeric default 0,
  total_payable           numeric default 0,
  declaration_data        jsonb default '{}'::jsonb,
  submitted_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  unique (user_id, period_year, period_month)
);

alter table public.agi_declarations enable row level security;

drop policy if exists "agi_declarations_select" on public.agi_declarations;
create policy "agi_declarations_select" on public.agi_declarations
  for select using (auth.uid() = user_id);
drop policy if exists "agi_declarations_insert" on public.agi_declarations;
create policy "agi_declarations_insert" on public.agi_declarations
  for insert with check (auth.uid() = user_id);
drop policy if exists "agi_declarations_update" on public.agi_declarations;
create policy "agi_declarations_update" on public.agi_declarations
  for update using (auth.uid() = user_id);
drop policy if exists "agi_declarations_delete" on public.agi_declarations;
create policy "agi_declarations_delete" on public.agi_declarations
  for delete using (auth.uid() = user_id);

create index if not exists idx_agi_declarations_user_id on public.agi_declarations (user_id);
create index if not exists idx_agi_declarations_period on public.agi_declarations (user_id, period_year, period_month);

drop trigger if exists agi_declarations_updated_at on public.agi_declarations;
create trigger agi_declarations_updated_at
  before update on public.agi_declarations
  for each row execute function public.update_updated_at_column();
