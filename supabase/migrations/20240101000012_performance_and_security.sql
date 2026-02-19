-- Migration 12: Performance Indexes, Atomic Invoice RPC, and Calendar Feed Security
-- Adds composite indexes for common query patterns, an atomic invoice creation
-- function, and improved calendar feed token columns.

-- =============================================================================
-- 1. Composite Indexes for Common Query Patterns
-- =============================================================================

-- Transaction queries
CREATE INDEX IF NOT EXISTS idx_transactions_user_business ON transactions(user_id, is_business);
CREATE INDEX IF NOT EXISTS idx_transactions_user_category ON transactions(user_id, category);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_amount ON transactions(user_id, amount);

-- Invoice queries
CREATE INDEX IF NOT EXISTS idx_invoices_user_status ON invoices(user_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_user_due_date ON invoices(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);

-- Deadline queries
CREATE INDEX IF NOT EXISTS idx_deadlines_user_date ON deadlines(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_deadlines_user_status ON deadlines(user_id, status);

-- Bank connection queries
CREATE INDEX IF NOT EXISTS idx_bank_connections_status_synced ON bank_connections(status, last_synced_at);

-- Journal entry queries
CREATE INDEX IF NOT EXISTS idx_journal_entries_user_date ON journal_entries(user_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_user_period ON journal_entries(user_id, fiscal_period_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_entry ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account ON journal_entry_lines(account_number);

-- Receipt queries
CREATE INDEX IF NOT EXISTS idx_receipts_user_status ON receipts(user_id, status);

-- Module toggle queries
CREATE INDEX IF NOT EXISTS idx_module_toggles_user_enabled ON module_toggles(user_id, enabled);

-- =============================================================================
-- 2. Atomic Invoice Creation RPC Function
-- =============================================================================

CREATE OR REPLACE FUNCTION create_invoice_with_items(
  p_invoice jsonb,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number integer;
  v_result jsonb;
BEGIN
  -- Get next invoice number
  SELECT COALESCE(MAX(invoice_number::integer), 0) + 1
  INTO v_invoice_number
  FROM invoices
  WHERE user_id = (p_invoice->>'user_id')::uuid;

  -- Insert invoice
  INSERT INTO invoices (
    user_id, customer_id, invoice_number, invoice_date, due_date,
    status, currency, exchange_rate, exchange_rate_date,
    subtotal, vat_amount, total,
    subtotal_sek, vat_amount_sek, total_sek,
    vat_treatment, vat_rate, moms_ruta,
    your_reference, our_reference, notes,
    reverse_charge_text
  ) VALUES (
    (p_invoice->>'user_id')::uuid,
    (p_invoice->>'customer_id')::uuid,
    v_invoice_number::text,
    (p_invoice->>'invoice_date')::date,
    (p_invoice->>'due_date')::date,
    COALESCE(p_invoice->>'status', 'draft'),
    COALESCE(p_invoice->>'currency', 'SEK'),
    (p_invoice->>'exchange_rate')::numeric,
    (p_invoice->>'exchange_rate_date')::date,
    (p_invoice->>'subtotal')::numeric,
    (p_invoice->>'vat_amount')::numeric,
    (p_invoice->>'total')::numeric,
    (p_invoice->>'subtotal_sek')::numeric,
    (p_invoice->>'vat_amount_sek')::numeric,
    (p_invoice->>'total_sek')::numeric,
    p_invoice->>'vat_treatment',
    (p_invoice->>'vat_rate')::numeric,
    p_invoice->>'moms_ruta',
    p_invoice->>'your_reference',
    p_invoice->>'our_reference',
    p_invoice->>'notes',
    p_invoice->>'reverse_charge_text'
  ) RETURNING id INTO v_invoice_id;

  -- Insert all items
  INSERT INTO invoice_items (invoice_id, sort_order, description, quantity, unit, unit_price, line_total)
  SELECT
    v_invoice_id,
    (item->>'sort_order')::integer,
    item->>'description',
    (item->>'quantity')::numeric,
    item->>'unit',
    (item->>'unit_price')::numeric,
    (item->>'line_total')::numeric
  FROM jsonb_array_elements(p_items) AS item;

  -- Return complete invoice with items
  SELECT jsonb_build_object(
    'id', i.id,
    'invoice_number', i.invoice_number,
    'invoice_date', i.invoice_date,
    'due_date', i.due_date,
    'status', i.status,
    'currency', i.currency,
    'exchange_rate', i.exchange_rate,
    'subtotal', i.subtotal,
    'vat_amount', i.vat_amount,
    'total', i.total,
    'subtotal_sek', i.subtotal_sek,
    'vat_amount_sek', i.vat_amount_sek,
    'total_sek', i.total_sek,
    'vat_treatment', i.vat_treatment,
    'vat_rate', i.vat_rate,
    'moms_ruta', i.moms_ruta,
    'your_reference', i.your_reference,
    'our_reference', i.our_reference,
    'notes', i.notes,
    'reverse_charge_text', i.reverse_charge_text,
    'customer', jsonb_build_object('id', c.id, 'name', c.name),
    'items', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', ii.id,
        'sort_order', ii.sort_order,
        'description', ii.description,
        'quantity', ii.quantity,
        'unit', ii.unit,
        'unit_price', ii.unit_price,
        'line_total', ii.line_total
      ) ORDER BY ii.sort_order)
      FROM invoice_items ii WHERE ii.invoice_id = v_invoice_id
    )
  )
  INTO v_result
  FROM invoices i
  LEFT JOIN customers c ON c.id = i.customer_id
  WHERE i.id = v_invoice_id;

  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_invoice_with_items(jsonb, jsonb) TO authenticated;

-- =============================================================================
-- 3. Calendar Feed Security Improvements
-- =============================================================================

-- Add expiry and token versioning columns for calendar feed tokens
ALTER TABLE calendar_feeds ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE calendar_feeds ADD COLUMN IF NOT EXISTS token_version integer DEFAULT 1;
