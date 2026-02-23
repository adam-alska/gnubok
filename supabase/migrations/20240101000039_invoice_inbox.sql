-- Invoice Inbox: table for incoming supplier invoices (email + upload)
-- Supports AI extraction, supplier matching, and confirm-to-create workflow

CREATE TABLE public.invoice_inbox_items (
  id                          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status                      text NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','processing','ready','confirmed','rejected','error')),
  source                      text NOT NULL DEFAULT 'upload'
                                CHECK (source IN ('email','upload')),
  email_from                  text,
  email_subject               text,
  email_received_at           timestamptz,
  document_id                 uuid REFERENCES public.document_attachments(id) ON DELETE SET NULL,
  extracted_data              jsonb,
  confidence                  numeric,
  matched_supplier_id         uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  created_supplier_invoice_id uuid REFERENCES public.supplier_invoices(id) ON DELETE SET NULL,
  error_message               text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.invoice_inbox_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_inbox_items_select"
  ON public.invoice_inbox_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "invoice_inbox_items_insert"
  ON public.invoice_inbox_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "invoice_inbox_items_update"
  ON public.invoice_inbox_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "invoice_inbox_items_delete"
  ON public.invoice_inbox_items FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_invoice_inbox_items_user_id
  ON public.invoice_inbox_items(user_id);

CREATE INDEX idx_invoice_inbox_items_user_status
  ON public.invoice_inbox_items(user_id, status);

CREATE INDEX idx_invoice_inbox_items_user_created
  ON public.invoice_inbox_items(user_id, created_at DESC);

-- updated_at trigger
CREATE TRIGGER invoice_inbox_items_updated_at
  BEFORE UPDATE ON public.invoice_inbox_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
