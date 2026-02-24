# CLAUDE.md — erp-base

## Project Overview

erp-base is a Swedish-focused accounting SaaS for sole traders (enskild firma) and limited companies (aktiebolag). It implements double-entry bookkeeping compliant with Swedish accounting law (Bokforingslagen), including VAT handling, tax reporting, and 7-year document retention.

**Tech stack**: Next.js 16 (App Router), React 19, TypeScript (strict), Supabase (PostgreSQL + RLS + magic link auth), Tailwind CSS 4 + shadcn/ui, Vercel hosting.

**Integrations**: Enable Banking (PSD2), Anthropic SDK, LangChain, OpenAI (embeddings), Resend (email), web-push (VAPID).

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
                          receipts, deadlines, settings, help, import,
                          extensions, e/[sector]/[slug])
  (public)/               Public invoice action links (no auth)
  api/                    API routes organized by domain

components/
  ui/                     shadcn/ui primitives (button, card, dialog, table, etc.)
  bookkeeping/            Chart of accounts manager, account combobox, add/edit dialogs,
                          journal entry form/list/review, document upload, correction dialog
  chat/                   ChatWidget, ChatPanel, ChatInput, ChatMessage
  customers/              CustomerForm
  dashboard/              DashboardContent, DashboardNav, FSkattWarningCard
  deadlines/              DeadlineCard, DeadlineFilters, DeadlineForm, DeadlineList,
                          TaxTodoWidget, UpcomingDeadlinesWidget
  extensions/             Extension marketplace UI (ExtensionCard, SectorCard,
                          ExtensionToggleButton, workspace components,
                          per-sector subdirectories, shared reusable components)
  import/                 Bank file import workflow components (SIE + bank file steps)
  invoices/               InvoiceReviewContent
  onboarding/             NewUserChecklist, setup step components
  reports/                Report views (BankReconciliationView, charts)
  settings/               CalendarFeedSettings
  suppliers/              SupplierForm, SupplierInvoiceReviewContent
  transactions/           Transaction list, categorization, booking, swipe review,
                          batch operations, invoice matching, VAT treatment

extensions/               Sector-based extension hierarchy
  general/                General-purpose extensions (all businesses)
    ai-categorization/    AI-powered transaction categorization
    ai-chat/              Claude-based chat assistant (LangChain RAG)
    calendar/             Payment calendar views, deadline cards, payment summary
    enable-banking/       PSD2 bank integration (opt-in, commented out in loader)
    example-logger/       Minimal reference extension (not loaded)
    invoice-inbox/        Supplier invoice intake via email/upload with AI extraction
    push-notifications/   Web push notification system
    receipt-ocr/          Receipt image OCR processing (includes components/pages)
    user-description-match/ User description matching for transaction categorization
  restaurant/             Restaurant & cafe sector
    food-cost/            Food cost percentage calculator
    earnings-per-liter/   Revenue per liter of alcohol
    pos-import/           POS Z-report import
    tip-tracking/         Tip tracking per shift/employee
  construction/           Construction & trades sector
    rot-calculator/       ROT tax deduction calculator
    project-cost/         Project cost tracking
  hotel/                  Hotel & lodging sector
    revpar/               Revenue Per Available Room
    occupancy/            Occupancy rate tracking
  tech/                   IT & consulting sector
    billable-hours/       Billable hours & utilization rate
    project-billing/      Project billing analysis
  ecommerce/              E-commerce sector
    shopify-import/       Shopify order import
    multichannel-revenue/ Multi-channel revenue analysis
  ne-bilaga/              NE tax form attachment generation (top-level)
  sru-export/             SRU file export (top-level)

lib/
  api/                    Zod validation schemas and utilities for API routes
    schemas.ts            Zod schemas for all API request bodies and query params
    validate.ts           validateBody() and validateQuery() helpers
  bookkeeping/            Core journal entry engine and all entry generators
    engine.ts             Draft/commit workflow, balance validation, voucher numbering
    invoice-entries.ts    Sales invoice journal entries (supports per-line VAT rates)
    transaction-entries.ts Bank transaction journal entries
    supplier-invoice-entries.ts Purchase invoice journal entries
    category-mapping.ts   Category-to-BAS-account mapping
    mapping-engine.ts     Rule-based auto-categorization (MCC codes, merchant patterns)
    vat-entries.ts        VAT line generation
    bas-reference.ts      BAS account catalog (~180 accounts with metadata, SRU codes)
    account-descriptions.ts Human-readable account name lookup
    booking-templates.ts  Booking template patterns for AI suggestions
    template-embeddings.ts AI embeddings for booking template matching
    client-account-names.ts Custom account name management
    validate-period-duration.ts Fiscal period duration validation (BFL 3 kap.)
    handlers/             Booking handler functions (supplier-invoice-handler.ts)
  core/
    bookkeeping/          Period service, storno reversal, year-end closing
    documents/            Document archive (upload, versioning, SHA-256 integrity)
    audit/                Audit trail service
    tax/                  Tax code service
  calendar/               Calendar utilities, ICS feed generation
  currency/               Riksbanken exchange rates
  deadlines/              Tax deadline tracking, status engine
  email/                  Email service (Resend), invoice/reminder templates
  errors/                 Error message utilities (get-error-message.ts)
  events/                 Event bus (bus.ts, types.ts)
  extensions/             Extension system
    loader.ts             FIRST_PARTY_EXTENSIONS array, static imports
    registry.ts           Runtime extension registry
    types.ts              Extension, Sector, ExtensionDefinition, toggle types
    sectors.ts            Sector & extension metadata registry (pure data)
    hooks.ts              React hooks for extension state
    context-factory.ts    Extension context builder
    toggle-check.ts       Extension enable/disable logic
    validation.ts         Extension data validation
    workspace-registry.tsx Extension workspace component registry
    icon-resolver.tsx     Dynamic icon lookup for extensions
    use-account-totals.ts Hook for account balance queries
    use-extension-data.ts Hook for extension-specific data
    invoice-inbox-utils.ts Utilities for supplier invoice inbox
    use-mock-data.ts      Mock data utilities for development
  hooks/                  React hooks (use-unsaved-changes.ts)
  import/                 SIE parser, SIE import orchestrator, bank file parser
    bank-file/            Bank file parser with format modules
      formats/            camt053, generic-csv, handelsbanken, nordea, seb, swedbank,
                          ica-banken, lansforsakringar, lunar, skandia
  invoices/               VAT rules, invoice matching, PDF template, reminder processor
  reconciliation/         Bank reconciliation engine (4-pass matching algorithm)
  reports/                Financial reports (trial-balance, income-statement,
                          balance-sheet, vat-declaration, sie-export,
                          supplier-ledger, supplier-reconciliation,
                          general-ledger, journal-register,
                          ar-ledger, ar-reconciliation, monthly-breakdown)
  supabase/               Client setup (client.ts = browser, server.ts = server/admin,
                          fetch-all.ts = pagination helper, middleware.ts)
  tax/                    Tax calculations, deadlines, deadline generator,
                          Swedish holidays, expense warnings
  transactions/           Transaction processing, category suggestions
  vat/                    VAT utilities (VIES client for EU VAT validation)
  init.ts                 Extension loader (idempotent, called by API routes)
  logger.ts               Centralized logging utility
  utils.ts                Shared utility functions

types/index.ts            Canonical type definitions (single source of truth)
types/chat.ts             Chat-specific type definitions
tests/helpers.ts          Mock factories and fixture builders
supabase/migrations/      SQL migration files
scripts/                  Utility scripts (clear-user-data.sql, copy-extensions.mjs,
                          move-extensions.js, setup-phase8.js)
dev_docs/                 Project documentation (BAS account guides, gap analysis,
                          Enable Banking docs, Bokio reference screenshots)
extensions.md             Extension system design document (architecture, data patterns,
                          sector model, workspace pattern, migration plan)
```

### Key Relationships

- **All journal entry creation** routes through `lib/bookkeeping/engine.ts`. The entry generators (`invoice-entries.ts`, `transaction-entries.ts`, `supplier-invoice-entries.ts`) call `createJournalEntry()` from the engine.
- **API routes** that emit events must call `ensureInitialized()` (from `lib/init.ts`) at module level to load extensions.
- **Event bus** (`lib/events/bus.ts`) is a module-level singleton. Core services emit, extensions subscribe.
- **Supabase clients**: browser (`lib/supabase/client.ts`), server with user cookies (`createClient()` from `lib/supabase/server.ts`), and service role (`createServiceClient()`).
- **Extension sector system**: Extensions are organized by business sector (`lib/extensions/sectors.ts`). Users can browse/toggle extensions via the marketplace UI (`app/(dashboard)/extensions/`). Sector-specific extension workspaces are rendered at `app/(dashboard)/e/[sector]/[slug]/`.

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
| `createInvoiceJournalEntry()` | `invoice-entries.ts` | Debit 1510, Credit 30xx + 26xx VAT (per-line VAT rates) |
| `createInvoicePaymentJournalEntry()` | `invoice-entries.ts` | Debit 1930, Credit 1510 |
| `createCreditNoteJournalEntry()` | `invoice-entries.ts` | Reverses original invoice entry (per-rate lines) |
| `createInvoiceCashEntry()` | `invoice-entries.ts` | Cash method: revenue + VAT at payment (per-rate) |
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

### Per-Line VAT

Invoice items support individual `vat_rate` values, enabling mixed-rate invoices. The helper `generatePerRateLines()` in `invoice-entries.ts` groups items by VAT rate and creates separate revenue + VAT account lines per rate group. Available rates depend on customer type — use `getAvailableVatRates(customerType, vatNumberValidated)` from `lib/invoices/vat-rules.ts`.

### Bank Reconciliation

The reconciliation engine (`lib/reconciliation/bank-reconciliation.ts`) matches bank transactions to journal entry lines on account 1930 using a 4-pass algorithm:

| Pass | Method | Confidence | Match Criteria |
|------|--------|------------|----------------|
| 1 | `auto_exact` | 0.95 | Exact amount + exact date |
| 2 | `auto_reference` | 0.90 | Exact amount + reference/description match |
| 3 | `auto_date_range` | 0.85 | Exact amount + date within ±3 days |
| 4 | `auto_fuzzy` | 0.75 | Fuzzy amount (±0.01) + exact date |

Manual linking (`manual` method) is also supported. Only SEK transactions are reconciled. Greedy assignment prevents double-matching.

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

Extensions are first-party plugins organized by business sector in the `/extensions/` directory, loaded statically at startup.

### Sector System

Extensions are grouped into sectors defined in `lib/extensions/sectors.ts`. Each sector targets a specific industry (restaurant, construction, hotel, tech, ecommerce) or serves all businesses (general). The sector registry provides metadata used by the extension marketplace UI.

Key types (from `lib/extensions/types.ts`):
- `SectorSlug` — `'general' | 'restaurant' | 'construction' | 'hotel' | 'tech' | 'ecommerce'`
- `ExtensionDefinition` — Marketplace metadata (slug, name, sector, category, icon, dataPattern, description)
- `ExtensionCategory` — `'import' | 'operations' | 'reports' | 'accounting'`
- `ExtensionDataPattern` — `'core' | 'manual' | 'both'` (how extension accesses data)
- `ExtensionToggle` — Per-user enable/disable state for extensions

### Creating a New Extension

1. Create `extensions/<sector>/<name>/index.ts`
2. Export an object implementing the `Extension` interface from `lib/extensions/types.ts`
3. Add a static import to the `FIRST_PARTY_EXTENSIONS` array in `lib/extensions/loader.ts`
4. Add metadata to the appropriate sector in `lib/extensions/sectors.ts`
5. Extensions **cannot** use dynamic imports (Next.js bundling constraint)

### Currently Loaded Extensions (FIRST_PARTY_EXTENSIONS)

```
receiptOcrExtension              @/extensions/general/receipt-ocr
aiCategorizationExtension        @/extensions/general/ai-categorization
pushNotificationsExtension       @/extensions/general/push-notifications
sruExportExtension               @/extensions/sru-export
neBilagaExtension                @/extensions/ne-bilaga
aiChatExtension                  @/extensions/general/ai-chat
invoiceInboxExtension            @/extensions/general/invoice-inbox
calendarExtension                @/extensions/general/calendar
userDescriptionMatchExtension    @/extensions/general/user-description-match
# enableBankingExtension         @/extensions/general/enable-banking  (commented out, opt-in)
```

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

See `extensions/general/example-logger/index.ts`:

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
| `transaction.reconciled` | `{ transaction, journalEntryId, method, userId }` |
| `bank.statement_received` | `{ statement, userId }` |
| `bank.payment_notification` | `{ notification, userId }` |
| `period.locked` | `{ period, userId }` |
| `period.year_closed` | `{ period, userId }` |
| `customer.created` | `{ customer, userId }` |
| `customer.pseudonymized` | `{ customerId, userId }` |
| `receipt.extracted` | `{ receipt, documentId, confidence, userId }` |
| `receipt.matched` | `{ receipt, transaction, confidence, autoMatched, userId }` |
| `receipt.confirmed` | `{ receipt, businessTotal, privateTotal, userId }` |
| `supplier_invoice.received` | `{ inboxItem, userId }` |
| `supplier_invoice.extracted` | `{ inboxItem, confidence, userId }` |
| `supplier_invoice.confirmed` | `{ inboxItem, supplierInvoice, userId }` |
| `audit.security_event` | `{ event, userId }` |

### Event Bus Behavior

- Handlers run concurrently via `Promise.allSettled` — a failing handler never crashes the emitter
- Module-level singleton, persists across requests in the same process
- One-way: core services emit, extensions subscribe
- Call `eventBus.clear()` in tests to reset state

---

## Testing Guidelines

### Scope

Test business logic in `lib/` and API routes in `app/api/`. No component tests, no E2E tests.

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
- `makeInvoice()` — Invoice with default customer, amounts, dates
- `makeCustomer()` — Customer with default name, address
- `makeSupplier()` — Supplier with default details
- `makeSupplierInvoice()` — Supplier invoice with default amounts
- `makeCompanySettings()` — Company settings with defaults
- `makeInvoiceInboxItem()` — Invoice inbox item for supplier invoice intake
- `makeExtensionToggle()` — Extension toggle state

### Patterns

- Always mock `@/lib/supabase/server` to avoid real DB calls
- Use `vi.clearAllMocks()` and `eventBus.clear()` in `beforeEach`
- Test balance validation edge cases (floating point precision, zero amounts)
- Test error paths (missing fiscal period, unbalanced entries)
- Verify events are emitted correctly

### API Route Tests

- Colocated `__tests__/` directories alongside route files (e.g., `app/api/invoices/__tests__/route.test.ts`)
- Mock `@/lib/supabase/server`, `@/lib/init`, and lib functions — do NOT re-test lib business logic
- Use `createMockRequest()`, `parseJsonResponse()`, `createMockRouteParams()` from `tests/helpers.ts`
- Use `createQueuedMockSupabase()` for routes with multiple sequential Supabase calls
- Test: auth (401), validation (400), not found (404), errors (500), happy path, non-blocking journal entry failures

### Reference Tests

- `lib/api/__tests__/schemas.test.ts` — Zod schema validation
- `lib/api/__tests__/validate.test.ts` — Body/query validation helpers
- `lib/bookkeeping/__tests__/engine.test.ts` — Balance validation
- `lib/bookkeeping/__tests__/invoice-entries.test.ts` — Per-line VAT, mixed-rate invoices, credit notes
- `lib/bookkeeping/__tests__/mapping-engine.test.ts` — Auto-categorization rule matching
- `lib/bookkeeping/__tests__/category-mapping.test.ts` — Category-to-account mapping
- `lib/bookkeeping/__tests__/booking-templates.test.ts` — Booking template patterns
- `lib/bookkeeping/__tests__/template-embeddings.test.ts` — AI embedding matching
- `lib/bookkeeping/__tests__/validate-period-duration.test.ts` — Fiscal period duration
- `lib/bookkeeping/handlers/__tests__/supplier-invoice-handler.test.ts` — Supplier booking handler
- `lib/core/bookkeeping/__tests__/storno-service.test.ts` — Complex mock queues
- `lib/core/bookkeeping/__tests__/period-service.test.ts` — Fiscal period management
- `lib/core/bookkeeping/__tests__/year-end-service.test.ts` — Year-end closing
- `lib/core/documents/__tests__/document-service.test.ts` — Storage mocking
- `lib/core/tax/__tests__/tax-code-service.test.ts` — Tax code management
- `lib/currency/__tests__/riksbanken.test.ts` — Exchange rate fetching
- `lib/events/__tests__/bus.test.ts` — Event bus behavior
- `lib/extensions/__tests__/registry.test.ts` — Extension registration
- `lib/extensions/__tests__/loader.test.ts` — Extension loader
- `lib/extensions/__tests__/toggle-check.test.ts` — Extension toggle logic
- `lib/extensions/__tests__/validation.test.ts` — Extension data validation
- `lib/extensions/__tests__/sectors.test.ts` — Sector registry
- `lib/extensions/__tests__/context-factory.test.ts` — Extension context builder
- `lib/extensions/__tests__/invoice-inbox-utils.test.ts` — Invoice inbox utilities
- `lib/import/__tests__/sie-parser.test.ts` — SIE file parsing
- `lib/import/__tests__/sie-import.test.ts` — SIE import orchestration
- `lib/import/__tests__/account-mapper.test.ts` — SIE account mapping
- `lib/import/bank-file/__tests__/parser.test.ts` — Bank file format parsing
- `lib/reconciliation/__tests__/bank-reconciliation.test.ts` — Reconciliation matching algorithm
- `lib/reports/__tests__/vat-declaration.test.ts` — VAT declaration report
- `lib/tax/__tests__/deadline-config.test.ts` — Tax deadline configuration
- `lib/transactions/__tests__/ingest.test.ts` — Transaction ingestion and dedup
- `lib/vat/__tests__/vies-client.test.ts` — VIES VAT number validation

---

## Database & Migrations

### Location

`supabase/migrations/` — currently 41 files numbered `20240101000001` through `20240101000041`.

### Naming Convention

`YYYYMMDD00NNNN_descriptive_name.sql` — next migration: `20240101000042_*.sql`

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

### Recent Migrations

- **Migration 030 (`bank_reconciliation`)** — Adds `reconciliation_method` column to `transactions` (CHECK constraint for method types), indexes for unmatched transaction lookup, and RPC `get_unlinked_1930_lines()` for finding unreconciled GL lines.
- **Migration 031 (`invoice_document_type`)** — Adds `document_type` column to `invoices` (CHECK: invoice/proforma/delivery_note, default 'invoice') and `converted_from_id` FK for tracking proforma-to-invoice conversions.
- **Migration 032 (`add_accounting_method`)** — Adds `accounting_method` column to `company_settings` (CHECK: accrual/cash, default 'accrual') to support kontantmetoden vs faktureringsmetoden.
- **Migration 033 (`ai_chat_schema`)** — AI chat conversation and message storage.
- **Migration 034 (`fix_extension_data_trigger`)** — Fixes extension data trigger.
- **Migration 035 (`fix_push_notifications`)** — Push notifications schema fix.
- **Migration 036 (`fix_enable_banking`)** — Enable Banking schema fix.
- **Migration 037 (`extension_toggles`)** — Extension toggle table for per-user enable/disable.
- **Migration 038 (`fix_match_documents_search_path`)** — Fixes search path for document matching function.
- **Migration 039 (`invoice_inbox`)** — Invoice inbox table for supplier invoice intake via email/upload.
- **Migration 040 (`booking_template_embeddings`)** — Booking templates with AI embeddings for suggestion matching.
- **Migration 041 (`user_description_matching`)** — User description matching for transaction categorization.

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
import { validateBody } from '@/lib/api/validate'
import { CreateInvoiceSchema } from '@/lib/api/schemas'

ensureInitialized()  // Module-level — loads extensions for event emission

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Validate request body with Zod schema
  const result = await validateBody(request, CreateInvoiceSchema)
  if (!result.success) return result.response
  const { data } = result

  // Business logic using validated `data`...
  // Always filter by user_id (defense in depth alongside RLS)
  // Wrap journal entry creation in try/catch (non-blocking side effect)
  // Emit events after successful operations

  return NextResponse.json({ data: result })
}
```

**Key conventions**:
- Call `ensureInitialized()` at module level in any route that emits events
- **Validate all input** with `validateBody()` / `validateQuery()` from `lib/api/validate.ts` using schemas from `lib/api/schemas.ts`
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
RESEND_API_KEY                    # Resend email service API key
RESEND_FROM_EMAIL                 # Sender email for transactional mail
RESEND_WEBHOOK_SECRET             # Webhook auth for Resend
ENABLE_BANKING_APP_ID             # Enable Banking app ID
ENABLE_BANKING_PRIVATE_KEY        # Enable Banking private key (base64-encoded)
ENABLE_BANKING_SANDBOX            # Enable Banking sandbox mode flag
ANTHROPIC_API_KEY                 # Claude API key (ai-chat)
OPENAI_API_KEY                    # OpenAI API key (embeddings)
NEXT_PUBLIC_APP_URL               # App base URL
CRON_SECRET                       # Auth secret for Vercel cron jobs
NEXT_PUBLIC_VAPID_PUBLIC_KEY      # Web push public key
VAPID_PRIVATE_KEY                 # Web push private key
VAPID_SUBJECT                     # VAPID subject (mailto: URI) for web push
```

## Other
Never create a NUL/nul file: C:\Users\emilm\projects\erp-base\NUL
