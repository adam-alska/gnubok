---
name: supabase-migration
description: "Generate Supabase database migrations for the erp-base project with correct RLS policies, triggers, indexes, and Swedish accounting constraints. Use when creating new tables, adding columns, modifying constraints (e.g. source_type CHECK), or any DDL operation on the Supabase database. Ensures legal compliance with BFL 7-year retention, immutability triggers, and period lock enforcement."
---

# Supabase Migration Generator

## Migration Numbering

Series: `20240101000001` through `20240101000028`. Next: `20240101000029`. Increment from there.

## New Table — Complete Template

Every new table requires ALL five parts. Missing any is a bug.

```sql
-- 1. Table with UUID PK + user_id FK
CREATE TABLE public.tablename (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- domain columns --
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. RLS
ALTER TABLE public.tablename ENABLE ROW LEVEL SECURITY;

-- 3. All four CRUD policies
CREATE POLICY "Users can view own tablename"
  ON public.tablename FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tablename"
  ON public.tablename FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tablename"
  ON public.tablename FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tablename"
  ON public.tablename FOR DELETE USING (auth.uid() = user_id);

-- 4. Indexes (minimum: user_id + any FK/filter columns)
CREATE INDEX idx_tablename_user_id ON public.tablename (user_id);

-- 5. updated_at trigger
CREATE TRIGGER set_updated_at_tablename
  BEFORE UPDATE ON public.tablename
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Audit trigger
CREATE TRIGGER audit_tablename
  AFTER INSERT OR UPDATE OR DELETE ON public.tablename
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
```

## Child Tables (No Direct user_id)

Tables owned via parent use subquery-based RLS:

```sql
CREATE POLICY "Users can view own child" ON public.child_table
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parent_table pt
      WHERE pt.id = child_table.parent_id AND pt.user_id = auth.uid()
    )
  );
-- Repeat for INSERT (WITH CHECK), UPDATE, DELETE
```

## Expanding source_type CHECK

When adding a new journal entry source type, expand the constraint:

```sql
ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;
ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_source_type_check
  CHECK (source_type IN (
    'manual','bank_transaction','invoice_created','invoice_paid',
    'invoice_cash_payment','credit_note','salary_payment',
    'opening_balance','year_end','storno','correction','import','system',
    'supplier_invoice_registered','supplier_invoice_paid',
    'supplier_invoice_cash_payment','supplier_credit_note',
    'NEW_TYPE_HERE'
  ));
```

## Protected Triggers — NEVER Modify

Migration `20240101000017` defines legally-required triggers:
- `enforce_journal_entry_immutability` — blocks edits/deletes on posted/reversed entries
- `enforce_journal_entry_line_immutability` — blocks line mods on committed entries
- `enforce_period_lock` — blocks writes to closed/locked periods
- `block_document_deletion` — prevents deletion of docs linked to committed entries
- `enforce_retention_journal_entries` — 7-year retention
- `set_committed_at` / `calculate_retention_expiry` — auto-set timestamps

## Apply

Use `mcp__plugin_supabase_supabase__apply_migration` with snake_case `name`. Never modify existing migration files.

## Common Mistakes

1. Missing `ENABLE ROW LEVEL SECURITY` — table publicly accessible
2. Missing DELETE policy — users can't remove own records
3. Missing `updated_at` trigger — column never updates
4. Missing audit trigger — no audit trail
5. Hardcoded UUIDs in data migrations — use subqueries
6. Forgetting `source_type` CHECK expansion for new entry generators
