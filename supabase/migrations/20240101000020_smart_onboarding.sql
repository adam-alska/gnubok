-- Migration 20: Smart Onboarding
-- Adds sector/module selection to company_settings and onboarding_checklist table

-- =============================================================================
-- 1. Add columns to company_settings
-- =============================================================================

-- Selected sector (primary industry sector slug)
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS selected_sector text;

-- Selected modules (array of module slugs the user selected)
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS selected_modules jsonb DEFAULT '[]'::jsonb;

-- Business profile (answers to business questions)
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS business_profile jsonb DEFAULT '{}'::jsonb;

-- Track current onboarding step (add only if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'company_settings'
      AND column_name = 'onboarding_step'
  ) THEN
    ALTER TABLE public.company_settings
      ADD COLUMN onboarding_step integer DEFAULT 1;
  END IF;
END
$$;

-- Employee count
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS employee_count integer;

-- Annual revenue range
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS annual_revenue_range text;

-- Has employees
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS has_employees boolean DEFAULT false;

-- Uses POS system
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS uses_pos_system boolean DEFAULT false;

-- Sells internationally
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS sells_internationally boolean DEFAULT false;

-- Preliminary tax monthly (add only if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'company_settings'
      AND column_name = 'preliminary_tax_monthly'
  ) THEN
    ALTER TABLE public.company_settings
      ADD COLUMN preliminary_tax_monthly numeric;
  END IF;
END
$$;

-- Bank name (add only if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'company_settings'
      AND column_name = 'bank_name'
  ) THEN
    ALTER TABLE public.company_settings
      ADD COLUMN bank_name text;
  END IF;
END
$$;

-- Clearing number (add only if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'company_settings'
      AND column_name = 'clearing_number'
  ) THEN
    ALTER TABLE public.company_settings
      ADD COLUMN clearing_number text;
  END IF;
END
$$;

-- Account number (add only if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'company_settings'
      AND column_name = 'account_number'
  ) THEN
    ALTER TABLE public.company_settings
      ADD COLUMN account_number text;
  END IF;
END
$$;

-- =============================================================================
-- 2. onboarding_checklist table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.onboarding_checklist (
  id            uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id       uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  task_key      text NOT NULL,
  title         text NOT NULL,
  description   text,
  is_completed  boolean NOT NULL DEFAULT false,
  completed_at  timestamptz,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_checklist ENABLE ROW LEVEL SECURITY;

-- RLS policies for onboarding_checklist
CREATE POLICY "onboarding_checklist_select" ON public.onboarding_checklist
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "onboarding_checklist_insert" ON public.onboarding_checklist
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "onboarding_checklist_update" ON public.onboarding_checklist
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "onboarding_checklist_delete" ON public.onboarding_checklist
  FOR DELETE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_onboarding_checklist_user_id
  ON public.onboarding_checklist (user_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_checklist_user_completed
  ON public.onboarding_checklist (user_id, is_completed);

-- Unique constraint on user + task_key to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_checklist_user_task
  ON public.onboarding_checklist (user_id, task_key);
