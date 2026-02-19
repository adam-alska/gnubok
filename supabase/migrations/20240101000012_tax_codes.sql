-- Migration 12: Tax Code Engine
-- Decoupled tax codes for momsdeklaration mapping

-- =============================================================================
-- 1. tax_codes table
-- =============================================================================
CREATE TABLE public.tax_codes (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          uuid REFERENCES auth.users ON DELETE CASCADE,
  code             text NOT NULL,
  description      text NOT NULL,
  rate             numeric NOT NULL DEFAULT 0,

  -- Momsdeklaration ruta mapping
  moms_basis_boxes text[] DEFAULT '{}',  -- e.g. {'10'} for 25% basis
  moms_tax_boxes   text[] DEFAULT '{}',  -- e.g. {'05'} for 25% output VAT
  moms_input_boxes text[] DEFAULT '{}',  -- e.g. {'48'} for input VAT

  -- Classification flags
  is_output_vat     boolean DEFAULT false,
  is_reverse_charge boolean DEFAULT false,
  is_eu             boolean DEFAULT false,
  is_export         boolean DEFAULT false,
  is_oss            boolean DEFAULT false,
  is_system         boolean DEFAULT false,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- System codes have NULL user_id; user codes have unique code per user
  UNIQUE (user_id, code)
);

ALTER TABLE public.tax_codes ENABLE ROW LEVEL SECURITY;

-- Users can see their own + system (user_id IS NULL) codes
CREATE POLICY "tax_codes_select" ON public.tax_codes
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "tax_codes_insert" ON public.tax_codes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tax_codes_update" ON public.tax_codes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "tax_codes_delete" ON public.tax_codes
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_tax_codes_user_id ON public.tax_codes (user_id);
CREATE INDEX idx_tax_codes_code ON public.tax_codes (code);

CREATE TRIGGER tax_codes_updated_at
  BEFORE UPDATE ON public.tax_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- 2. Seed system tax codes (12 standard Swedish tax codes)
-- =============================================================================
INSERT INTO public.tax_codes (user_id, code, description, rate, moms_basis_boxes, moms_tax_boxes, moms_input_boxes, is_output_vat, is_reverse_charge, is_eu, is_export, is_oss, is_system)
VALUES
  -- Output VAT (utgående moms)
  (NULL, 'MP1',   'Utgående moms 25%',              0.25, '{10}', '{05}', '{}',   true,  false, false, false, false, true),
  (NULL, 'MP2',   'Utgående moms 12%',              0.12, '{11}', '{06}', '{}',   true,  false, false, false, false, true),
  (NULL, 'MP3',   'Utgående moms 6%',               0.06, '{12}', '{07}', '{}',   true,  false, false, false, false, true),

  -- Input VAT (ingående moms)
  (NULL, 'MPI',   'Ingående moms 25%',              0.25, '{}',   '{}',   '{48}', false, false, false, false, false, true),
  (NULL, 'MPI12', 'Ingående moms 12%',              0.12, '{}',   '{}',   '{48}', false, false, false, false, false, true),
  (NULL, 'MPI6',  'Ingående moms 6%',               0.06, '{}',   '{}',   '{48}', false, false, false, false, false, true),

  -- EU / International
  (NULL, 'IV',    'Intra-EU förvärv (omvänd moms)', 0.25, '{20,21}', '{30,31}', '{48}', false, true,  true,  false, false, true),
  (NULL, 'EUS',   'EU försäljning (omvänd moms)',   0,    '{39}',    '{}',      '{}',   false, true,  true,  false, false, true),
  (NULL, 'IP',    'Import (tull/moms)',              0.25, '{22}',    '{32}',    '{48}', false, false, false, false, false, true),
  (NULL, 'EXP',   'Export utanför EU',               0,    '{40}',    '{}',      '{}',   false, false, false, true,  false, true),

  -- OSS (One Stop Shop)
  (NULL, 'OSS',   'OSS försäljning EU konsument',   0,    '{}',      '{}',      '{}',   false, false, true,  false, true,  true),

  -- Exempt
  (NULL, 'NONE',  'Momsfritt',                       0,    '{}',      '{}',      '{}',   false, false, false, false, false, true);

-- =============================================================================
-- 3. Function to copy system tax codes to user scope
-- =============================================================================
CREATE OR REPLACE FUNCTION public.seed_tax_codes_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Only seed if user has no existing tax codes
  SELECT count(*) INTO v_count
  FROM public.tax_codes
  WHERE user_id = p_user_id;

  IF v_count > 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.tax_codes (user_id, code, description, rate, moms_basis_boxes, moms_tax_boxes, moms_input_boxes, is_output_vat, is_reverse_charge, is_eu, is_export, is_oss, is_system)
  SELECT
    p_user_id,
    code,
    description,
    rate,
    moms_basis_boxes,
    moms_tax_boxes,
    moms_input_boxes,
    is_output_vat,
    is_reverse_charge,
    is_eu,
    is_export,
    is_oss,
    false  -- user copies are NOT system
  FROM public.tax_codes
  WHERE user_id IS NULL AND is_system = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_tax_codes_for_user(uuid) TO authenticated;
