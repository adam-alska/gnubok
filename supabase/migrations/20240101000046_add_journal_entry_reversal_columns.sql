-- Add storno/correction link columns to journal_entries
-- These are required for ändringsverifikationer (correction entries) per BFL 5 kap.
-- The reverseEntry() and correctEntry() functions in engine.ts / storno-service.ts
-- depend on these columns to create bidirectional links between entries.

-- Link to storno entry that reversed this entry
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS reversed_by_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;

-- Link to the original entry that this storno reverses
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS reverses_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;

-- Link to the original entry in a correction chain (storno + new correct entry)
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS correction_of_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;

-- Indexes for FK lookups
CREATE INDEX IF NOT EXISTS idx_journal_entries_reversed_by_id ON public.journal_entries (reversed_by_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_reverses_id ON public.journal_entries (reverses_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_correction_of_id ON public.journal_entries (correction_of_id);
