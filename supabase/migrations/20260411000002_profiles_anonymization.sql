-- Add tombstone columns to profiles for account anonymization.
--
-- When a user deletes their account we must keep the auth.users row alive
-- (otherwise ON DELETE CASCADE from companies.created_by would destroy
-- retained bookkeeping data). Instead we anonymize the profile row: strip
-- PII, stamp deleted_at + anonymized_at, and the UI falls back to
-- "Borttagen användare" wherever the profile is displayed.
--
-- email and full_name are already nullable per migration 20240101000001.

ALTER TABLE public.profiles
  ADD COLUMN deleted_at    timestamptz,
  ADD COLUMN anonymized_at timestamptz;
