-- Add columns to company_settings that were applied directly to production but never captured in a migration.
-- This ensures staging/preview branches have the same schema.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS clearing_number text,
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS selected_sector text,
  ADD COLUMN IF NOT EXISTS selected_modules jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS business_profile jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS employee_count integer,
  ADD COLUMN IF NOT EXISTS annual_revenue_range text,
  ADD COLUMN IF NOT EXISTS has_employees boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS uses_pos_system boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sells_internationally boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS preliminary_tax_monthly numeric,
  ADD COLUMN IF NOT EXISTS next_quote_number integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS next_order_number integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS quote_prefix text,
  ADD COLUMN IF NOT EXISTS order_prefix text,
  ADD COLUMN IF NOT EXISTS default_quote_validity_days integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS swish_number text,
  ADD COLUMN IF NOT EXISTS invoice_default_notes text;
