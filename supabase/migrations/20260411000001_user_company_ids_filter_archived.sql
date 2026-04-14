-- Filter archived companies out of user_company_ids() helper.
--
-- Soft-deleted (archived) companies must disappear from the user's UI while
-- the underlying bookkeeping data stays intact for BFL 7 kap. 2§ 7-year
-- retention. Routing this filter through user_company_ids() makes every
-- company-scoped RLS policy honor it automatically.
--
-- Also adds companies.archived_by (who archived it) and an index on
-- archived_at IS NULL to speed up the common "list my active companies"
-- picker query.

CREATE OR REPLACE FUNCTION public.user_company_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cm.company_id
  FROM public.company_members cm
  JOIN public.companies c ON c.id = cm.company_id
  WHERE cm.user_id = auth.uid()
    AND c.archived_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.user_company_ids() TO authenticated;

-- Track who archived a company. ON DELETE SET NULL so a future hard-purge
-- (7 years out) of the archiving user doesn't break the tombstone row.
ALTER TABLE public.companies
  ADD COLUMN archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Partial index: picker queries almost always filter to active companies.
CREATE INDEX companies_active_idx
  ON public.companies (id)
  WHERE archived_at IS NULL;

NOTIFY pgrst, 'reload schema';
