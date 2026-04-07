-- Add columns to customers that were applied directly to production but never captured in a migration.
-- This ensures staging/preview branches have the same schema.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_type text NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS vat_number_validated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_payment_terms integer DEFAULT 30;
