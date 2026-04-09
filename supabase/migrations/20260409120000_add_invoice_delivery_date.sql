-- ML 17:24 p.7: leveransdatum when different from fakturadatum
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS delivery_date date;
