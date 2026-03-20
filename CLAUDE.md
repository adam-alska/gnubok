# CLAUDE.md — gnubok

## Project Overview

gnubok is a Swedish-focused accounting SaaS for sole traders (enskild firma) and limited companies (aktiebolag). It implements double-entry bookkeeping compliant with Swedish accounting law (Bokforingslagen), including VAT handling, tax reporting, and 7-year document retention.

**Tech stack**: Next.js 16 (App Router), React 19, TypeScript (strict), Supabase (PostgreSQL + RLS + email/password + TOTP MFA auth), Tailwind CSS 4 + shadcn/ui, Vercel hosting.

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

## Key Architectural Relationships

- **All journal entry creation** routes through `lib/bookkeeping/engine.ts` via `createJournalEntry()`.
- **API routes** that emit events must call `ensureInitialized()` (from `lib/init.ts`) at module level.
- **Event bus** (`lib/events/bus.ts`) is a module-level singleton. Handlers run via `Promise.allSettled`.
- **Supabase clients**: browser (`lib/supabase/client.ts`), server with cookies (`createClient()` from `server.ts`), service role (`createServiceClient()`).
- **Extension system**: Opt-in via `extensions.config.json`. Core builds and runs with zero extensions.
- **NE-bilaga, INK2 declaration, SRU export, and full archive export** are core reports (in `lib/reports/`), not extensions.
- **AI consent gate** (`lib/extensions/ai-consent.ts`): AI extensions (`receipt-ocr`, `ai-categorization`, `ai-chat`) require user consent before API calls. Returns `403 AI_CONSENT_REQUIRED` if missing.
- **Types**: All shared types in `types/index.ts` (single source of truth). Import via `import type { T } from '@/types'`. Event types live in `lib/events/types.ts`.

---

## Authentication

Supabase Auth with **email+password** (primary) and **magic link** (fallback). MFA via TOTP is supported.

MFA is enforced **application-side** (middleware + API routes), **not** in RLS policies. Controlled by two env vars:

- `NEXT_PUBLIC_SELF_HOSTED=true` → MFA never enforced (users can enable voluntarily)
- `NEXT_PUBLIC_REQUIRE_MFA=true` (hosted/Vercel) → middleware redirects to `/mfa/enroll` or `/mfa/verify` until AAL2

---

## Core Bookkeeping Engine

The engine (`lib/bookkeeping/engine.ts`) is the most critical system. All accounting flows route through it.

**Lifecycle**: `createDraftEntry()` → `commitEntry()` (assigns voucher number via DB RPC). Convenience: `createJournalEntry()` does both in one call. Reversal via `reverseEntry()` (storno). Correction via `correctEntry()` in `lib/core/bookkeeping/storno-service.ts`.

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

`VatDeclaration.breakdown.invoices` also includes `base25`/`base12`/`base6` for per-rate revenue breakdown in the UI.

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

Extensions are opt-in plugins in `extensions/general/<name>/`, controlled by `extensions.config.json`. Core builds and runs with zero extensions. `npm run setup:extensions` generates static imports in `lib/extensions/_generated/` (runs automatically via `predev`/`prebuild`). Extensions **cannot** use dynamic imports (Next.js bundling).

**API routes**: Dispatched via catch-all at `app/api/extensions/ext/[...path]/route.ts`. URL: `/api/extensions/ext/{extensionId}/{routePath}`. Path params extracted as `_paramName` search params.

**Service provider patterns**:
- *Interface registration* (email): Core defines noop default in `lib/email/service.ts`, extension calls `registerEmailService()`, core uses `getEmailService()`.
- *Services record* (ai-categorization): Extension exposes via `services` property, core looks up via `extensionRegistry.get('id')?.services?.method(...)`.

**Creating extensions**: `npx tsx scripts/create-extension.ts --name my-ext --sector general --category operations --description "..."`, then add to `extensions.config.json`.

---

## API Route Pattern

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

## Testing

**Framework**: Vitest 4, `globals: true`, `environment: 'node'`. Tests colocated in `__tests__/` directories. Scope: business logic in `lib/` and API routes in `app/api/`. No component or E2E tests.

**Test helpers** (`tests/helpers.ts`): `createMockSupabase()`, `createQueuedMockSupabase()`, `createMockRequest()`, `parseJsonResponse()`, `createMockRouteParams()`, and fixture factories (`makeTransaction()`, `makeJournalEntry()`, `makeInvoice()`, `makeCustomer()`, `makeSupplier()`, `makeSupplierInvoice()`, `makeFiscalPeriod()`, `makeReceipt()`, `makeDocumentAttachment()`, `makeCompanySettings()`, `makeInvoiceInboxItem()`, etc.).

**Patterns**: Always mock `@/lib/supabase/server`. Use `vi.clearAllMocks()` and `eventBus.clear()` in `beforeEach`. API route tests: mock `@/lib/init` and lib functions, test auth (401), validation (400), not found (404), errors (500), happy path.

---

## Database & Migrations

**Location**: `supabase/migrations/` — 65 files. Early migrations use sequential numbering (`20240101000001`–`20240101000038`), later ones use real timestamps.

### Migration Rules

1. **Always enable RLS** and create `SELECT/INSERT/UPDATE` policies using `auth.uid() = user_id`
2. **Always add `updated_at` trigger** using `update_updated_at_column()`
3. **UUID primary keys**: `DEFAULT uuid_generate_v4()`
4. **User ownership**: `user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL`
5. **Never modify existing migrations** — create new ones
6. **Never modify enforcement triggers** (migration 017) — legally required
7. **Apply via Supabase MCP tool**: `mcp__plugin_supabase_supabase__apply_migration`

---

## Skills, Git & CI

**Skills**: Always use `/frontend-design` for new UI. Use `langchain` for AI features. Use `vercel:deploy` for deployment.

**Git**: Conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`). Atomic commits, branch from `main`.

**CI** (`.github/workflows/core-build.yml`): Resets extensions to empty, runs build + test, verifies no core code imports from `@/extensions/` directly.

---

## Deployment

Hosted on **Vercel**. Cron jobs defined in `vercel.json` (banking sync, deadlines, reminders, tax deadlines, document verification, sandbox cleanup).

**Core env vars**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`. **Auth env vars**: `NEXT_PUBLIC_REQUIRE_MFA` (set `true` on hosted), `NEXT_PUBLIC_SELF_HOSTED` (set `true` for Docker). Extension env vars only needed when that extension is enabled.

## Other
Never create a NUL/nul file: \gnubok\NUL

---

## Design Context

### Users

Swedish sole traders (enskild firma) and small business owners (aktiebolag) who need to manage their own bookkeeping. They are not accountants — they are professionals (consultants, freelancers, shop owners) who want to stay compliant without hiring one. They use gnubok in short, focused sessions: sending an invoice, categorizing bank transactions, filing a VAT declaration. Speed and clarity matter — every second spent in the app is a second away from their real work.

### Brand & Aesthetic

**Minimal. Sharp. Efficient.** The interface should feel like a well-made instrument: considered, quiet, and confident. Reference: Mercury (banking). Anti-reference: enterprise software (SAP/Oracle density).

- **Palette**: Grayscale foundation with restrained semantic colors — sage green (success/balance), terracotta (errors/overdue), ochre (warnings/attention). No loud brand color.
- **Typography**: Fraunces (serif) for display headings, Geist (sans) for body. Tabular numbers everywhere financial data appears.
- **Surfaces**: White/near-white cards on light gray backgrounds. Subtle borders (60% opacity). Soft shadows. Dark mode follows the same restraint.
- **Spacing**: Generous whitespace. Dense data (tables, ledgers) uses tighter spacing but never feels cramped.
- **Motion**: Subtle and purposeful. Stagger animations for list entry, spring easing for feedback. Never decorative.
- **Icons**: Lucide — 15px in navigation, slightly larger in empty states.

### Design Principles

1. **Clarity over cleverness.** Every element immediately understandable. Clear labels (in Swedish), obvious hierarchy.
2. **Earned minimalism.** Remove what doesn't serve the task, but don't strip context that prevents compliance errors.
3. **Numbers are first-class.** Tabular-nums, proper alignment, adequate contrast, clear positive/negative distinction.
4. **Trust through consistency.** Same patterns, spacing, and behavior everywhere.
5. **Speed is a feature.** Optimize for the 90-second session.

### Accessibility

- **WCAG AA**: 4.5:1 text contrast, 3:1 UI components
- Keyboard-navigable with visible focus rings
- Respect `prefers-reduced-motion`
- Color never sole indicator of state — always pair with icons, text, or shape
