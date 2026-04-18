-- Add default_voucher_series to company_settings.
--
-- The frontend (/settings/bookkeeping) and TypeScript types have referenced
-- this column for a while, but no migration ever added it, so saving the form
-- failed with: "Could not find the 'default_voucher_series' column of
-- 'company_settings' in the schema cache".
--
-- The column stores the per-company default voucher series (A–Z) that is
-- pre-selected when booking manual journal entries. The actual sequence
-- counters live in public.voucher_sequences, keyed on (user_id,
-- fiscal_period_id, voucher_series) — this setting only controls the UI
-- default.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS default_voucher_series text NOT NULL DEFAULT 'A';

-- Match the Zod validation in lib/api/schemas.ts so DB and app stay in sync.
ALTER TABLE public.company_settings
  DROP CONSTRAINT IF EXISTS company_settings_default_voucher_series_check;

ALTER TABLE public.company_settings
  ADD CONSTRAINT company_settings_default_voucher_series_check
  CHECK (default_voucher_series ~ '^[A-Z]$');

-- Reload PostgREST schema cache so the column becomes visible to the API
-- immediately, without waiting for the next automatic reload.
NOTIFY pgrst, 'reload schema';
