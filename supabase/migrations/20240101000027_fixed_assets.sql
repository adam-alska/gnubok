-- Migration 27: Fixed Assets Register (Anläggningsregister)
-- Asset categories, assets, depreciation schedules

-- =============================================================================
-- 0. Drop pre-existing tables with incomplete schemas (from earlier remote migrations)
-- =============================================================================
DROP TABLE IF EXISTS public.depreciation_schedule CASCADE;
DROP TABLE IF EXISTS public.assets CASCADE;
DROP TABLE IF EXISTS public.asset_categories CASCADE;

-- =============================================================================
-- 1. asset_categories
-- =============================================================================
create table if not exists public.asset_categories (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid references auth.users on delete cascade not null,
  code                        text not null,
  name                        text not null,
  asset_account               text not null,
  depreciation_account        text not null,
  expense_account             text not null,
  default_useful_life_months  integer,
  default_depreciation_method text default 'straight_line',
  is_system                   boolean default false,
  created_at                  timestamptz not null default now(),

  unique (user_id, code)
);

alter table public.asset_categories enable row level security;

drop policy if exists "asset_categories_select" on public.asset_categories;
create policy "asset_categories_select" on public.asset_categories
  for select using (auth.uid() = user_id);
drop policy if exists "asset_categories_insert" on public.asset_categories;
create policy "asset_categories_insert" on public.asset_categories
  for insert with check (auth.uid() = user_id);
drop policy if exists "asset_categories_update" on public.asset_categories;
create policy "asset_categories_update" on public.asset_categories
  for update using (auth.uid() = user_id);
drop policy if exists "asset_categories_delete" on public.asset_categories;
create policy "asset_categories_delete" on public.asset_categories
  for delete using (auth.uid() = user_id);

create index if not exists idx_asset_categories_user_id on public.asset_categories (user_id);

-- =============================================================================
-- 2. assets
-- =============================================================================
create table if not exists public.assets (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references auth.users on delete cascade not null,
  asset_number            text not null,
  name                    text not null,
  description             text,
  category_id             uuid references public.asset_categories (id) on delete set null,
  acquisition_date        date not null,
  acquisition_cost        numeric not null,
  residual_value          numeric default 0,
  useful_life_months      integer not null,
  depreciation_method     text default 'straight_line'
                            check (depreciation_method in ('straight_line', 'declining_balance', 'units_of_production')),
  declining_balance_rate  numeric,
  status                  text default 'active'
                            check (status in ('active', 'fully_depreciated', 'disposed', 'sold', 'written_off')),
  location                text,
  serial_number           text,
  supplier_name           text,
  warranty_expires        date,
  disposed_at             date,
  disposal_amount         numeric,
  disposal_journal_entry_id uuid references public.journal_entries (id) on delete set null,
  notes                   text,
  cost_center_id          uuid,
  project_id              uuid,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  unique (user_id, asset_number)
);

alter table public.assets enable row level security;

drop policy if exists "assets_select" on public.assets;
create policy "assets_select" on public.assets
  for select using (auth.uid() = user_id);
drop policy if exists "assets_insert" on public.assets;
create policy "assets_insert" on public.assets
  for insert with check (auth.uid() = user_id);
drop policy if exists "assets_update" on public.assets;
create policy "assets_update" on public.assets
  for update using (auth.uid() = user_id);
drop policy if exists "assets_delete" on public.assets;
create policy "assets_delete" on public.assets
  for delete using (auth.uid() = user_id);

create index if not exists idx_assets_user_id on public.assets (user_id);
create index if not exists idx_assets_category_id on public.assets (category_id);
create index if not exists idx_assets_status on public.assets (status);
create index if not exists idx_assets_acquisition_date on public.assets (acquisition_date);

drop trigger if exists assets_updated_at on public.assets;
create trigger assets_updated_at
  before update on public.assets
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 3. depreciation_schedule
-- =============================================================================
create table if not exists public.depreciation_schedule (
  id                        uuid primary key default gen_random_uuid(),
  asset_id                  uuid references public.assets (id) on delete cascade not null,
  period_date               date not null,
  depreciation_amount       numeric not null,
  accumulated_depreciation  numeric not null,
  book_value                numeric not null,
  journal_entry_id          uuid references public.journal_entries (id) on delete set null,
  is_posted                 boolean default false,
  created_at                timestamptz not null default now()
);

alter table public.depreciation_schedule enable row level security;

drop policy if exists "depreciation_schedule_select" on public.depreciation_schedule;
create policy "depreciation_schedule_select" on public.depreciation_schedule
  for select using (
    exists (
      select 1 from public.assets
      where assets.id = depreciation_schedule.asset_id
        and assets.user_id = auth.uid()
    )
  );
drop policy if exists "depreciation_schedule_insert" on public.depreciation_schedule;
create policy "depreciation_schedule_insert" on public.depreciation_schedule
  for insert with check (
    exists (
      select 1 from public.assets
      where assets.id = depreciation_schedule.asset_id
        and assets.user_id = auth.uid()
    )
  );
drop policy if exists "depreciation_schedule_update" on public.depreciation_schedule;
create policy "depreciation_schedule_update" on public.depreciation_schedule
  for update using (
    exists (
      select 1 from public.assets
      where assets.id = depreciation_schedule.asset_id
        and assets.user_id = auth.uid()
    )
  );
drop policy if exists "depreciation_schedule_delete" on public.depreciation_schedule;
create policy "depreciation_schedule_delete" on public.depreciation_schedule
  for delete using (
    exists (
      select 1 from public.assets
      where assets.id = depreciation_schedule.asset_id
        and assets.user_id = auth.uid()
    )
  );

create index if not exists idx_depreciation_schedule_asset_id on public.depreciation_schedule (asset_id);
create index if not exists idx_depreciation_schedule_period_date on public.depreciation_schedule (period_date);
create index if not exists idx_depreciation_schedule_is_posted on public.depreciation_schedule (is_posted);
create unique index if not exists idx_depreciation_schedule_asset_period on public.depreciation_schedule (asset_id, period_date);

-- =============================================================================
-- 4. Function to seed default Swedish asset categories for a user
-- =============================================================================
create or replace function public.seed_asset_categories(p_user_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- Only seed if user has no categories yet
  if exists (select 1 from public.asset_categories where user_id = p_user_id) then
    return;
  end if;

  insert into public.asset_categories (user_id, code, name, asset_account, depreciation_account, expense_account, default_useful_life_months, default_depreciation_method, is_system)
  values
    (p_user_id, 'BYGGNADER',      'Byggnader',                '1110', '1119', '7820', 600, 'straight_line', true),
    (p_user_id, 'MASKINER',       'Maskiner och tekniska anläggningar', '1210', '1219', '7831', 60,  'straight_line', true),
    (p_user_id, 'INVENTARIER',    'Inventarier',              '1220', '1229', '7832', 60,  'straight_line', true),
    (p_user_id, 'FORDON',         'Fordon',                   '1240', '1249', '7834', 60,  'straight_line', true),
    (p_user_id, 'DATORER',        'Datorer och IT-utrustning','1250', '1259', '7833', 36,  'straight_line', true),
    (p_user_id, 'IMMATERIELLA',   'Immateriella tillgångar',  '1010', '1019', '7810', 60,  'straight_line', true);
end;
$$;
