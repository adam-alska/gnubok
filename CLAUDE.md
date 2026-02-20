# CLAUDE.md — erp-base

## Project Overview

erp-base is a Swedish-focused accounting SaaS for sole traders (enskild firma) and limited companies (aktiebolag). It implements double-entry bookkeeping compliant with Swedish accounting law (Bokforingslagen), including VAT handling, tax reporting, and 7-year document retention.

**Tech stack**: Next.js 16 (App Router), React 19, TypeScript (strict), Supabase (PostgreSQL + RLS + magic link auth), Tailwind CSS 4 + shadcn/ui, Vercel hosting.

**Integrations**: Enable Banking (PSD2), Anthropic SDK, OpenAI (embeddings), Resend (email), web-push (VAPID).

**Path alias**: `@/*` maps to the project root (tsconfig.json).

**Language**: All code, comments, and commit messages must be in English.

---

## Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # ESLint
npm test             # Run all Vitest tests
npx vitest run <dir> # Run tests in a specific directory
```

---

## Architecture

```
app/
  (auth)/                 Login, auth callback
  (onboarding)/           6-step setup wizard
  (dashboard)/            Authenticated routes (invoices, customers, transactions,
                          bookkeeping, reports, suppliers, supplier-invoices,
                          receipts, settings, calendar, help, import)
  (public)/               Public invoice action links (no auth)
  api/                    API routes organized by domain

components/
  ui/                     shadcn/ui primitives (button, card, dialog, table, etc.)
  [feature]/              Feature-organized components (banking, invoices, suppliers, etc.)

extensions/               First-party extension implementations
  ai-categorization/      AI-powered transaction categorization
  ai-chat/                Claude-based chat assistant
  enable-banking/         PSD2 bank integration via Enable Banking (JWT auth, sync)
  ne-bilaga/              NE tax form attachment generation
  push-notifications/     Web push notification system
  receipt-ocr/            Receipt image OCR processing
  sru-export/             SRU file export
  example-logger/         Minimal reference extension (not loaded by default)

lib/
  bookkeeping/            Core journal entry engine and all entry generators
    engine.ts             Draft/commit workflow, balance validation, voucher numbering
    invoice-entries.ts    Sales invoice journal entries
    transaction-entries.ts Bank transaction journal entries
    supplier-invoice-entries.ts Purchase invoice journal entries
    category-mapping.ts   Category-to-BAS-account mapping
    mapping-engine.ts     Rule-based auto-categorization (MCC codes, merchant patterns)
    vat-entries.ts        VAT line generation
  core/
    bookkeeping/          Period service, storno reversal, year-end closing
    documents/            Document archive (upload, versioning, SHA-256 integrity)
    audit/                Audit trail service
    tax/                  Tax code service
  calendar/               Calendar and scheduling utilities
  currency/               Riksbanken exchange rates
  customers/              Customer management helpers
  deadlines/              Tax deadline tracking
  email/                  Email service (Resend integration)
  events/                 Event bus (bus.ts, types.ts)
  extensions/             Extension registry, loader, types
  import/                 SIE and bank file parser
  invoice/                VAT rules for invoicing
  invoices/               Invoice business logic helpers
  reports/                Financial reports (trial-balance, income-statement,
                          balance-sheet, vat-declaration, sie-export,
                          supplier-ledger, supplier-reconciliation,
                          general-ledger, journal-register,
                          ar-ledger, ar-reconciliation)
  supabase/               Client setup (client.ts = browser, server.ts = server/admin)
  tax/                    Tax calculations, deadlines, Swedish holidays
  transactions/           Transaction processing helpers
  init.ts                 Extension loader (idempotent, called by API routes)
  utils.ts                Shared utility functions

types/index.ts            Canonical type definitions (110+ types, single source of truth)
types/chat.ts             Chat-specific type definitions
tests/helpers.ts          Mock factories and fixture builders
supabase/migrations/      SQL migration files
dev_docs/                 Extensive project documentation (PRD, architecture, BAS guide, etc.)
```

### Key Relationships

- **All journal entry creation** routes through `lib/bookkeeping/engine.ts`. The entry generators (`invoice-entries.ts`, `transaction-entries.ts`, `supplier-invoice-entries.ts`) call `createJournalEntry()` from the engine.
- **API routes** that emit events must call `ensureInitialized()` (from `lib/init.ts`) at module level to load extensions.
- **Event bus** (`lib/events/bus.ts`) is a module-level singleton. Core services emit, extensions subscribe.
- **Supabase clients**: browser (`lib/supabase/client.ts`), server with user cookies (`createClient()` from `lib/supabase/server.ts`), and service role (`createServiceClient()`).

---

## Core Bookkeeping Engine

The bookkeeping engine (`lib/bookkeeping/engine.ts`) is the most critical system. All accounting flows route through it.

### Journal Entry Lifecycle

1. **`createDraftEntry(userId, input)`** — Creates entry with `status: 'draft'`, `voucher_number: 0`. Validates balance. Emits `journal_entry.drafted`.
2. **`commitEntry(userId, entryId)`** — Assigns voucher number via DB RPC (`next_voucher_number`, concurrent-safe). Sets `status: 'posted'`. DB trigger sets `committed_at`. Emits `journal_entry.committed`.
3. **`createJournalEntry(userId, input)`** — Convenience: draft + commit in one call. This is what all entry generators use.
4. **`reverseEntry(userId, entryId)`** — Storno reversal: swaps debit/credit, links via `reverses_id`/`reversed_by_id`. Original marked `'reversed'`.

### Entry Generators

| Function | File | Purpose |
|----------|------|---------|
| `createInvoiceJournalEntry()` | `invoice-entries.ts` | Debit 1510, Credit 30xx + 26xx VAT |
| `createInvoicePaymentJournalEntry()` | `invoice-entries.ts` | Debit 1930, Credit 1510 |
| `createCreditNoteJournalEntry()` | `invoice-entries.ts` | Reverses original invoice entry |
| `createInvoiceCashEntry()` | `invoice-entries.ts` | Cash method: revenue + VAT at payment |
| `createTransactionJournalEntry()` | `transaction-entries.ts` | Maps bank transactions via MappingResult |
| `createSupplierInvoiceRegistrationEntry()` | `supplier-invoice-entries.ts` | Debit expense + 2641, Credit 2440 |
| `createSupplierInvoicePaymentEntry()` | `supplier-invoice-entries.ts` | Debit 2440, Credit 1930 |

### Key BAS Accounts

| Account | Description |
|---------|-------------|
| `1510` | Accounts receivable |
| `1930` | Business bank account |
| `2013` | Private withdrawals (enskild firma) |
| `2440` | Accounts payable |
| `2611` / `2621` / `2631` | Output VAT 25% / 12% / 6% |
| `2614` | Output VAT reverse charge |
| `2641` | Input VAT (deductible) |
| `2645` | Calculated input VAT (EU reverse charge) |
| `2893` | Loan from shareholders (aktiebolag) |
| `3001` / `3002` / `3003` | Revenue by VAT rate (25% / 12% / 6%) |
| `3305` / `3308` | Export / EU service revenue |
| `3960` / `7960` | Exchange rate gains / losses |

### VAT Treatments

`standard_25`, `reduced_12`, `reduced_6`, `reverse_charge`, `export`, `exempt`

---

## Accounting Guard Rails

These rules exist for legal compliance and are enforced by database triggers. **Never violate them.**

1. **Committed entries are immutable.** Once `status: 'posted'`, an entry cannot be edited or deleted. Enforced by DB trigger `enforce_journal_entry_immutability`.
2. **Never delete posted entries.** Use `reverseEntry()` (storno) to cancel. The reversal creates a new entry with swapped debit/credit and bidirectional linking.
3. **Every entry must balance.** `sum(debits) === sum(credits)`, both must be `> 0`. Checked by `validateBalance()` before insert.
4. **Voucher numbers are sequential.** Assigned via DB RPC `next_voucher_number` (concurrent-safe). Never set manually.
5. **Period lock enforcement.** DB trigger `enforce_period_lock` blocks writes to closed/locked fiscal periods. Check period status before creating entries.
6. **7-year document retention.** DB triggers prevent deletion of documents linked to posted entries. `retention_expires_at` is auto-calculated as `period_end + 7 years`.
7. **Storno, never edit.** To correct an error: reverse the wrong entry, then create a new correct one. Use `correctEntry()` from `lib/core/bookkeeping/storno-service.ts` for atomic correction.
8. **Use `Math.round(x * 100) / 100` for all monetary calculations.** Never use `toFixed()` (returns strings, has rounding edge cases).
9. **Always use engine functions.** Never insert directly into `journal_entries` or `journal_entry_lines` tables. Always go through `lib/bookkeeping/engine.ts`.
10. **Account numbers are strings.** BAS account numbers like `'1930'` are always strings, never numbers.

---

## Extension Development

Extensions are first-party plugins in the `/extensions/` directory, loaded statically at startup.

### Creating a New Extension

1. Create `extensions/<name>/index.ts`
2. Export an object implementing the `Extension` interface from `lib/extensions/types.ts`
3. Add a static import to the `FIRST_PARTY_EXTENSIONS` array in `lib/extensions/loader.ts`
4. Extensions **cannot** use dynamic imports (Next.js bundling constraint)

### Extension Interface

```typescript
interface Extension {
  id: string              // Unique identifier (e.g. 'receipt-ocr')
  name: string            // Display name
  version: string         // Semver

  // Surfaces (all optional)
  routes?: RouteDefinition[]
  apiRoutes?: ApiRouteDefinition[]
  sidebarItems?: SidebarItem[]
  eventHandlers?: ExtensionEventHandler[]
  mappingRuleTypes?: MappingRuleTypeDefinition[]
  reportTypes?: ReportDefinition[]
  settingsPanel?: SettingsPanelDefinition
  taxCodes?: TaxCodeDefinition[]
  dimensionTypes?: DimensionDefinition[]

  // Lifecycle hooks
  onInstall?(ctx: ExtensionContext): Promise<void>
  onUninstall?(ctx: ExtensionContext): Promise<void>
}
```

### Minimal Example

See `extensions/example-logger/index.ts`:

```typescript
import type { Extension } from '@/lib/extensions/types'
import type { EventPayload } from '@/lib/events/types'

export const myExtension: Extension = {
  id: 'my-extension',
  name: 'My Extension',
  version: '0.1.0',
  eventHandlers: [
    {
      eventType: 'journal_entry.committed',
      handler: async (payload: EventPayload<'journal_entry.committed'>) => {
        // React to committed journal entries
      },
    },
  ],
}
```

### Available Event Types

All defined in `lib/events/types.ts`:

| Event | Payload |
|-------|---------|
| `journal_entry.drafted` | `{ entry, userId }` |
| `journal_entry.committed` | `{ entry, userId }` |
| `journal_entry.corrected` | `{ original, storno, corrected, userId }` |
| `document.uploaded` | `{ document, userId }` |
| `invoice.created` | `{ invoice, userId }` |
| `invoice.sent` | `{ invoice, userId }` |
| `invoice.paid` | `{ invoice, transaction, kursdifferens?, userId }` |
| `invoice.overdue` | `{ invoice, days, userId }` |
| `credit_note.created` | `{ creditNote, userId }` |
| `transaction.synced` | `{ transactions[], userId }` |
| `transaction.categorized` | `{ transaction, account, taxCode, userId }` |
| `bank.statement_received` | `{ statement, userId }` |
| `bank.payment_notification` | `{ notification, userId }` |
| `period.locked` | `{ period, userId }` |
| `period.year_closed` | `{ period, userId }` |
| `customer.created` | `{ customer, userId }` |
| `customer.pseudonymized` | `{ customerId, userId }` |
| `receipt.extracted` | `{ receipt, documentId, confidence, userId }` |
| `receipt.matched` | `{ receipt, transaction, confidence, autoMatched, userId }` |
| `receipt.confirmed` | `{ receipt, businessTotal, privateTotal, userId }` |
| `audit.security_event` | `{ event, userId }` |

### Event Bus Behavior

- Handlers run concurrently via `Promise.allSettled` — a failing handler never crashes the emitter
- Module-level singleton, persists across requests in the same process
- One-way: core services emit, extensions subscribe
- Call `eventBus.clear()` in tests to reset state

---

## Testing Guidelines

### Scope

Only test business logic in `lib/`. No component tests, no API route tests, no E2E tests.

### Framework

Vitest 4 with `globals: true` and `environment: 'node'`. Config in `vitest.config.ts`.

### Test Location

Colocated `__tests__/` directories alongside source files in `lib/`.

### Test Helpers (`tests/helpers.ts`)

**Supabase mock**:
```typescript
const { supabase, mockResult } = createMockSupabase()
mockResult({ data: makeTransaction(), error: null })
// supabase.from('x').select('*').eq('id', '1') resolves to the mocked result
```

**Fixture factories** (all accept `Partial<T>` overrides):
- `makeReceipt()` — Receipt with default merchant, amounts, dates
- `makeTransaction()` — Transaction with default category, amount
- `makeFiscalPeriod()` — FiscalPeriod with default date range
- `makeJournalEntry()` — Posted JournalEntry with voucher number
- `makeJournalEntryLine()` — Line with account number, zero amounts
- `makeDocumentAttachment()` — Document with hash, storage path
- `makeTaxCode()` — TaxCode with default output VAT 25%

### Patterns

- Always mock `@/lib/supabase/server` to avoid real DB calls
- Use `vi.clearAllMocks()` and `eventBus.clear()` in `beforeEach`
- Test balance validation edge cases (floating point precision, zero amounts)
- Test error paths (missing fiscal period, unbalanced entries)
- Verify events are emitted correctly

### Reference Tests

- `lib/bookkeeping/__tests__/engine.test.ts` — Balance validation
- `lib/core/bookkeeping/__tests__/storno-service.test.ts` — Complex mock queues
- `lib/core/documents/__tests__/document-service.test.ts` — Storage mocking
- `lib/events/__tests__/bus.test.ts` — Event bus behavior
- `lib/extensions/__tests__/registry.test.ts` — Extension registration

---

## Database & Migrations

### Location

`supabase/migrations/` — currently 28 files numbered `20240101000001` through `20240101000028`.

### Naming Convention

`YYYYMMDD00NNNN_descriptive_name.sql` — next migration: `20240101000029_*.sql`

### Migration Rules

1. **Always enable RLS** on new tables: `ALTER TABLE public.tablename ENABLE ROW LEVEL SECURITY;`
2. **Always create RLS policies** using `auth.uid() = user_id`:
   ```sql
   CREATE POLICY "tablename_select" ON public.tablename FOR SELECT USING (auth.uid() = user_id);
   CREATE POLICY "tablename_insert" ON public.tablename FOR INSERT WITH CHECK (auth.uid() = user_id);
   CREATE POLICY "tablename_update" ON public.tablename FOR UPDATE USING (auth.uid() = user_id);
   ```
3. **Always add `updated_at` trigger**:
   ```sql
   CREATE TRIGGER tablename_updated_at BEFORE UPDATE ON public.tablename
     FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
   ```
4. **UUID primary keys**: `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
5. **User ownership**: `user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL`
6. **Never modify existing migrations** — create new ones instead
7. **Never modify enforcement triggers** (migration `20240101000017`) — these are legally required
8. **Never hardcode IDs** in data migrations — use subqueries or variables
9. **Apply via Supabase MCP tool**: `mcp__plugin_supabase_supabase__apply_migration`
10. **Test on a branch database** before applying to production (use `create_branch` MCP tool)

### Key Enforcement Triggers (migration 017)

- `enforce_journal_entry_immutability` — Blocks edits/deletes on posted/reversed entries
- `enforce_journal_entry_line_immutability` — Blocks line modifications on committed entries
- `enforce_period_lock` — Blocks writes to closed/locked fiscal periods
- `block_document_deletion` — Prevents deletion of documents linked to committed entries
- `enforce_retention_journal_entries` — 7-year retention enforcement
- `set_committed_at` — Auto-sets timestamp on draft-to-posted transition
- `calculate_retention_expiry` — Auto-sets `retention_expires_at = period_end + 7 years`

---

## Type System

- All shared types live in `types/index.ts` — this is the single source of truth
- Import via `import type { TypeName } from '@/types'`
- When adding new domain types, add them to `types/index.ts`
- Event types are the exception — they live in `lib/events/types.ts` (since they reference domain types)

---

## API Route Patterns

Standard pattern for new API routes:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ensureInitialized } from '@/lib/init'

ensureInitialized()  // Module-level — loads extensions for event emission

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Business logic...
  // Always filter by user_id (defense in depth alongside RLS)
  // Wrap journal entry creation in try/catch (non-blocking side effect)
  // Emit events after successful operations

  return NextResponse.json({ data: result })
}
```

**Key conventions**:
- Call `ensureInitialized()` at module level in any route that emits events
- Dynamic route params use `{ params }: { params: Promise<{ id: string }> }` (Next.js 16)
- Response shapes: `{ data }` for success, `{ error }` for failures
- Journal entry creation is non-blocking: catch errors and continue

---

## Skills Usage

- **Always** use the `/frontend-design` skill when creating new UI pages or significant components. This ensures consistent use of shadcn/ui, Tailwind CSS 4, and the existing component library.
- Use the `langchain` skill when building or modifying AI features (ai-chat, ai-categorization extensions).
- Use `vercel:deploy` for deployment tasks.

---

## Git Conventions

Use **conventional commits**:

```
feat: add supplier invoice payment tracking
fix: correct VAT calculation for reduced 12% rate
refactor: extract VAT line generation into vat-entries.ts
test: add balance validation edge cases
docs: update CLAUDE.md with extension guide
```

- Atomic commits — one logical change per commit
- Branch from `main` for new work

---

## Deployment

Hosted on **Vercel** with cron jobs defined in `vercel.json`:

| Cron Job | Schedule |
|----------|----------|
| `/api/extensions/enable-banking/sync/cron` | Daily 05:00 |
| `/api/deadlines/status/cron` | Daily 06:00 |
| `/api/invoices/reminders/cron` | Daily 08:00 |
| `/api/extensions/push-notifications/cron` | Daily 09:00 |
| `/api/tax-deadlines/cron` | Yearly, January 2nd at 00:00 |
| `/api/documents/verify/cron` | Weekly, Sunday 03:00 |

### Required Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL          # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY     # Supabase anonymous key
SUPABASE_SERVICE_ROLE_KEY         # Supabase service role key
ENABLE_BANKING_APP_ID             # Enable Banking app ID
ENABLE_BANKING_PRIVATE_KEY        # Enable Banking private key (base64-encoded)
ANTHROPIC_API_KEY                 # Claude API key (ai-chat)
OPENAI_API_KEY                    # OpenAI API key (embeddings)
NEXT_PUBLIC_APP_URL               # App base URL
NEXT_PUBLIC_VAPID_PUBLIC_KEY      # Web push public key
VAPID_PRIVATE_KEY                 # Web push private key
```
