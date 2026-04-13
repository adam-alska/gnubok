-- Retroactive schema cache reload after recent ALTER TABLE migrations
-- (trade_name, delivery_date, pays_salaries, etc.) that did not include
-- NOTIFY pgrst. Ensures PostgREST picks up all new columns immediately.
NOTIFY pgrst, 'reload schema';
