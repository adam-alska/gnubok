-- BankID identity linking table
-- Maps Supabase auth users to Swedish personnummer for BankID login.
-- Personnummer stored as SHA-256 hash (lookup) + AES-256-GCM encrypted (display).

create table public.bankid_identities (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid references auth.users on delete cascade unique not null,
  personal_number_hash text not null,
  personal_number_enc  bytea not null,
  given_name           text,
  surname              text,
  linked_at            timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.bankid_identities enable row level security;

-- Users can view their own BankID identity
create policy "bankid_identities_select" on public.bankid_identities
  for select using (auth.uid() = user_id);

-- Users can link BankID to their own account
create policy "bankid_identities_insert" on public.bankid_identities
  for insert with check (auth.uid() = user_id);

-- Users can unlink BankID from their account
create policy "bankid_identities_delete" on public.bankid_identities
  for delete using (auth.uid() = user_id);

-- Fast lookup of returning BankID users by personnummer hash
create unique index idx_bankid_identities_pnr_hash
  on public.bankid_identities (personal_number_hash);

create index idx_bankid_identities_user_id
  on public.bankid_identities (user_id);

create trigger bankid_identities_updated_at
  before update on public.bankid_identities
  for each row execute function public.update_updated_at_column();
