-- Add potential_invoice_id column to transactions table
-- This column stores a suggested invoice match that awaits user confirmation

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS potential_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

-- Create index for faster lookups of transactions with potential matches
CREATE INDEX IF NOT EXISTS idx_transactions_potential_invoice_id
ON transactions(potential_invoice_id)
WHERE potential_invoice_id IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN transactions.potential_invoice_id IS 'Suggested invoice match - requires user confirmation before linking';
