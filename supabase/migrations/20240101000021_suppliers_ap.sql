-- Migration 21: Suppliers & Accounts Payable
-- suppliers, supplier_invoices, supplier_invoice_items,
-- supplier_invoice_attestations, supplier_payments, supplier_payment_items

-- =============================================================================
-- 0. Drop pre-existing tables with incomplete schemas (from earlier remote migrations)
-- =============================================================================
DROP TABLE IF EXISTS public.supplier_payment_items CASCADE;
DROP TABLE IF EXISTS public.supplier_payments CASCADE;
DROP TABLE IF EXISTS public.supplier_invoice_attestations CASCADE;
DROP TABLE IF EXISTS public.supplier_invoice_items CASCADE;
DROP TABLE IF EXISTS public.supplier_invoices CASCADE;
DROP TABLE IF EXISTS public.suppliers CASCADE;

-- =============================================================================
-- 1. suppliers
-- =============================================================================
create table if not exists public.suppliers (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users on delete cascade not null,
  name                  text not null,
  org_number            text,
  vat_number            text,
  email                 text,
  phone                 text,
  address_line1         text,
  postal_code           text,
  city                  text,
  country               text default 'SE',
  bankgiro              text,
  plusgiro              text,
  iban                  text,
  bic                   text,
  clearing_number       text,
  account_number        text,
  default_payment_terms integer default 30,
  category              text,
  notes                 text,
  is_active             boolean default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.suppliers enable row level security;

drop policy if exists "suppliers_select" on public.suppliers;
create policy "suppliers_select" on public.suppliers
  for select using (auth.uid() = user_id);
drop policy if exists "suppliers_insert" on public.suppliers;
create policy "suppliers_insert" on public.suppliers
  for insert with check (auth.uid() = user_id);
drop policy if exists "suppliers_update" on public.suppliers;
create policy "suppliers_update" on public.suppliers
  for update using (auth.uid() = user_id);
drop policy if exists "suppliers_delete" on public.suppliers;
create policy "suppliers_delete" on public.suppliers
  for delete using (auth.uid() = user_id);

create index if not exists idx_suppliers_user_id on public.suppliers (user_id);
create index if not exists idx_suppliers_name on public.suppliers (user_id, name);
create index if not exists idx_suppliers_is_active on public.suppliers (user_id, is_active);

drop trigger if exists suppliers_updated_at on public.suppliers;
create trigger suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 2. supplier_invoices
-- =============================================================================
create table if not exists public.supplier_invoices (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users on delete cascade not null,
  supplier_id           uuid references public.suppliers (id) on delete set null,
  invoice_number        text not null,
  ocr_number            text,
  invoice_date          date,
  due_date              date,
  received_date         date default current_date,
  status                text default 'received'
                          check (status in (
                            'draft', 'received', 'attested', 'approved',
                            'scheduled', 'paid', 'disputed', 'credited'
                          )),
  currency              text default 'SEK',
  exchange_rate         numeric,
  subtotal              numeric default 0,
  vat_amount            numeric default 0,
  total                 numeric default 0,
  total_sek             numeric default 0,
  vat_treatment         text,
  vat_rate              numeric default 25,
  payment_method        text
                          check (payment_method in (
                            'bankgiro', 'plusgiro', 'bank_transfer', 'swish', 'cash'
                          )),
  payment_reference     text,
  paid_at               timestamptz,
  paid_amount           numeric,
  journal_entry_id      uuid,
  attachment_url        text,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.supplier_invoices enable row level security;

drop policy if exists "supplier_invoices_select" on public.supplier_invoices;
create policy "supplier_invoices_select" on public.supplier_invoices
  for select using (auth.uid() = user_id);
drop policy if exists "supplier_invoices_insert" on public.supplier_invoices;
create policy "supplier_invoices_insert" on public.supplier_invoices
  for insert with check (auth.uid() = user_id);
drop policy if exists "supplier_invoices_update" on public.supplier_invoices;
create policy "supplier_invoices_update" on public.supplier_invoices
  for update using (auth.uid() = user_id);
drop policy if exists "supplier_invoices_delete" on public.supplier_invoices;
create policy "supplier_invoices_delete" on public.supplier_invoices
  for delete using (auth.uid() = user_id);

create index if not exists idx_supplier_invoices_user_id on public.supplier_invoices (user_id);
create index if not exists idx_supplier_invoices_supplier_id on public.supplier_invoices (supplier_id);
create index if not exists idx_supplier_invoices_status on public.supplier_invoices (user_id, status);
create index if not exists idx_supplier_invoices_due_date on public.supplier_invoices (user_id, due_date);
create index if not exists idx_supplier_invoices_invoice_number on public.supplier_invoices (user_id, invoice_number);

drop trigger if exists supplier_invoices_updated_at on public.supplier_invoices;
create trigger supplier_invoices_updated_at
  before update on public.supplier_invoices
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 3. supplier_invoice_items
-- =============================================================================
create table if not exists public.supplier_invoice_items (
  id                    uuid primary key default gen_random_uuid(),
  supplier_invoice_id   uuid references public.supplier_invoices (id) on delete cascade not null,
  sort_order            integer default 0,
  description           text,
  quantity              numeric default 1,
  unit                  text default 'st',
  unit_price            numeric default 0,
  line_total            numeric default 0,
  account_number        text,
  vat_rate              numeric default 25,
  vat_amount            numeric default 0,
  cost_center           text,
  project               text,
  created_at            timestamptz not null default now()
);

alter table public.supplier_invoice_items enable row level security;

drop policy if exists "supplier_invoice_items_select" on public.supplier_invoice_items;
create policy "supplier_invoice_items_select" on public.supplier_invoice_items
  for select using (
    exists (
      select 1 from public.supplier_invoices
      where supplier_invoices.id = supplier_invoice_items.supplier_invoice_id
        and supplier_invoices.user_id = auth.uid()
    )
  );
drop policy if exists "supplier_invoice_items_insert" on public.supplier_invoice_items;
create policy "supplier_invoice_items_insert" on public.supplier_invoice_items
  for insert with check (
    exists (
      select 1 from public.supplier_invoices
      where supplier_invoices.id = supplier_invoice_items.supplier_invoice_id
        and supplier_invoices.user_id = auth.uid()
    )
  );
drop policy if exists "supplier_invoice_items_update" on public.supplier_invoice_items;
create policy "supplier_invoice_items_update" on public.supplier_invoice_items
  for update using (
    exists (
      select 1 from public.supplier_invoices
      where supplier_invoices.id = supplier_invoice_items.supplier_invoice_id
        and supplier_invoices.user_id = auth.uid()
    )
  );
drop policy if exists "supplier_invoice_items_delete" on public.supplier_invoice_items;
create policy "supplier_invoice_items_delete" on public.supplier_invoice_items
  for delete using (
    exists (
      select 1 from public.supplier_invoices
      where supplier_invoices.id = supplier_invoice_items.supplier_invoice_id
        and supplier_invoices.user_id = auth.uid()
    )
  );

create index if not exists idx_supplier_invoice_items_invoice_id on public.supplier_invoice_items (supplier_invoice_id);

-- =============================================================================
-- 4. supplier_invoice_attestations
-- =============================================================================
create table if not exists public.supplier_invoice_attestations (
  id                    uuid primary key default gen_random_uuid(),
  supplier_invoice_id   uuid references public.supplier_invoices (id) on delete cascade not null,
  user_id               uuid references auth.users on delete cascade not null,
  action                text not null
                          check (action in ('attested', 'rejected', 'commented')),
  comment               text,
  attested_at           timestamptz not null default now()
);

alter table public.supplier_invoice_attestations enable row level security;

drop policy if exists "supplier_invoice_attestations_select" on public.supplier_invoice_attestations;
create policy "supplier_invoice_attestations_select" on public.supplier_invoice_attestations
  for select using (
    exists (
      select 1 from public.supplier_invoices
      where supplier_invoices.id = supplier_invoice_attestations.supplier_invoice_id
        and supplier_invoices.user_id = auth.uid()
    )
  );
drop policy if exists "supplier_invoice_attestations_insert" on public.supplier_invoice_attestations;
create policy "supplier_invoice_attestations_insert" on public.supplier_invoice_attestations
  for insert with check (
    exists (
      select 1 from public.supplier_invoices
      where supplier_invoices.id = supplier_invoice_attestations.supplier_invoice_id
        and supplier_invoices.user_id = auth.uid()
    )
  );

create index if not exists idx_supplier_invoice_attestations_invoice_id on public.supplier_invoice_attestations (supplier_invoice_id);

-- =============================================================================
-- 5. supplier_payments (payment batches)
-- =============================================================================
create table if not exists public.supplier_payments (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users on delete cascade not null,
  payment_date          date not null,
  status                text default 'draft'
                          check (status in ('draft', 'approved', 'sent', 'confirmed')),
  total_amount          numeric default 0,
  payment_count         integer default 0,
  file_content          text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.supplier_payments enable row level security;

drop policy if exists "supplier_payments_select" on public.supplier_payments;
create policy "supplier_payments_select" on public.supplier_payments
  for select using (auth.uid() = user_id);
drop policy if exists "supplier_payments_insert" on public.supplier_payments;
create policy "supplier_payments_insert" on public.supplier_payments
  for insert with check (auth.uid() = user_id);
drop policy if exists "supplier_payments_update" on public.supplier_payments;
create policy "supplier_payments_update" on public.supplier_payments
  for update using (auth.uid() = user_id);
drop policy if exists "supplier_payments_delete" on public.supplier_payments;
create policy "supplier_payments_delete" on public.supplier_payments
  for delete using (auth.uid() = user_id);

create index if not exists idx_supplier_payments_user_id on public.supplier_payments (user_id);
create index if not exists idx_supplier_payments_status on public.supplier_payments (user_id, status);

drop trigger if exists supplier_payments_updated_at on public.supplier_payments;
create trigger supplier_payments_updated_at
  before update on public.supplier_payments
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 6. supplier_payment_items
-- =============================================================================
create table if not exists public.supplier_payment_items (
  id                    uuid primary key default gen_random_uuid(),
  payment_id            uuid references public.supplier_payments (id) on delete cascade not null,
  supplier_invoice_id   uuid references public.supplier_invoices (id) on delete set null,
  amount                numeric not null,
  payment_method        text,
  reference             text,
  created_at            timestamptz not null default now()
);

alter table public.supplier_payment_items enable row level security;

drop policy if exists "supplier_payment_items_select" on public.supplier_payment_items;
create policy "supplier_payment_items_select" on public.supplier_payment_items
  for select using (
    exists (
      select 1 from public.supplier_payments
      where supplier_payments.id = supplier_payment_items.payment_id
        and supplier_payments.user_id = auth.uid()
    )
  );
drop policy if exists "supplier_payment_items_insert" on public.supplier_payment_items;
create policy "supplier_payment_items_insert" on public.supplier_payment_items
  for insert with check (
    exists (
      select 1 from public.supplier_payments
      where supplier_payments.id = supplier_payment_items.payment_id
        and supplier_payments.user_id = auth.uid()
    )
  );
drop policy if exists "supplier_payment_items_delete" on public.supplier_payment_items;
create policy "supplier_payment_items_delete" on public.supplier_payment_items
  for delete using (
    exists (
      select 1 from public.supplier_payments
      where supplier_payments.id = supplier_payment_items.payment_id
        and supplier_payments.user_id = auth.uid()
    )
  );

create index if not exists idx_supplier_payment_items_payment_id on public.supplier_payment_items (payment_id);
create index if not exists idx_supplier_payment_items_invoice_id on public.supplier_payment_items (supplier_invoice_id);
