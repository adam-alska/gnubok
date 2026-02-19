-- Migration 22: Invoice Enhancements
-- OCR numbers, recurring invoices, quotes, and orders

-- =============================================================================
-- 0. Drop pre-existing tables with incomplete schemas (from earlier remote migrations)
-- =============================================================================
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.quote_items CASCADE;
DROP TABLE IF EXISTS public.quotes CASCADE;
DROP TABLE IF EXISTS public.recurring_invoices CASCADE;

-- =============================================================================
-- 1. Add new columns to invoices table
-- =============================================================================
alter table public.invoices
  add column if not exists ocr_number text,
  add column if not exists bankgiro_number text,
  add column if not exists plusgiro_number text,
  add column if not exists payment_type text
    check (payment_type in ('bankgiro', 'plusgiro', 'bank_transfer', 'swish')),
  add column if not exists is_recurring boolean default false,
  add column if not exists recurring_invoice_id uuid;

-- =============================================================================
-- 2. recurring_invoices table
-- =============================================================================
create table if not exists public.recurring_invoices (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references auth.users on delete cascade not null,
  customer_id          uuid references public.customers (id) on delete set null,

  template_name        text not null,
  description          text,

  frequency            text not null
                         check (frequency in ('weekly', 'monthly', 'quarterly', 'semi_annually', 'annually')),
  interval_count       integer not null default 1,

  start_date           date not null,
  end_date             date,
  next_invoice_date    date not null,
  last_generated_date  date,

  is_active            boolean not null default true,

  items                jsonb not null default '[]'::jsonb,

  vat_treatment        text,
  vat_rate             numeric,
  currency             text not null default 'SEK',

  your_reference       text,
  our_reference        text,
  notes                text,

  payment_terms_days   integer not null default 30,
  generated_count      integer not null default 0,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.recurring_invoices enable row level security;

drop policy if exists "recurring_invoices_select" on public.recurring_invoices;
create policy "recurring_invoices_select" on public.recurring_invoices
  for select using (auth.uid() = user_id);
drop policy if exists "recurring_invoices_insert" on public.recurring_invoices;
create policy "recurring_invoices_insert" on public.recurring_invoices
  for insert with check (auth.uid() = user_id);
drop policy if exists "recurring_invoices_update" on public.recurring_invoices;
create policy "recurring_invoices_update" on public.recurring_invoices
  for update using (auth.uid() = user_id);
drop policy if exists "recurring_invoices_delete" on public.recurring_invoices;
create policy "recurring_invoices_delete" on public.recurring_invoices
  for delete using (auth.uid() = user_id);

create index if not exists idx_recurring_invoices_user_id on public.recurring_invoices (user_id);
create index if not exists idx_recurring_invoices_next_date on public.recurring_invoices (next_invoice_date);
create index if not exists idx_recurring_invoices_active on public.recurring_invoices (is_active);

drop trigger if exists recurring_invoices_updated_at on public.recurring_invoices;
create trigger recurring_invoices_updated_at
  before update on public.recurring_invoices
  for each row execute function public.update_updated_at_column();

-- Add FK from invoices to recurring_invoices
DO $$ BEGIN
  alter table public.invoices
    add constraint fk_invoices_recurring_invoice
    foreign key (recurring_invoice_id) references public.recurring_invoices (id) on delete set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- 3. quotes table
-- =============================================================================
create table if not exists public.quotes (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references auth.users on delete cascade not null,
  customer_id             uuid references public.customers (id) on delete set null,

  quote_number            text not null,
  quote_date              date not null,
  valid_until             date not null,

  status                  text not null default 'draft'
                            check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted')),

  currency                text not null default 'SEK',
  exchange_rate           numeric,

  subtotal                numeric not null default 0,
  vat_amount              numeric not null default 0,
  total                   numeric not null default 0,

  vat_treatment           text,
  vat_rate                numeric,

  your_reference          text,
  our_reference           text,
  notes                   text,

  converted_to_order_id   uuid,
  converted_to_invoice_id uuid,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  unique (user_id, quote_number)
);

alter table public.quotes enable row level security;

drop policy if exists "quotes_select" on public.quotes;
create policy "quotes_select" on public.quotes
  for select using (auth.uid() = user_id);
drop policy if exists "quotes_insert" on public.quotes;
create policy "quotes_insert" on public.quotes
  for insert with check (auth.uid() = user_id);
drop policy if exists "quotes_update" on public.quotes;
create policy "quotes_update" on public.quotes
  for update using (auth.uid() = user_id);
drop policy if exists "quotes_delete" on public.quotes;
create policy "quotes_delete" on public.quotes
  for delete using (auth.uid() = user_id);

create index if not exists idx_quotes_user_id on public.quotes (user_id);
create index if not exists idx_quotes_status on public.quotes (status);
create index if not exists idx_quotes_customer_id on public.quotes (customer_id);

drop trigger if exists quotes_updated_at on public.quotes;
create trigger quotes_updated_at
  before update on public.quotes
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 4. quote_items table
-- =============================================================================
create table if not exists public.quote_items (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid references public.quotes (id) on delete cascade not null,
  sort_order  integer default 0,
  description text not null,
  quantity    numeric default 1,
  unit        text default 'st',
  unit_price  numeric default 0,
  line_total  numeric default 0,
  created_at  timestamptz not null default now()
);

alter table public.quote_items enable row level security;

drop policy if exists "quote_items_select" on public.quote_items;
create policy "quote_items_select" on public.quote_items
  for select using (
    exists (
      select 1 from public.quotes
      where quotes.id = quote_items.quote_id
        and quotes.user_id = auth.uid()
    )
  );
drop policy if exists "quote_items_insert" on public.quote_items;
create policy "quote_items_insert" on public.quote_items
  for insert with check (
    exists (
      select 1 from public.quotes
      where quotes.id = quote_items.quote_id
        and quotes.user_id = auth.uid()
    )
  );
drop policy if exists "quote_items_update" on public.quote_items;
create policy "quote_items_update" on public.quote_items
  for update using (
    exists (
      select 1 from public.quotes
      where quotes.id = quote_items.quote_id
        and quotes.user_id = auth.uid()
    )
  );
drop policy if exists "quote_items_delete" on public.quote_items;
create policy "quote_items_delete" on public.quote_items
  for delete using (
    exists (
      select 1 from public.quotes
      where quotes.id = quote_items.quote_id
        and quotes.user_id = auth.uid()
    )
  );

create index if not exists idx_quote_items_quote_id on public.quote_items (quote_id);

-- =============================================================================
-- 5. orders table
-- =============================================================================
create table if not exists public.orders (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references auth.users on delete cascade not null,
  customer_id             uuid references public.customers (id) on delete set null,
  quote_id                uuid references public.quotes (id) on delete set null,

  order_number            text not null,
  order_date              date not null,
  delivery_date           date,

  status                  text not null default 'draft'
                            check (status in ('draft', 'confirmed', 'in_progress', 'delivered', 'invoiced', 'cancelled')),

  currency                text not null default 'SEK',
  exchange_rate           numeric,

  subtotal                numeric not null default 0,
  vat_amount              numeric not null default 0,
  total                   numeric not null default 0,

  vat_treatment           text,
  vat_rate                numeric,

  your_reference          text,
  our_reference           text,
  delivery_address        text,
  notes                   text,

  converted_to_invoice_id uuid,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  unique (user_id, order_number)
);

alter table public.orders enable row level security;

drop policy if exists "orders_select" on public.orders;
create policy "orders_select" on public.orders
  for select using (auth.uid() = user_id);
drop policy if exists "orders_insert" on public.orders;
create policy "orders_insert" on public.orders
  for insert with check (auth.uid() = user_id);
drop policy if exists "orders_update" on public.orders;
create policy "orders_update" on public.orders
  for update using (auth.uid() = user_id);
drop policy if exists "orders_delete" on public.orders;
create policy "orders_delete" on public.orders
  for delete using (auth.uid() = user_id);

create index if not exists idx_orders_user_id on public.orders (user_id);
create index if not exists idx_orders_status on public.orders (status);
create index if not exists idx_orders_customer_id on public.orders (customer_id);

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at
  before update on public.orders
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 6. order_items table
-- =============================================================================
create table if not exists public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references public.orders (id) on delete cascade not null,
  sort_order  integer default 0,
  description text not null,
  quantity    numeric default 1,
  unit        text default 'st',
  unit_price  numeric default 0,
  line_total  numeric default 0,
  created_at  timestamptz not null default now()
);

alter table public.order_items enable row level security;

drop policy if exists "order_items_select" on public.order_items;
create policy "order_items_select" on public.order_items
  for select using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and orders.user_id = auth.uid()
    )
  );
drop policy if exists "order_items_insert" on public.order_items;
create policy "order_items_insert" on public.order_items
  for insert with check (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and orders.user_id = auth.uid()
    )
  );
drop policy if exists "order_items_update" on public.order_items;
create policy "order_items_update" on public.order_items
  for update using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and orders.user_id = auth.uid()
    )
  );
drop policy if exists "order_items_delete" on public.order_items;
create policy "order_items_delete" on public.order_items
  for delete using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and orders.user_id = auth.uid()
    )
  );

create index if not exists idx_order_items_order_id on public.order_items (order_id);

-- =============================================================================
-- 7. Add quote/order settings to company_settings
-- =============================================================================
alter table public.company_settings
  add column if not exists next_quote_number integer default 1,
  add column if not exists next_order_number integer default 1,
  add column if not exists quote_prefix text,
  add column if not exists order_prefix text,
  add column if not exists default_quote_validity_days integer default 30;
