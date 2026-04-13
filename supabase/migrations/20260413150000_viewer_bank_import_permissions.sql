-- =============================================================================
-- Viewer role: allow bank transaction import and bank connection
-- =============================================================================
--
-- Viewers are read-only by default (enforced by `current_user_can_write()`).
-- This migration adds additive policies that let viewers:
--   1. Import bank files (INSERT transactions + bank_file_imports)
--   2. Connect banks via PSD2 (INSERT + UPDATE bank_connections)
--
-- No other write operation is opened — viewers still cannot categorize,
-- book, edit, or delete transactions, create invoices, etc.
--
-- RLS is OR-based: existing policies (which require `current_user_can_write()`)
-- remain unchanged. These new policies provide an alternative path for
-- viewers on just these tables.
-- =============================================================================

-- ─── Transactions ────────────────────────────────────────────────────────────
-- Viewer can INSERT (not UPDATE/DELETE) — raw uncategorized transactions only
CREATE POLICY "transactions_viewer_insert" ON public.transactions
  FOR INSERT WITH CHECK (
    company_id = public.current_active_company_id()
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = public.current_active_company_id()
        AND cm.role = 'viewer'
    )
  );

-- ─── Bank file imports ───────────────────────────────────────────────────────
-- Viewer can INSERT (create import record) + UPDATE (status tracking)
CREATE POLICY "bank_file_imports_viewer_insert" ON public.bank_file_imports
  FOR INSERT WITH CHECK (
    company_id = public.current_active_company_id()
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = public.current_active_company_id()
        AND cm.role = 'viewer'
    )
  );

CREATE POLICY "bank_file_imports_viewer_update" ON public.bank_file_imports
  FOR UPDATE USING (
    company_id = public.current_active_company_id()
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = public.current_active_company_id()
        AND cm.role = 'viewer'
    )
  );

-- ─── Bank connections ────────────────────────────────────────────────────────
-- Viewer can INSERT (initiate PSD2 connection) + UPDATE (status changes, sync)
-- No DELETE — disconnecting sets status='revoked' via UPDATE, not DELETE
CREATE POLICY "bank_connections_viewer_insert" ON public.bank_connections
  FOR INSERT WITH CHECK (
    company_id = public.current_active_company_id()
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = public.current_active_company_id()
        AND cm.role = 'viewer'
    )
  );

CREATE POLICY "bank_connections_viewer_update" ON public.bank_connections
  FOR UPDATE USING (
    company_id = public.current_active_company_id()
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = public.current_active_company_id()
        AND cm.role = 'viewer'
    )
  );
