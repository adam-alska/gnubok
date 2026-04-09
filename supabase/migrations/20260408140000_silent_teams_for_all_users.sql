-- Migration: Silent teams for all users
--
-- Every user now gets a silent team at signup. This migration:
-- 1. Creates an ensure_user_team() RPC for idempotent team creation
-- 2. Backfills: creates teams for existing users who don't have one
-- 3. Assigns orphaned companies (team_id IS NULL) to their owner's team
-- 4. Deletes incomplete companies (mid-onboarding, no journal entries)

-- =============================================================================
-- 1. NEW RPC: ensure_user_team()
-- =============================================================================
-- Idempotently ensures the calling user has a team.
-- Returns the team_id (existing or newly created).

CREATE OR REPLACE FUNCTION public.ensure_user_team()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_team_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if user already has a team
  SELECT team_id INTO v_team_id
  FROM public.team_members
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_team_id IS NOT NULL THEN
    RETURN v_team_id;
  END IF;

  -- Create a new team (name doesn't matter — hidden from UI)
  INSERT INTO public.teams (name, created_by)
  VALUES ('Personal', v_user_id)
  RETURNING id INTO v_team_id;

  -- Add user as team owner
  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (v_team_id, v_user_id, 'owner');

  RETURN v_team_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_team() TO authenticated;

-- =============================================================================
-- 2. BACKFILL: Create teams for existing users without one
-- =============================================================================
-- Find all users who have company_members rows but no team_members rows.
-- Create a team for each and add them as owner.

DO $$
DECLARE
  rec RECORD;
  v_team_id uuid;
BEGIN
  FOR rec IN
    SELECT DISTINCT cm.user_id
    FROM public.company_members cm
    WHERE NOT EXISTS (
      SELECT 1 FROM public.team_members tm WHERE tm.user_id = cm.user_id
    )
  LOOP
    -- Create team
    INSERT INTO public.teams (name, created_by)
    VALUES ('Personal', rec.user_id)
    RETURNING id INTO v_team_id;

    -- Add as owner
    INSERT INTO public.team_members (team_id, user_id, role)
    VALUES (v_team_id, rec.user_id, 'owner');

    -- Assign all companies owned by this user to the new team
    UPDATE public.companies
    SET team_id = v_team_id
    WHERE created_by = rec.user_id
      AND team_id IS NULL;
  END LOOP;
END;
$$;

-- =============================================================================
-- 3. Assign any remaining orphaned companies to their creator's team
-- =============================================================================
-- Edge case: companies where team_id IS NULL but the creator already has a team
-- (e.g., they were a team member but also had solo companies).

UPDATE public.companies c
SET team_id = (
  SELECT tm.team_id
  FROM public.team_members tm
  WHERE tm.user_id = c.created_by
  LIMIT 1
)
WHERE c.team_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.team_members tm WHERE tm.user_id = c.created_by
  );

-- =============================================================================
-- 4. Delete incomplete companies (mid-onboarding cleanup)
-- =============================================================================
-- Only delete companies where:
-- - onboarding_complete is false or no settings row exists
-- - There are zero journal entries
-- - There are zero transactions
-- This is safe because no real bookkeeping data exists.

DO $$
DECLARE
  rec RECORD;
  v_je_count int;
  v_tx_count int;
BEGIN
  FOR rec IN
    SELECT c.id AS company_id
    FROM public.companies c
    LEFT JOIN public.company_settings cs ON cs.company_id = c.id
    WHERE (cs.onboarding_complete IS NULL OR cs.onboarding_complete = false)
  LOOP
    -- Check for journal entries
    SELECT count(*) INTO v_je_count
    FROM public.journal_entries
    WHERE company_id = rec.company_id;

    -- Check for transactions
    SELECT count(*) INTO v_tx_count
    FROM public.transactions
    WHERE company_id = rec.company_id;

    -- Only delete if truly empty
    IF v_je_count = 0 AND v_tx_count = 0 THEN
      -- Delete dependent rows first (order matters for FK constraints)
      DELETE FROM public.company_settings WHERE company_id = rec.company_id;
      DELETE FROM public.fiscal_periods WHERE company_id = rec.company_id;
      DELETE FROM public.chart_of_accounts WHERE company_id = rec.company_id;
      DELETE FROM public.company_members WHERE company_id = rec.company_id;
      DELETE FROM public.companies WHERE id = rec.company_id;
    END IF;
  END LOOP;
END;
$$;
