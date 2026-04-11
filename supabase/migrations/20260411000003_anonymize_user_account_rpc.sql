-- Replace hard-delete with anonymization: retain auth.users as a tombstone.
--
-- Why: BFL 7 kap. 2§ requires räkenskapsinformation to be preserved for 7
-- years. companies.created_by references auth.users ON DELETE CASCADE, so
-- hard-deleting the user would wipe retained verifikationer. Instead we:
--   1) verify zero owned, non-archived companies
--   2) remove the user from all company/team memberships
--   3) delete per-user operational state (prefs, api keys)
--   4) anonymize the profile
-- The API route caller is responsible for banning the auth.users row via
-- the admin API afterwards (SQL can't reach supabase.auth.admin).

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

  -- Precondition: zero owned, non-archived companies
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

  -- Remove memberships
  DELETE FROM public.company_members WHERE user_id = target_user_id;
  DELETE FROM public.team_members   WHERE user_id = target_user_id;

  -- Remove per-user operational state
  DELETE FROM public.user_preferences WHERE user_id = target_user_id;
  DELETE FROM public.api_keys         WHERE user_id = target_user_id;

  -- Anonymize profile tombstone
  UPDATE public.profiles
     SET email         = NULL,
         full_name     = NULL,
         avatar_url    = NULL,
         deleted_at    = now(),
         anonymized_at = now(),
         updated_at    = now()
   WHERE id = target_user_id;

  -- NOTE: auth.users row, companies.created_by FK, and audit_log.user_id
  -- are intentionally left intact. They now reference a banned, anonymized
  -- tombstone row that exists solely to keep BFL-retained data valid.
END;
$$;

GRANT EXECUTE ON FUNCTION public.anonymize_user_account(uuid) TO authenticated;

-- The old delete_user_account RPC hard-deleted auth.users, which cascaded
-- away retained verifikationer via companies.created_by. It is incompatible
-- with the retention model and must be removed.
DROP FUNCTION IF EXISTS public.delete_user_account(uuid);
