-- Add INTEGRITY_FAILURE to audit_log action CHECK constraint
-- The verify cron (app/api/documents/verify/cron) inserts INTEGRITY_FAILURE
-- but the original CHECK constraint in migration 014 did not include it,
-- causing all integrity failure logging to silently fail.

ALTER TABLE public.audit_log DROP CONSTRAINT audit_log_action_check;

ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_action_check CHECK (action IN (
  'INSERT', 'UPDATE', 'DELETE',
  'COMMIT', 'REVERSE', 'CORRECT',
  'LOCK_PERIOD', 'CLOSE_PERIOD',
  'DOCUMENT_DELETE_BLOCKED', 'RETENTION_BLOCK',
  'SECURITY_EVENT',
  'INTEGRITY_FAILURE'
));
