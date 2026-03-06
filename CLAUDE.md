# CLAUDE.md — gnubok

## Project Overview

gnubok is a Swedish-focused accounting SaaS for sole traders (enskild firma) and limited companies (aktiebolag). It implements double-entry bookkeeping compliant with Swedish accounting law (Bokforingslagen), including VAT handling, tax reporting, and 7-year document retention.

**Tech stack**: Next.js 16 (App Router), React 19, TypeScript (strict), Supabase (PostgreSQL + RLS + magic link auth), Tailwind CSS 4 + shadcn/ui, Vercel hosting.

**Integrations**: Enable Banking (PSD2), Anthropic SDK, LangChain, OpenAI (embeddings), Resend (email), JSZip (archive export).

**Path alias**: `@/*` maps to the project root. **Language**: All code, comments, and commit messages in English.

---

## Commands

```bash
npm run dev              # Start dev server (runs setup:extensions first)
npm run build            # Production build (runs setup:extensions first)
npm run lint             # ESLint
npm test                 # Run all Vitest tests
npx vitest run <dir>     # Run tests in a specific directory
npm run setup:extensions # Regenerate extension registry from extensions.config.json
```

---

## Architecture

```
app/
  (auth)/              Login, auth callback
  (onboarding)/        6-step setup wizard
  (dashboard)/         Authenticated routes (invoices, customers, transactions,
                       bookkeeping, reports, suppliers, supplier-invoices,
                       receipts, deadlines, settings, help, import, extensions)
  (public)/            Public invoice action links (no auth), DPA, privacy policy
  api/                 API routes organized by domain

components/
  ui/                  shadcn/ui primitives
  bookkeeping/         Chart of accounts, journal entry form/list/review
  chat/                ChatWidget, ChatPanel
  extensions/          Extension marketplace UI, general/ workspace components
  transactions/        Transaction list, categorization, booking, VAT treatment
  (+ customers/, dashboard/, deadlines/, import/, invoices/,
     onboarding/, reports/, settings/, suppliers/)

extensions/general/    Config-driven extensions (see Extension System below)

lib/
  api/                 Zod validation schemas (schemas.ts) and helpers (validate.ts)
  bookkeeping/         Core journal entry engine and all entry generators
    engine.ts          Draft/commit workflow, balance validation, voucher numbering
    invoice-entries.ts Sales invoice journal entries (per-line VAT rates)
    transaction-entries.ts  Bank transaction journal entries
    supplier-invoice-entries.ts  Purchase invoice journal entries
    category-mapping.ts     Category-to-BAS-account mapping
    mapping-engine.ts       Rule-based auto-categorization (MCC, merchant patterns)
    bas-reference.ts        BAS account catalog (~180 accounts)
    handlers/               Booking handler functions
  core/
    bookkeeping/       Period service, storno reversal, year-end closing
    documents/         Document archive (upload, versioning, SHA-256 integrity)
    audit/             Audit trail service
    tax/               Tax code service
  email/               EmailService interface + NoopEmailService default
  events/              Event bus (bus.ts, types.ts) — singleton, core emits, extensions subscribe
  extensions/          Extension system (loader, registry, types, hooks, context-factory)
    ai-consent.ts      AI consent gate for extensions using third-party AI providers
    _generated/        Code-generated files (DO NOT EDIT)
  import/              SIE parser, bank file parser (10 Swedish bank formats)
  invoices/            VAT rules, invoice matching, PDF template, reminders
  reconciliation/      Bank reconciliation engine (4-pass matching)
  reports/             Financial reports (trial balance, income statement, balance sheet,
                       VAT declaration, SIE export, general ledger, NE-bilaga, INK2, SRU export,
                       full archive ZIP export)
  supabase/            Client setup (client.ts = browser, server.ts = server)
  tax/                 Tax calculations, deadlines, Swedish holidays
  vat/                 VIES validation, moms box mapping
  init.ts              Extension loader (idempotent, called by API routes)

types/index.ts         Canonical type definitions (single source of truth)
types/chat.ts          Chat types
tests/helpers.ts       Mock factories and fixture builders
supabase/migrations/   SQL migration files (63 files)
extensions.config.json Extension opt-in configuration
```

### Key Relationships

- **All journal entry creation** routes through `lib/bookkeeping/engine.ts` via `createJournalEntry()`.
- **API routes** that emit events must call `ensureInitialized()` (from `lib/init.ts`) at module level.
- **Event bus** (`lib/events/bus.ts`) is a module-level singleton. Handlers run via `Promise.allSettled`.
- **Supabase clients**: browser (`lib/supabase/client.ts`), server with cookies (`createClient()` from `server.ts`), service role (`createServiceClient()`).
- **Extension system**: Opt-in via `extensions.config.json`. Core builds and runs with zero extensions.
- **NE-bilaga, INK2 declaration, SRU export, and full archive export** are core reports (in `lib/reports/`), not extensions.
- **AI consent gate** (`lib/extensions/ai-consent.ts`): AI extensions (`receipt-ocr`, `ai-categorization`, `ai-chat`) require user consent before API calls. The extension catch-all route checks consent and returns `403 AI_CONSENT_REQUIRED` if missing.

---

## Core Bookkeeping Engine

The engine (`lib/bookkeeping/engine.ts`) is the most critical system. All accounting flows route through it.

### Journal Entry Lifecycle

1. **`createDraftEntry(userId, input)`** — Creates `status: 'draft'`, `voucher_number: 0`. Validates balance. Emits `journal_entry.drafted`.
2. **`commitEntry(userId, entryId)`** — Assigns voucher number via DB RPC (concurrent-safe). Sets `status: 'posted'`. Emits `journal_entry.committed`.
3. **`createJournalEntry(userId, input)`** — Draft + commit in one call. This is what all entry generators use.
4. **`reverseEntry(userId, entryId)`** — Storno reversal: swaps debit/credit, links via `reverses_id`/`reversed_by_id`.

### Entry Generators

| Function | File | Purpose |
|----------|------|---------|
| `createInvoiceJournalEntry()` | `invoice-entries.ts` | Debit 1510, Credit 30xx + 26xx VAT (per-line VAT rates) |
| `createInvoicePaymentJournalEntry()` | `invoice-entries.ts` | Debit 1930, Credit 1510 |
| `createCreditNoteJournalEntry()` | `invoice-entries.ts` | Reverses original invoice entry |
| `createTransactionJournalEntry()` | `transaction-entries.ts` | Maps bank transactions via MappingResult |
| `createSupplierInvoiceRegistrationEntry()` | `supplier-invoice-entries.ts` | Debit expense + 2641, Credit 2440 |
| `createSupplierInvoicePaymentEntry()` | `supplier-invoice-entries.ts` | Debit 2440, Credit 1930 |

### Key BAS Accounts

`1510` Accounts receivable | `1930` Business bank account | `2013` Private withdrawals (EF) | `2440` Accounts payable | `2611`/`2621`/`2631` Output VAT 25%/12%/6% | `2641` Input VAT | `2645` Calculated input VAT (EU) | `2893` Shareholder loan (AB) | `3001`/`3002`/`3003` Revenue 25%/12%/6% | `3305`/`3308` Export/EU service revenue

### VAT Treatments

`standard_25`, `reduced_12`, `reduced_6`, `reverse_charge`, `export`, `exempt`

Invoice items support individual `vat_rate` values (mixed-rate invoices). `generatePerRateLines()` in `invoice-entries.ts` groups by rate. Use `getAvailableVatRates(customerType, vatNumberValidated)` from `lib/invoices/vat-rules.ts`.

### VAT Declaration Rutor (SKV 4700)

The `VatDeclarationRutor` type maps to the Swedish tax authority's momsdeklaration form:

- **Ruta 05**: Momspliktig försäljning — total domestic taxable sales (all rates combined, from 3001+3002+3003)
- **Ruta 06/07**: Unused (momspliktiga uttag / vinstmarginalbeskattning), always 0
- **Ruta 10/11/12**: Utgående moms 25%/12%/6% — output VAT per rate (from 2611/2621/2631)
- **Ruta 39/40**: EU services / Export (from 3308/3305)
- **Ruta 48**: Ingående moms — input VAT (from 2641/2645)
- **Ruta 49**: Moms att betala/återfå = (ruta 10 + 11 + 12) - ruta 48

The `VatDeclaration.breakdown.invoices` also includes `base25`/`base12`/`base6` for per-rate revenue breakdown in the UI.

### Bank Reconciliation

`lib/reconciliation/bank-reconciliation.ts` — 4-pass matching on account 1930:

1. `auto_exact` (0.95) — exact amount + exact date
2. `auto_reference` (0.90) — exact amount + reference match
3. `auto_date_range` (0.85) — exact amount + date ±3 days
4. `auto_fuzzy` (0.75) — fuzzy amount (±0.01) + exact date

---

## Accounting Guard Rails

These rules exist for legal compliance, enforced by database triggers. **Never violate them.**

1. **Committed entries are immutable.** Once `status: 'posted'`, cannot be edited or deleted (DB trigger).
2. **Never delete posted entries.** Use `reverseEntry()` (storno) to cancel.
3. **Every entry must balance.** `sum(debits) === sum(credits)`, both `> 0`.
4. **Voucher numbers are sequential.** Assigned via DB RPC. Never set manually.
5. **Period lock enforcement.** DB trigger blocks writes to closed/locked periods.
6. **7-year document retention.** DB triggers prevent deletion of documents linked to posted entries.
7. **Storno, never edit.** Use `correctEntry()` from `lib/core/bookkeeping/storno-service.ts`.
8. **Use `Math.round(x * 100) / 100`** for monetary calculations. Never `toFixed()`.
9. **Always use engine functions.** Never insert directly into journal tables.
10. **Account numbers are strings.** `'1930'`, never `1930`.

---

## Extension System

Extensions are opt-in plugins controlled by `extensions.config.json`. Core builds and runs with zero extensions.

### How It Works

1. Each extension has a `manifest.json` in `extensions/general/<name>/`.
2. `extensions.config.json` lists enabled extension IDs.
3. `npm run setup:extensions` generates files in `lib/extensions/_generated/` (static imports, workspace map, definitions).
4. `predev`/`prebuild` hooks run this automatically.

### Available Extensions

| Extension | Category | Env Vars Required |
|-----------|----------|-------------------|
| `receipt-ocr` | import | `ANTHROPIC_API_KEY` |
| `ai-categorization` | operations | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` |
| `ai-chat` | operations | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` |
| `invoice-inbox` | import | `ANTHROPIC_API_KEY` |
| `calendar` | operations | — |
| `enable-banking` | import | Enable Banking keys |
| `email` | operations | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |

### Creating Extensions

```bash
npx tsx scripts/create-extension.ts --name my-ext --sector general --category operations --description "..."
```

Then add `"my-ext"` to `extensions.config.json` and run `npm run setup:extensions`.

**Constraints**: Extensions **cannot** use dynamic imports (Next.js bundling).

### Extension Interface

```typescript
interface Extension {
  id: string; name: string; version: string; sector?: SectorSlug
  // All optional surfaces:
  apiRoutes?: ApiRouteDefinition[]
  eventHandlers?: ExtensionEventHandler[]
  services?: Record<string, (...args: any[]) => Promise<any>>
  sidebarItems?: SidebarItem[]
  mappingRuleTypes?: MappingRuleTypeDefinition[]
  settingsPanel?: SettingsPanelDefinition
  onInstall?(ctx: ExtensionContext): Promise<void>
  onUninstall?(ctx: ExtensionContext): Promise<void>
}
```

### Extension Context

Handlers receive an `ExtensionContext` with: `userId`, `extensionId`, `supabase` (pre-authenticated), `emit()`, `settings` (JSONB key-value), `storage` (Supabase Storage), `log` (scoped logger), `services`.

### Extension API Routes

Dispatched via catch-all at `app/api/extensions/ext/[...path]/route.ts`.
URL scheme: `/api/extensions/ext/{extensionId}/{routePath}`

Path params extracted as `_paramName` search params (e.g., `/:id` → `searchParams.get('_id')`).

### Service Provider Patterns

**Interface registration** (email pattern): Core defines interface with noop default in `lib/email/service.ts`. Extension calls `registerEmailService()` at load time. Core uses `getEmailService()` — degrades gracefully.

**Services record** (ai-categorization pattern): Extension exposes functions via `services` property. Core looks up via registry: `extensionRegistry.get('ai-categorization')?.services?.findSimilarTemplates(...)`.

### Event Types (lib/events/types.ts)

`journal_entry.drafted/committed/corrected` | `document.uploaded` | `invoice.created/sent` | `credit_note.created` | `transaction.synced/categorized/reconciled` | `period.locked/year_closed` | `customer.created` | `receipt.extracted/matched/confirmed` | `supplier_invoice.received/extracted/confirmed`

---

## Testing

**Framework**: Vitest 4, `globals: true`, `environment: 'node'`. Tests colocated in `__tests__/` directories.

**Scope**: Business logic in `lib/` and API routes in `app/api/`. No component or E2E tests.

**Test helpers** (`tests/helpers.ts`):
- `createMockSupabase()` / `createQueuedMockSupabase()` — Supabase mocks
- `createMockRequest()`, `parseJsonResponse()`, `createMockRouteParams()` — API route testing
- Fixture factories: `makeTransaction()`, `makeJournalEntry()`, `makeInvoice()`, `makeCustomer()`, `makeSupplier()`, `makeFiscalPeriod()`, `makeReceipt()`, `makeDocumentAttachment()`, `makeCompanySettings()`, etc.

**Patterns**:
- Always mock `@/lib/supabase/server`
- Use `vi.clearAllMocks()` and `eventBus.clear()` in `beforeEach`
- API route tests: mock `@/lib/init` and lib functions, test auth (401), validation (400), not found (404), errors (500), happy path

---

## Database & Migrations

**Location**: `supabase/migrations/` — 63 files. Early migrations use sequential numbering (`20240101000001`–`20240101000038`), later ones use real timestamps (`20260223150836`+).
**Next migration**: Use `mcp__plugin_supabase_supabase__apply_migration` which assigns timestamps automatically.

### Placeholder Migrations

Some migrations are no-op placeholders to preserve the numbering sequence:
- **012** (`tax_codes_placeholder`) — Planned but never deployed. The system operates without the `tax_codes` table.
- **023** (`document_version_chain_placeholder`) — Planned but never deployed. Document versioning columns/functions do not exist in production.

### Migration Rules

1. **Always enable RLS** and create `SELECT/INSERT/UPDATE` policies using `auth.uid() = user_id`
2. **Always add `updated_at` trigger** using `update_updated_at_column()`
3. **UUID primary keys**: `DEFAULT uuid_generate_v4()`
4. **User ownership**: `user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL`
5. **Never modify existing migrations** — create new ones
6. **Never modify enforcement triggers** (migration 017) — legally required
7. **Apply via Supabase MCP tool**: `mcp__plugin_supabase_supabase__apply_migration`

### Key Enforcement Triggers (migration 017)

- `enforce_journal_entry_immutability` — Blocks edits/deletes on posted/reversed entries
- `enforce_journal_entry_line_immutability` — Blocks line modifications on committed entries
- `enforce_period_lock` — Blocks writes to closed/locked fiscal periods
- `block_document_deletion` — Prevents deletion of documents linked to committed entries
- `enforce_retention_journal_entries` — 7-year retention enforcement
- `set_committed_at` — Auto-sets timestamp on draft-to-posted transition
- `calculate_retention_expiry` — Auto-sets `retention_expires_at = period_end + 7 years`

### Recent Migrations

- **`20260223150836_invoice_inbox`** — Invoice inbox table with document type classification, AI extraction, supplier/transaction matching, and receipt linking.
- **`20260224101905_booking_template_embeddings`** — Booking templates with AI embeddings for suggestion matching.
- **`20260224132419_user_description_matching`** — User description matching for transaction categorization.
- **`20260224165254_prevent_overlapping_fiscal_periods`** — Exclusion constraint preventing overlapping fiscal periods per user.
- **`20260224190818_enforce_fiscal_period_month_boundaries`** — Ensures fiscal periods start/end on month boundaries.
- **`20260225103139_full_bas_2026`** — Full BAS 2026 account catalog, K2-excluded flag, and SRU code backfill.
- **`20260226120553_expand_account_type_untaxed_reserves`** — Adds `untaxed_reserves` to `chart_of_accounts.account_type` CHECK constraint for BAS 21xx accounts (obeskattade reserver).
- **`20260304191528_set_search_path_on_functions`** — Pins `search_path = public` on all 24 custom functions to prevent search_path injection.
- **`20260306084837_invoice_delivery_note_sequences`** — Adds delivery note number sequence and `generate_invoice_number`/`generate_delivery_note_number` RPC functions.

---

## Type System

- All shared types live in `types/index.ts` — this is the single source of truth
- Import via `import type { TypeName } from '@/types'`
- When adding new domain types, add them to `types/index.ts`
- Event types are the exception — they live in `lib/events/types.ts` (since they reference domain types)

---

## API Route Patterns

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ensureInitialized } from '@/lib/init'
import { validateBody } from '@/lib/api/validate'
import { MySchema } from '@/lib/api/schemas'

ensureInitialized()  // Module-level — loads extensions for event emission

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await validateBody(request, MySchema)
  if (!result.success) return result.response

  // Business logic... always filter by user_id (defense in depth alongside RLS)
  // Wrap journal entry creation in try/catch (non-blocking side effect)
  return NextResponse.json({ data: result })
}
```

- Dynamic route params: `{ params }: { params: Promise<{ id: string }> }` (Next.js 16)
- Response shapes: `{ data }` for success, `{ error }` for failures

---

## Skills, Git & CI

**Skills**: Always use `/frontend-design` for new UI. Use `langchain` for AI features. Use `vercel:deploy` for deployment.

**Git**: Conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`). Atomic commits, branch from `main`.

**CI** (`.github/workflows/core-build.yml`): Resets extensions to empty, runs build + test, verifies no core code imports from `@/extensions/` directly.

---

## Deployment

Hosted on **Vercel**. Cron jobs in `vercel.json` (banking sync daily 05:00, deadlines 06:00, reminders 08:00, push notifications 09:00, tax deadlines yearly Jan 2, document verify weekly Sunday 03:00).

**Core env vars**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`. Extension env vars only needed when that extension is enabled.

## Other
Never create a NUL/nul file: \gnubok\NUL
