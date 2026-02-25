-- Document matching: add columns to invoice_inbox_items for transaction matching
-- and AI template suggestions.

-- Suggested booking template from AI extraction
ALTER TABLE public.invoice_inbox_items
  ADD COLUMN suggested_template_id TEXT,
  ADD COLUMN suggested_template_confidence NUMERIC;

-- Matched bank transaction
ALTER TABLE public.invoice_inbox_items
  ADD COLUMN matched_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN match_confidence NUMERIC,
  ADD COLUMN match_method TEXT CHECK (match_method IN ('payment_reference', 'amount_date', 'amount_merchant', 'receipt_match'));

-- Index for looking up which inbox item is matched to a transaction
CREATE INDEX idx_inbox_items_matched_transaction
  ON public.invoice_inbox_items (user_id, matched_transaction_id)
  WHERE matched_transaction_id IS NOT NULL;

-- Index for finding unmatched ready items for sweep
CREATE INDEX idx_inbox_items_unmatched_ready
  ON public.invoice_inbox_items (user_id, status)
  WHERE matched_transaction_id IS NULL AND status IN ('ready', 'processing');
