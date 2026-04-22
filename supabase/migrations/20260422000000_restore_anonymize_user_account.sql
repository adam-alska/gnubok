-- Restore account anonymization RPC and profile tombstone columns.
--
-- These were introduced in PR #218 but dropped during the migration
-- consolidation in commit b387a77 (PR #244) without being re-added to the
-- consolidated schema. The /api/account/delete route still calls the RPC,
-- so account deletion has been broken in prod since that consolidation.
--
-- Why anonymize instead of hard-delete:
--   BFL 7 kap. 2§ requires räkenskapsinformation to be preserved for 7
--   years. companies.created_by references auth.users ON DELETE CASCADE,
--   so hard-deleting the user would wipe retained verifikationer. Instead
--   we keep auth.users alive as a banned tombstone, strip PII from the
--   profile, and let the FKs in retained bookkeeping data stay valid.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at    timestamptz,
  ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;

CREATE OR REPLACE FUNCTION public.anonymize_user_account(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  blocker_count int;
BEGIN
  IF auth.uid() IS DISTINCT FROM target_user_id THEN
    RAISE EXCEPTION 'Can only delete your own account';
  END IF;

  SELECT count(*) INTO blocker_count
  FROM public.company_members cm
  JOIN public.companies c ON c.id = cm.company_id
  WHERE cm.user_id = target_user_id
    AND cm.role = 'owner'
    AND c.archived_at IS NULL;

  IF blocker_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete account: user still owns % active compan(y/ies)', blocker_count
      USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.company_members WHERE user_id = target_user_id;
  DELETE FROM public.team_members    WHERE user_id = target_user_id;

  DELETE FROM public.user_preferences WHERE user_id = target_user_id;
  DELETE FROM public.api_keys         WHERE user_id = target_user_id;

  UPDATE public.profiles
     SET email         = NULL,
         full_name     = NULL,
         avatar_url    = NULL,
         deleted_at    = now(),
         anonymized_at = now(),
         updated_at    = now()
   WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.anonymize_user_account(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
