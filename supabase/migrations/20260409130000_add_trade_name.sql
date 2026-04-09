-- Add trade_name column to company_settings
-- Allows companies to display a trade name (handelsnamn) on invoices
-- and other external-facing documents instead of the legal company name.
ALTER TABLE public.company_settings
  ADD COLUMN trade_name text;
