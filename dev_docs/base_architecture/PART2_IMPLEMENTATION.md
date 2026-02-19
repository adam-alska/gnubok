# Part 2: Period Management & Year-End Closing

## Overview

Part 2 implements **year-end closing (årsbokslut)** — the process that legally closes a fiscal year per Bokföringslagen. This includes period locking, closing entry generation, opening balance propagation, and the API surface to drive the workflow.

**Depends on Part 1:** immutable ledger, audit trail, tax codes, document archive, period lock enforcement, retention protection.

---

## What Was Built

### Migration 19: Period Closing Metadata

**File:** `supabase/migrations/20240101000019_period_closing.sql`

Three new columns on `fiscal_periods`:

| Column | Type | Purpose |
|--------|------|---------|
| `closing_entry_id` | `uuid FK → journal_entries` | Links to the year-end closing journal entry |
| `opening_balance_entry_id` | `uuid FK → journal_entries` | Links to the opening balance entry in this period |
| `previous_period_id` | `uuid FK → fiscal_periods` | Chain link to the prior period for validation |

One new trigger:

- **`enforce_opening_balance_immutability`** — Once `opening_balance_entry_id` or `closing_entry_id` are set, they cannot be changed. This prevents tampering with the closing chain after the fact.

---

### TypeScript Types

**File:** `types/index.ts`

Extended `FiscalPeriod` with the three new nullable fields.

New interfaces:

| Interface | Purpose |
|-----------|---------|
| `YearEndValidation` | Result of readiness check: `ready`, `errors[]`, `warnings[]`, `draftCount`, `voucherGaps[]`, `trialBalanceBalanced` |
| `YearEndPreview` | Preview of closing: `netResult`, `closingAccount` (2099/2010), `closingLines[]`, `resultAccountSummary[]` |
| `YearEndResult` | Result of execution: `closingEntry`, `nextPeriod`, `openingBalanceEntry` |
| `PeriodStatus` | Status summary: lock/close/draft/opening state |

---

### Period Service

**File:** `lib/core/bookkeeping/period-service.ts`

| Function | What it does |
|----------|-------------|
| `lockPeriod(userId, fiscalPeriodId)` | Sets `locked_at = now()`. Validates period exists, belongs to user, isn't already locked/closed. After locking, the `enforce_period_lock` trigger (from Part 1) blocks new journal entries. |
| `closePeriod(userId, fiscalPeriodId)` | Sets `is_closed = true, closed_at = now()`. Requires: already locked AND `closing_entry_id` is set. This is the final, permanent state. |
| `createNextPeriod(userId, currentPeriodId)` | Creates the next fiscal year. Computes dates from the current period's length to handle **brutet räkenskapsår** (broken fiscal years, e.g. Jul–Jun). Sets `previous_period_id` for chain validation. Auto-generates name like "FY 2025" or "FY 2025/2026". |
| `getPeriodStatus(userId, fiscalPeriodId)` | Returns a summary: `is_locked`, `is_closed`, `has_closing_entry`, `has_opening_balances`, `draft_count`, `next_period_exists`. |

---

### Year-End Service

**File:** `lib/core/bookkeeping/year-end-service.ts`

This is the core new logic.

#### `validateYearEndReadiness(userId, fiscalPeriodId)` → `YearEndValidation`

Checks preconditions before allowing year-end closing:

- **Blocking errors** (prevent closing):
  - Period already closed
  - Closing entry already exists
  - Draft journal entries exist (must be posted or deleted)
  - Trial balance is not balanced
- **Warnings** (informational):
  - Voucher number gaps detected (via `detect_voucher_gaps()` SQL function)
  - No posted entries in the period

#### `previewYearEndClosing(userId, fiscalPeriodId)` → `YearEndPreview`

Generates a preview without persisting anything:

1. Looks up `entity_type` from `company_settings` → determines closing account:
   - **Aktiebolag (AB):** account `2099` (Årets resultat)
   - **Enskild firma (EF):** account `2010` (Eget kapital)
2. Runs income statement to get `net_result`
3. Gets trial balance, filters to class 3–8 accounts
4. For each account with a non-zero balance: creates a line that zeros it
5. Adds a final balancing line to the closing account (2099/2010)
6. Returns the preview with all lines and a summary of result accounts

#### `executeYearEndClosing(userId, fiscalPeriodId)` → `YearEndResult`

Full orchestration (the main entry point):

```
1. validateYearEndReadiness()     → abort if errors
2. previewYearEndClosing()        → get closing lines
3. createJournalEntry()           → create closing entry (source_type: 'year_end')
4. UPDATE fiscal_periods          → set closing_entry_id
5. lockPeriod()                   → lock the period
6. closePeriod()                  → permanently close
7. createNextPeriod()             → create next fiscal year
8. generateOpeningBalances()      → carry forward class 1-2 balances
9. Return { closingEntry, nextPeriod, openingBalanceEntry }
```

#### `generateOpeningBalances(userId, closedPeriodId, nextPeriodId)` → `JournalEntry`

Creates opening balance entries in the new period:

1. Gets trial balance of the closed period (after closing entry)
2. Filters to balance sheet accounts (class 1–2) with non-zero closing balance
3. Creates a journal entry with `source_type: 'opening_balance'`:
   - Debit accounts get debit opening, credit accounts get credit opening
4. Verifies the entry is balanced (total debit = total credit)
5. Sets `opening_balance_entry_id` and `opening_balances_set = true` on the next period

**Key invariant:** UB (utgående balans) of year N == IB (ingående balans) of year N+1.

---

### API Routes

All follow the existing pattern: authenticate via Supabase, delegate to service, return JSON.

| Method | Path | Handler |
|--------|------|---------|
| `POST` | `/api/bookkeeping/fiscal-periods/[id]/lock` | `lockPeriod()` |
| `GET` | `/api/bookkeeping/fiscal-periods/[id]/year-end` | `validateYearEndReadiness()` + `previewYearEndClosing()` |
| `POST` | `/api/bookkeeping/fiscal-periods/[id]/year-end` | `executeYearEndClosing()` |
| `POST` | `/api/bookkeeping/fiscal-periods/[id]/close` | `closePeriod()` |

---

## Reused Components

| Component | From | Used by |
|-----------|------|---------|
| `generateTrialBalance()` | `lib/reports/trial-balance.ts` | Balance aggregation for closing + opening entries |
| `generateIncomeStatement()` | `lib/reports/income-statement.ts` | Net result calculation |
| `createJournalEntry()` | `lib/bookkeeping/engine.ts` | Creating closing + opening entries (auto-posts) |
| `validateBalance()` | `lib/bookkeeping/engine.ts` | Pre-flight balance check |
| `detect_voucher_gaps()` | Migration 16 SQL function | Gap validation during readiness check |
| `enforce_period_lock` trigger | Migration 17 | Blocks writes after locking |
| `enforce_journal_entry_immutability` trigger | Migration 17 | Protects closing/opening entries after posting |

---

## Period Lifecycle Diagram

```
                    ┌─────────┐
                    │  OPEN   │  ← Journal entries can be posted
                    └────┬────┘
                         │ lockPeriod()
                         ▼
                    ┌─────────┐
                    │ LOCKED  │  ← No new entries (enforce_period_lock trigger)
                    └────┬────┘
                         │ closePeriod() (requires closing_entry_id)
                         ▼
                    ┌─────────┐
                    │ CLOSED  │  ← Permanent, immutable
                    └─────────┘
```

The `executeYearEndClosing()` function drives the full flow from OPEN → CLOSED in one call, including creating the closing entry, locking, closing, creating the next period, and generating opening balances.

---

## Verification Checklist

- [x] `npx tsc --noEmit` — zero TypeScript errors
- [ ] Migration 19 applies cleanly (`\d fiscal_periods` shows new columns)
- [ ] `GET /api/bookkeeping/fiscal-periods/[id]/year-end` returns preview with net result
- [ ] `POST /api/bookkeeping/fiscal-periods/[id]/year-end` creates closing entry, locks, closes, creates next period, generates opening balances
- [ ] Closing entry zeros all class 3–8 accounts
- [ ] Opening balance entry in next period matches UB of closed period (class 1–2 only)
- [ ] Closed period rejects new journal entries (period lock trigger)
- [ ] Period with draft entries → validation fails with blocking error
- [ ] Period already closed → validation fails
- [ ] EF entity type → closing goes to 2010 (not 2099)

---

## Files Changed/Created

| File | Action |
|------|--------|
| `supabase/migrations/20240101000019_period_closing.sql` | **Created** — 3 ALTER columns + 1 trigger |
| `types/index.ts` | **Modified** — extended FiscalPeriod, added 4 new interfaces |
| `lib/core/bookkeeping/period-service.ts` | **Created** — lockPeriod, closePeriod, createNextPeriod, getPeriodStatus |
| `lib/core/bookkeeping/year-end-service.ts` | **Created** — validateYearEndReadiness, previewYearEndClosing, executeYearEndClosing, generateOpeningBalances |
| `app/api/bookkeeping/fiscal-periods/[id]/lock/route.ts` | **Created** — POST lock endpoint |
| `app/api/bookkeeping/fiscal-periods/[id]/year-end/route.ts` | **Created** — GET preview + POST execute |
| `app/api/bookkeeping/fiscal-periods/[id]/close/route.ts` | **Created** — POST close endpoint |
