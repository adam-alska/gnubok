-- Add default voucher series to company_settings
-- Allows companies to configure which series (A-Z) is pre-selected
-- when creating manual journal entries. Defaults to 'A'.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS default_voucher_series text NOT NULL DEFAULT 'A';

-- Enforce single uppercase letter
ALTER TABLE public.company_settings
  ADD CONSTRAINT company_settings_default_voucher_series_check
  CHECK (default_voucher_series ~ '^[A-Z]$');
