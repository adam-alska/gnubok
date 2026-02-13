-- Add authorization_id column to bank_connections table
-- This column stores the Enable Banking authorization_id before a session is created

ALTER TABLE bank_connections
ADD COLUMN IF NOT EXISTS authorization_id TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bank_connections_authorization_id
ON bank_connections(authorization_id)
WHERE authorization_id IS NOT NULL;

-- Drop old requisition_id column if it exists (no longer used)
ALTER TABLE bank_connections
DROP COLUMN IF EXISTS requisition_id;
