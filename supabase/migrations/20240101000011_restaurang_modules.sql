-- Migration 11: Restaurang Modules
-- Tables for bordsbokning, menyhantering, receptkalkyl, personalschema,
-- leverantorsbestallning, rapport stod, import stod, bokforing config

-- =============================================================================
-- BORDSBOKNING
-- =============================================================================

-- =============================================================================
-- 1. restaurant_tables
-- =============================================================================
create table public.restaurant_tables (
  id            uuid primary key default extensions.uuid_generate_v4(),
  user_id       uuid not null references auth.users on delete cascade,
  name          text not null,
  capacity      int not null default 4,
  zone          text,
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.restaurant_tables enable row level security;

create policy "restaurant_tables_select" on public.restaurant_tables
  for select using (auth.uid() = user_id);
create policy "restaurant_tables_insert" on public.restaurant_tables
  for insert with check (auth.uid() = user_id);
create policy "restaurant_tables_update" on public.restaurant_tables
  for update using (auth.uid() = user_id);
create policy "restaurant_tables_delete" on public.restaurant_tables
  for delete using (auth.uid() = user_id);

create index restaurant_tables_user_id_idx on public.restaurant_tables (user_id);
create index restaurant_tables_zone_idx on public.restaurant_tables (user_id, zone);

create trigger restaurant_tables_updated_at
  before update on public.restaurant_tables
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 2. reservations
-- =============================================================================
create table public.reservations (
  id            uuid primary key default extensions.uuid_generate_v4(),
  user_id       uuid not null references auth.users on delete cascade,
  table_id      uuid references public.restaurant_tables,
  guest_name    text not null,
  guest_phone   text,
  guest_email   text,
  party_size    int not null default 2,
  date          date not null,
  time_start    time not null,
  time_end      time,
  status        text not null default 'confirmed'
                check (status in ('confirmed','seated','completed','no_show','cancelled')),
  notes         text,
  source        text default 'manual',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.reservations enable row level security;

create policy "reservations_select" on public.reservations
  for select using (auth.uid() = user_id);
create policy "reservations_insert" on public.reservations
  for insert with check (auth.uid() = user_id);
create policy "reservations_update" on public.reservations
  for update using (auth.uid() = user_id);
create policy "reservations_delete" on public.reservations
  for delete using (auth.uid() = user_id);

create index reservations_user_id_idx on public.reservations (user_id);
create index reservations_date_idx on public.reservations (user_id, date);
create index reservations_status_idx on public.reservations (user_id, status);
create index reservations_table_id_idx on public.reservations (table_id);

create trigger reservations_updated_at
  before update on public.reservations
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- MENYHANTERING
-- =============================================================================

-- =============================================================================
-- 3. menus
-- =============================================================================
create table public.menus (
  id            uuid primary key default extensions.uuid_generate_v4(),
  user_id       uuid not null references auth.users on delete cascade,
  name          text not null,
  is_active     boolean not null default false,
  valid_from    date,
  valid_to      date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.menus enable row level security;

create policy "menus_select" on public.menus
  for select using (auth.uid() = user_id);
create policy "menus_insert" on public.menus
  for insert with check (auth.uid() = user_id);
create policy "menus_update" on public.menus
  for update using (auth.uid() = user_id);
create policy "menus_delete" on public.menus
  for delete using (auth.uid() = user_id);

create index menus_user_id_idx on public.menus (user_id);
create index menus_is_active_idx on public.menus (user_id, is_active);

create trigger menus_updated_at
  before update on public.menus
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 4. menu_categories
-- =============================================================================
create table public.menu_categories (
  id            uuid primary key default extensions.uuid_generate_v4(),
  user_id       uuid not null references auth.users on delete cascade,
  menu_id       uuid not null references public.menus on delete cascade,
  name          text not null,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.menu_categories enable row level security;

create policy "menu_categories_select" on public.menu_categories
  for select using (auth.uid() = user_id);
create policy "menu_categories_insert" on public.menu_categories
  for insert with check (auth.uid() = user_id);
create policy "menu_categories_update" on public.menu_categories
  for update using (auth.uid() = user_id);
create policy "menu_categories_delete" on public.menu_categories
  for delete using (auth.uid() = user_id);

create index menu_categories_user_id_idx on public.menu_categories (user_id);
create index menu_categories_menu_id_idx on public.menu_categories (menu_id);

create trigger menu_categories_updated_at
  before update on public.menu_categories
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 5. menu_items
-- =============================================================================
create table public.menu_items (
  id            uuid primary key default extensions.uuid_generate_v4(),
  user_id       uuid not null references auth.users on delete cascade,
  category_id   uuid not null references public.menu_categories on delete cascade,
  name          text not null,
  description   text,
  price         numeric(10,2) not null default 0,
  allergens     text[] not null default '{}',
  is_available  boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.menu_items enable row level security;

create policy "menu_items_select" on public.menu_items
  for select using (auth.uid() = user_id);
create policy "menu_items_insert" on public.menu_items
  for insert with check (auth.uid() = user_id);
create policy "menu_items_update" on public.menu_items
  for update using (auth.uid() = user_id);
create policy "menu_items_delete" on public.menu_items
  for delete using (auth.uid() = user_id);

create index menu_items_user_id_idx on public.menu_items (user_id);
create index menu_items_category_id_idx on public.menu_items (category_id);

create trigger menu_items_updated_at
  before update on public.menu_items
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- RECEPTKALKYL
-- =============================================================================

-- =============================================================================
-- 6. ingredients
-- =============================================================================
create table public.ingredients (
  id              uuid primary key default extensions.uuid_generate_v4(),
  user_id         uuid not null references auth.users on delete cascade,
  name            text not null,
  unit            text not null default 'kg',
  price_per_unit  numeric(10,2) not null default 0,
  category        text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.ingredients enable row level security;

create policy "ingredients_select" on public.ingredients
  for select using (auth.uid() = user_id);
create policy "ingredients_insert" on public.ingredients
  for insert with check (auth.uid() = user_id);
create policy "ingredients_update" on public.ingredients
  for update using (auth.uid() = user_id);
create policy "ingredients_delete" on public.ingredients
  for delete using (auth.uid() = user_id);

create index ingredients_user_id_idx on public.ingredients (user_id);
create index ingredients_category_idx on public.ingredients (user_id, category);

create trigger ingredients_updated_at
  before update on public.ingredients
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 7. recipes
-- =============================================================================
create table public.recipes (
  id              uuid primary key default extensions.uuid_generate_v4(),
  user_id         uuid not null references auth.users on delete cascade,
  name            text not null,
  portions        int not null default 4,
  selling_price   numeric(10,2) not null default 0,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.recipes enable row level security;

create policy "recipes_select" on public.recipes
  for select using (auth.uid() = user_id);
create policy "recipes_insert" on public.recipes
  for insert with check (auth.uid() = user_id);
create policy "recipes_update" on public.recipes
  for update using (auth.uid() = user_id);
create policy "recipes_delete" on public.recipes
  for delete using (auth.uid() = user_id);

create index recipes_user_id_idx on public.recipes (user_id);

create trigger recipes_updated_at
  before update on public.recipes
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 8. recipe_ingredients
-- =============================================================================
create table public.recipe_ingredients (
  id              uuid primary key default extensions.uuid_generate_v4(),
  user_id         uuid not null references auth.users on delete cascade,
  recipe_id       uuid not null references public.recipes on delete cascade,
  ingredient_id   uuid references public.ingredients,
  quantity        numeric(10,3) not null default 0,
  unit            text,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.recipe_ingredients enable row level security;

create policy "recipe_ingredients_select" on public.recipe_ingredients
  for select using (auth.uid() = user_id);
create policy "recipe_ingredients_insert" on public.recipe_ingredients
  for insert with check (auth.uid() = user_id);
create policy "recipe_ingredients_update" on public.recipe_ingredients
  for update using (auth.uid() = user_id);
create policy "recipe_ingredients_delete" on public.recipe_ingredients
  for delete using (auth.uid() = user_id);

create index recipe_ingredients_user_id_idx on public.recipe_ingredients (user_id);
create index recipe_ingredients_recipe_id_idx on public.recipe_ingredients (recipe_id);
create index recipe_ingredients_ingredient_id_idx on public.recipe_ingredients (ingredient_id);

create trigger recipe_ingredients_updated_at
  before update on public.recipe_ingredients
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- PERSONALSCHEMA
-- =============================================================================

-- =============================================================================
-- 9. staff_members
-- =============================================================================
create table public.staff_members (
  id            uuid primary key default extensions.uuid_generate_v4(),
  user_id       uuid not null references auth.users on delete cascade,
  name          text not null,
  email         text,
  phone         text,
  role          text not null default 'kock',
  hourly_rate   numeric(10,2) not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.staff_members enable row level security;

create policy "staff_members_select" on public.staff_members
  for select using (auth.uid() = user_id);
create policy "staff_members_insert" on public.staff_members
  for insert with check (auth.uid() = user_id);
create policy "staff_members_update" on public.staff_members
  for update using (auth.uid() = user_id);
create policy "staff_members_delete" on public.staff_members
  for delete using (auth.uid() = user_id);

create index staff_members_user_id_idx on public.staff_members (user_id);
create index staff_members_role_idx on public.staff_members (user_id, role);

create trigger staff_members_updated_at
  before update on public.staff_members
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 10. shifts
-- =============================================================================
create table public.shifts (
  id              uuid primary key default extensions.uuid_generate_v4(),
  user_id         uuid not null references auth.users on delete cascade,
  staff_member_id uuid not null references public.staff_members on delete cascade,
  date            date not null,
  time_start      time not null,
  time_end        time not null,
  role            text,
  status          text not null default 'scheduled'
                  check (status in ('scheduled','confirmed','completed','cancelled')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.shifts enable row level security;

create policy "shifts_select" on public.shifts
  for select using (auth.uid() = user_id);
create policy "shifts_insert" on public.shifts
  for insert with check (auth.uid() = user_id);
create policy "shifts_update" on public.shifts
  for update using (auth.uid() = user_id);
create policy "shifts_delete" on public.shifts
  for delete using (auth.uid() = user_id);

create index shifts_user_id_idx on public.shifts (user_id);
create index shifts_date_idx on public.shifts (user_id, date);
create index shifts_staff_member_id_idx on public.shifts (staff_member_id);
create index shifts_status_idx on public.shifts (user_id, status);

create trigger shifts_updated_at
  before update on public.shifts
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- LEVERANTORSBESTALLNING
-- =============================================================================

-- =============================================================================
-- 11. suppliers
-- =============================================================================
create table public.suppliers (
  id              uuid primary key default extensions.uuid_generate_v4(),
  user_id         uuid not null references auth.users on delete cascade,
  name            text not null,
  contact_email   text,
  contact_phone   text,
  delivery_days   text[] not null default '{}',
  min_order       numeric(10,2),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.suppliers enable row level security;

create policy "suppliers_select" on public.suppliers
  for select using (auth.uid() = user_id);
create policy "suppliers_insert" on public.suppliers
  for insert with check (auth.uid() = user_id);
create policy "suppliers_update" on public.suppliers
  for update using (auth.uid() = user_id);
create policy "suppliers_delete" on public.suppliers
  for delete using (auth.uid() = user_id);

create index suppliers_user_id_idx on public.suppliers (user_id);

create trigger suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 12. supplier_orders
-- =============================================================================
create table public.supplier_orders (
  id              uuid primary key default extensions.uuid_generate_v4(),
  user_id         uuid not null references auth.users on delete cascade,
  supplier_id     uuid references public.suppliers,
  order_date      date not null default current_date,
  delivery_date   date,
  status          text not null default 'draft'
                  check (status in ('draft','sent','confirmed','delivered','cancelled')),
  total_amount    numeric(12,2) not null default 0,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.supplier_orders enable row level security;

create policy "supplier_orders_select" on public.supplier_orders
  for select using (auth.uid() = user_id);
create policy "supplier_orders_insert" on public.supplier_orders
  for insert with check (auth.uid() = user_id);
create policy "supplier_orders_update" on public.supplier_orders
  for update using (auth.uid() = user_id);
create policy "supplier_orders_delete" on public.supplier_orders
  for delete using (auth.uid() = user_id);

create index supplier_orders_user_id_idx on public.supplier_orders (user_id);
create index supplier_orders_supplier_id_idx on public.supplier_orders (supplier_id);
create index supplier_orders_status_idx on public.supplier_orders (user_id, status);
create index supplier_orders_order_date_idx on public.supplier_orders (user_id, order_date);

create trigger supplier_orders_updated_at
  before update on public.supplier_orders
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 13. supplier_order_items
-- =============================================================================
create table public.supplier_order_items (
  id              uuid primary key default extensions.uuid_generate_v4(),
  user_id         uuid not null references auth.users on delete cascade,
  order_id        uuid not null references public.supplier_orders on delete cascade,
  ingredient_id   uuid references public.ingredients,
  description     text,
  quantity        numeric(10,3) not null default 0,
  unit            text,
  unit_price      numeric(10,2) not null default 0,
  line_total      numeric(12,2) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.supplier_order_items enable row level security;

create policy "supplier_order_items_select" on public.supplier_order_items
  for select using (auth.uid() = user_id);
create policy "supplier_order_items_insert" on public.supplier_order_items
  for insert with check (auth.uid() = user_id);
create policy "supplier_order_items_update" on public.supplier_order_items
  for update using (auth.uid() = user_id);
create policy "supplier_order_items_delete" on public.supplier_order_items
  for delete using (auth.uid() = user_id);

create index supplier_order_items_user_id_idx on public.supplier_order_items (user_id);
create index supplier_order_items_order_id_idx on public.supplier_order_items (order_id);
create index supplier_order_items_ingredient_id_idx on public.supplier_order_items (ingredient_id);

create trigger supplier_order_items_updated_at
  before update on public.supplier_order_items
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- RAPPORT STOD
-- =============================================================================

-- =============================================================================
-- 14. waste_entries
-- =============================================================================
create table public.waste_entries (
  id              uuid primary key default extensions.uuid_generate_v4(),
  user_id         uuid not null references auth.users on delete cascade,
  date            date not null default current_date,
  item_name       text not null,
  category        text,
  quantity        numeric(10,3),
  unit            text,
  estimated_cost  numeric(10,2) not null default 0,
  reason          text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.waste_entries enable row level security;

create policy "waste_entries_select" on public.waste_entries
  for select using (auth.uid() = user_id);
create policy "waste_entries_insert" on public.waste_entries
  for insert with check (auth.uid() = user_id);
create policy "waste_entries_update" on public.waste_entries
  for update using (auth.uid() = user_id);
create policy "waste_entries_delete" on public.waste_entries
  for delete using (auth.uid() = user_id);

create index waste_entries_user_id_idx on public.waste_entries (user_id);
create index waste_entries_date_idx on public.waste_entries (user_id, date);
create index waste_entries_category_idx on public.waste_entries (user_id, category);

create trigger waste_entries_updated_at
  before update on public.waste_entries
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 15. module_kpi_targets
-- =============================================================================
create table public.module_kpi_targets (
  id              uuid primary key default extensions.uuid_generate_v4(),
  user_id         uuid not null references auth.users on delete cascade,
  sector_slug     text not null,
  module_slug     text not null,
  kpi_key         text not null,
  target_value    numeric(12,2) not null,
  period_type     text not null default 'month',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint module_kpi_targets_unique unique (user_id, sector_slug, module_slug, kpi_key)
);

alter table public.module_kpi_targets enable row level security;

create policy "module_kpi_targets_select" on public.module_kpi_targets
  for select using (auth.uid() = user_id);
create policy "module_kpi_targets_insert" on public.module_kpi_targets
  for insert with check (auth.uid() = user_id);
create policy "module_kpi_targets_update" on public.module_kpi_targets
  for update using (auth.uid() = user_id);
create policy "module_kpi_targets_delete" on public.module_kpi_targets
  for delete using (auth.uid() = user_id);

create index module_kpi_targets_user_id_idx on public.module_kpi_targets (user_id);
create index module_kpi_targets_sector_module_idx on public.module_kpi_targets (user_id, sector_slug, module_slug);

create trigger module_kpi_targets_updated_at
  before update on public.module_kpi_targets
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 16. restaurant_capacity
-- =============================================================================
create table public.restaurant_capacity (
  id              uuid primary key default extensions.uuid_generate_v4(),
  user_id         uuid not null references auth.users on delete cascade,
  total_seats     int not null default 40,
  service_hours   jsonb not null default '{"lunch_start":"11:00","lunch_end":"14:00","dinner_start":"17:00","dinner_end":"22:00"}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint restaurant_capacity_user_unique unique (user_id)
);

alter table public.restaurant_capacity enable row level security;

create policy "restaurant_capacity_select" on public.restaurant_capacity
  for select using (auth.uid() = user_id);
create policy "restaurant_capacity_insert" on public.restaurant_capacity
  for insert with check (auth.uid() = user_id);
create policy "restaurant_capacity_update" on public.restaurant_capacity
  for update using (auth.uid() = user_id);
create policy "restaurant_capacity_delete" on public.restaurant_capacity
  for delete using (auth.uid() = user_id);

create index restaurant_capacity_user_id_idx on public.restaurant_capacity (user_id);

create trigger restaurant_capacity_updated_at
  before update on public.restaurant_capacity
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- IMPORT STOD
-- =============================================================================

-- =============================================================================
-- 17. module_imports
-- =============================================================================
create table public.module_imports (
  id              uuid primary key default extensions.uuid_generate_v4(),
  user_id         uuid not null references auth.users on delete cascade,
  sector_slug     text not null,
  module_slug     text not null,
  filename        text not null,
  status          text not null default 'pending'
                  check (status in ('pending','processing','completed','failed')),
  rows_imported   int default 0,
  error_message   text,
  import_data     jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.module_imports enable row level security;

create policy "module_imports_select" on public.module_imports
  for select using (auth.uid() = user_id);
create policy "module_imports_insert" on public.module_imports
  for insert with check (auth.uid() = user_id);
create policy "module_imports_update" on public.module_imports
  for update using (auth.uid() = user_id);
create policy "module_imports_delete" on public.module_imports
  for delete using (auth.uid() = user_id);

create index module_imports_user_id_idx on public.module_imports (user_id);
create index module_imports_sector_module_idx on public.module_imports (user_id, sector_slug, module_slug);
create index module_imports_status_idx on public.module_imports (user_id, status);

create trigger module_imports_updated_at
  before update on public.module_imports
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- BOKFORING CONFIG
-- =============================================================================

-- =============================================================================
-- 18. module_configs
-- =============================================================================
create table public.module_configs (
  id              uuid primary key default extensions.uuid_generate_v4(),
  user_id         uuid not null references auth.users on delete cascade,
  sector_slug     text not null,
  module_slug     text not null,
  config_key      text not null,
  config_value    jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint module_configs_unique unique (user_id, sector_slug, module_slug, config_key)
);

alter table public.module_configs enable row level security;

create policy "module_configs_select" on public.module_configs
  for select using (auth.uid() = user_id);
create policy "module_configs_insert" on public.module_configs
  for insert with check (auth.uid() = user_id);
create policy "module_configs_update" on public.module_configs
  for update using (auth.uid() = user_id);
create policy "module_configs_delete" on public.module_configs
  for delete using (auth.uid() = user_id);

create index module_configs_user_id_idx on public.module_configs (user_id);
create index module_configs_sector_module_idx on public.module_configs (user_id, sector_slug, module_slug);

create trigger module_configs_updated_at
  before update on public.module_configs
  for each row execute function public.update_updated_at_column();
