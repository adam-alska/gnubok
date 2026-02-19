# Part 1: Database Foundation & Compliance Core — Implementation Record

## What was implemented

8 Supabase migrations, TypeScript type updates, 4 new service files, and modifications to 3 existing files. No UI changes.

---

## Migrations

### Migration 11: ALTER Existing Tables
`supabase/migrations/20240101000011_alter_existing_tables.sql`

- `chart_of_accounts` — added `sru_code text` for Skatteverket SRU mapping
- `journal_entries` — added `committed_at timestamptz`, `reversed_by_id uuid FK→self`, `reverses_id uuid FK→self`, `correction_of_id uuid FK→self`
- `journal_entries` — expanded `source_type` CHECK to include `storno`, `correction`, `import`, `system`
- `journal_entry_lines` — added `tax_code text`, `cost_center text`, `project text`
- `fiscal_periods` — added `locked_at timestamptz`, `retention_expires_at date`

### Migration 12: Tax Code Engine
`supabase/migrations/20240101000012_tax_codes.sql`

New table `tax_codes` with columns: `id`, `user_id`, `code`, `description`, `rate`, `moms_basis_boxes text[]`, `moms_tax_boxes text[]`, `moms_input_boxes text[]`, flags (`is_output_vat`, `is_reverse_charge`, `is_eu`, `is_export`, `is_oss`, `is_system`).

RLS: select own + system (user_id IS NULL), insert/update/delete own only.

Seeded 12 system tax codes: MP1 (25%), MP2 (12%), MP3 (6%), MPI, MPI12, MPI6, IV (intra-EU), EUS (EU sale), IP (import), EXP (export), OSS, NONE.

New function `seed_tax_codes_for_user(p_user_id)` copies system codes to user scope.

### Migration 13: Document Archive
`supabase/migrations/20240101000013_document_archive.sql`

New table `document_attachments` with: storage fields (`storage_path`, `file_name`, `file_size_bytes`, `mime_type`), integrity (`sha256_hash NOT NULL`), version chain (`version`, `original_id FK→self`, `superseded_by_id FK→self`, `is_current_version`), digitization metadata (`uploaded_by`, `upload_source`, `digitization_date`), linkage (`journal_entry_id FK ON DELETE RESTRICT`, `journal_entry_line_id FK ON DELETE RESTRICT`).

No DELETE RLS policy — deletion handled by trigger in migration 17.

### Migration 14: Audit Log
`supabase/migrations/20240101000014_audit_log.sql`

New table `audit_log`: `user_id uuid NOT NULL` (no FK cascade — survives user deletion), `action text` with CHECK constraint, `table_name`, `record_id`, `actor_id`, `old_state jsonb`, `new_state jsonb`, `description`. No `updated_at` — append-only.

BEFORE UPDATE and BEFORE DELETE triggers raise exception to enforce immutability.

### Migration 15: Dimensions
`supabase/migrations/20240101000015_dimensions.sql`

Two new tables:
- `cost_centers` (`user_id`, `code`, `name`, `is_active`) with UNIQUE(user_id, code)
- `projects` (`user_id`, `code`, `name`, `is_active`, `start_date`, `end_date`) with UNIQUE(user_id, code)

Both with standard RLS and updated_at triggers.

### Migration 16: Voucher Sequence Hardening
`supabase/migrations/20240101000016_voucher_sequences.sql`

New table `voucher_sequences` (`user_id`, `fiscal_period_id`, `voucher_series`, `last_number`) for tracking sequence state.

Replaced `next_voucher_number()` with concurrent-safe version using `INSERT ON CONFLICT DO UPDATE RETURNING` (row-level lock instead of MAX+1).

New DEFERRABLE constraint trigger `check_balance_on_post` validates debit==credit when an entry transitions from draft to posted.

New function `detect_voucher_gaps(p_user_id, p_fiscal_period_id, p_series)` returns gap ranges for compliance reporting.

### Migration 17: Enforcement Triggers
`supabase/migrations/20240101000017_enforcement_triggers.sql`

8 trigger functions:

1. **`enforce_journal_entry_immutability()`** — allows draft→draft, draft→posted, posted→reversed. Blocks all other updates/deletes on committed entries.
2. **`enforce_journal_entry_line_immutability()`** — blocks modifications to lines of posted/reversed entries.
3. **`enforce_period_lock()`** — rejects journal_entries writes when `is_closed=true` OR `locked_at IS NOT NULL`.
4. **`enforce_period_lock_documents()`** — blocks document attachment to entries in locked periods.
5. **`block_document_deletion()`** — blocks deletion if linked to committed entry or within retention window. Logs blocked attempts to audit_log.
6. **`enforce_retention_journal_entries()`** — blocks journal entry deletion within 7-year retention window.
7. **`set_committed_at()`** — auto-sets `committed_at = now()` on draft→posted transition.
8. **`calculate_retention_expiry()`** — auto-sets `retention_expires_at = period_end + 7 years`. Backfills existing rows.

### Migration 18: Audit Logging Triggers
`supabase/migrations/20240101000018_audit_triggers.sql`

SECURITY DEFINER function `write_audit_log()` that detects action type from TG_OP and state transitions (draft→posted = COMMIT, posted→reversed = REVERSE, locked_at set = LOCK_PERIOD, is_closed set = CLOSE_PERIOD). Captures old_state/new_state as JSONB.

AFTER triggers on: `journal_entries`, `journal_entry_lines`, `chart_of_accounts`, `document_attachments`, `fiscal_periods`, `company_settings`, `tax_codes`.

---

## TypeScript Changes

### Modified types in `types/index.ts`

| Type | Change |
|------|--------|
| `JournalEntrySourceType` | Added `'storno' \| 'correction' \| 'import' \| 'system'` |
| `JournalEntry` | Added `committed_at`, `reversed_by_id`, `reverses_id`, `correction_of_id` |
| `JournalEntryLine` | Added `tax_code`, `cost_center`, `project` |
| `CreateJournalEntryLineInput` | Added optional `tax_code`, `cost_center`, `project` |
| `FiscalPeriod` | Added `locked_at`, `retention_expires_at` |
| `BASAccount` | Added `sru_code` |

### New types added to `types/index.ts`

- `TaxCode` interface, `TaxCodeId` union type
- `DocumentAttachment` interface, `DocumentUploadSource` type, `CreateDocumentAttachmentInput`
- `AuditLogEntry` interface, `AuditAction` union type
- `CostCenter` interface
- `Project` interface
- `VoucherGap` interface

---

## New Service Files

### `lib/core/audit/audit-service.ts`
Read-only service (audit log is written by DB triggers):
- `getAuditLog(userId, filters)` — paginated query with action/table/date filters
- `getEntityHistory(userId, tableName, recordId)` — full mutation history of one record
- `getCorrectionChain(userId, journalEntryId)` — traces original→storno→corrected via linked IDs

### `lib/core/documents/document-service.ts`
- `uploadDocument(userId, file, metadata)` — computes SHA-256 via Web Crypto, uploads to Supabase Storage, creates record
- `createNewVersion(userId, originalId, file)` — creates new version, marks old as superseded (WORM)
- `linkToJournalEntry(userId, documentId, journalEntryId)` — links document to entry
- `verifyIntegrity(userId, documentId)` — re-downloads, re-hashes, compares to stored hash

### `lib/core/tax/tax-code-service.ts`
- `getTaxCodes(userId)` — returns user codes + system codes
- `getTaxCodeByCode(userId, code)` — single lookup, user code takes precedence
- `calculateMomsFromTaxCodes(userId, periodStart, periodEnd)` — sums journal lines by tax_code, maps to moms boxes via tax_codes table
- `seedTaxCodes(userId)` — calls `seed_tax_codes_for_user` RPC

### `lib/core/bookkeeping/storno-service.ts`
- `correctEntry(userId, originalEntryId, correctedLines)` — 3-step correction:
  1. Creates storno entry with swapped debits/credits, `source_type='storno'`, `reverses_id` set
  2. Creates corrected entry with new data, `source_type='correction'`, `correction_of_id` set
  3. Marks original as reversed with `reversed_by_id` set
  4. Returns `{ reversal, corrected }`

---

## Modified Existing Files

### `lib/bookkeeping/engine.ts`

- New `buildLineInserts()` helper that includes `tax_code`, `cost_center`, `project` in all line inserts
- New `createDraftEntry(userId, input)` — inserts as draft with `voucher_number=0`, no commit
- New `commitEntry(userId, entryId)` — assigns voucher number via `next_voucher_number` RPC, transitions to posted (DB triggers handle `committed_at` and balance validation)
- Existing `createJournalEntry()` kept as convenience wrapper (create + immediate commit)
- `reverseEntry()` rewritten: now sets `reverses_id` on the reversal entry, sets `reversed_by_id` on the original, uses `source_type='storno'`, preserves dimensions on reversed lines

### `lib/reports/vat-declaration.ts`

- Added `TaxCode` import
- New `calculateVatDeclarationFromTaxCodes(userId, periodType, year, period)` — generates momsdeklaration by querying journal_entry_lines grouped by `tax_code`, then mapping via `tax_codes` table to moms boxes
- Legacy `calculateVatDeclaration()` preserved for backward compatibility (invoice/transaction/receipt approach)

### `lib/reports/sie-export.ts`

- Now fetches `cost_centers` and `projects` tables
- Outputs `#DIM 1 "Kostnadsställe"` and `#DIM 6 "Projekt"` dimension definitions
- Outputs `#OBJEKT` records for each cost center and project
- Outputs `#SRU` records from `chart_of_accounts.sru_code` after each `#KONTO`
- `#TRANS` lines now include dimension object lists: `{1 "CC01" 6 "P01"}` when cost_center/project are set

---

## Verification

- `npx tsc --noEmit` passes with zero errors
