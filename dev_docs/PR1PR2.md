 Architecture Cleanup & SupabaseClient Injection                                                                                
                                                        
 Context

 External feedback identified the codebase as overengineered in some areas (unused sector extensions, dead event types) and
 underengineered in one critical area (no abstraction boundary between core lib/ and the Supabase platform). The goal is to
 slim down dead weight and refactor lib/ functions to accept SupabaseClient as a parameter instead of self-instantiating,
 matching a pattern already used by bank-reconciliation.ts, ingest.ts, and other files.

 Two PRs:
 - PR1: Cleanup (delete sector/export extensions, prune 6 dead events)
 - PR2: SupabaseClient injection refactor (reports first, then engine + core services)

 ---
 PR1: Cleanup

 1a. Delete sector & export extension directories

 Delete these 6 directories entirely:
 extensions/restaurant/
 extensions/construction/
 extensions/hotel/
 extensions/tech/
 extensions/ecommerce/
 extensions/export/

 Delete their workspace components:
 components/extensions/restaurant/
 components/extensions/construction/
 components/extensions/hotel/
 components/extensions/tech/
 components/extensions/ecommerce/
 components/extensions/export/

 1b. Update sector registry

 lib/extensions/types.ts:13 — reduce SectorSlug union:
 // Before
 export type SectorSlug = 'general' | 'restaurant' | 'construction' | 'hotel' | 'tech' | 'ecommerce' | 'export'
 // After
 export type SectorSlug = 'general'

 lib/extensions/sectors.ts — remove 6 sector shells from SECTOR_SHELLS array (lines 21-57), keeping only the general entry.

 1c. Update sectors test

 lib/extensions/__tests__/sectors.test.ts — the test uses buildDefinitionsFromManifests() which walks extensions/ at runtime,
 so counts auto-adjust. But hardcoded assertions need updating:
 - Line 48: expect(SECTORS.length).toBe(7) → .toBe(1)
 - Line 51: expect(getAllExtensions().length).toBe(25) → update to match remaining general extensions count (count manifests in
  extensions/general/)
 - Lines 63-66: "at least one extension per sector" — still valid for 1 sector
 - Lines 69-73: Change getSector('restaurant') test to getSector('general')
 - Lines 81-87: Change getExtensionDefinition('restaurant', 'food-cost') to a general extension
 - Lines 94-96: Change getExtensionsBySector('restaurant') to getExtensionsBySector('general')

 1d. Remove 6 dead event types

 lib/events/types.ts — remove these 6 union members from CoreEvent:
 - invoice.paid (line 32)
 - invoice.overdue (line 33)
 - bank.statement_received (line 39)
 - bank.payment_notification (line 40)
 - customer.pseudonymized (line 46)
 - audit.security_event (line 72)

 Remove from the import on line 1-16:
 - CAMT053Statement
 - CAMT054Notification
 - AuditSecurityEvent

 types/index.ts — delete the 3 placeholder interfaces (lines 1669-1685):
 - CAMT053Statement
 - CAMT054Notification
 - AuditSecurityEvent

 1e. Verification

 npm run build          # Confirm no broken imports
 npm test               # All tests pass
 npm run setup:extensions  # Codegen still works (manifests removed)

 ---
 PR2: SupabaseClient Injection Refactor

 Phase 1: Report generators (10 files)

 These files self-instantiate createClient(). Refactor each to accept supabase: SupabaseClient as first parameter.

 ┌────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────┐
 │                  File                  │                               Functions to change                               │
 ├────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ lib/reports/trial-balance.ts           │ generateTrialBalance(supabase, userId, periodId),                               │
 │                                        │ generateTrialBalanceManual(supabase, userId, periodId)                          │
 ├────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ lib/reports/vat-declaration.ts         │ calculateVatDeclaration(supabase, userId, ...)                                  │
 ├────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ lib/reports/sie-export.ts              │ generateSIEExport(supabase, userId, options)                                    │
 ├────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ lib/reports/general-ledger.ts          │ generateGeneralLedger(supabase, userId, periodId, ...)                          │
 ├────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ lib/reports/journal-register.ts        │ generateJournalRegister(supabase, userId, periodId)                             │
 ├────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ lib/reports/monthly-breakdown.ts       │ generateMonthlyBreakdown(supabase, userId, periodId)                            │
 ├────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ lib/reports/supplier-ledger.ts         │ generateSupplierLedger(supabase, userId, asOfDate)                              │
 ├────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ lib/reports/supplier-reconciliation.ts │ generateReconciliation(supabase, userId, periodId)                              │
 ├────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ lib/reports/ar-ledger.ts               │ generateARLedger(supabase, userId, asOfDate)                                    │
 ├────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ lib/reports/ar-reconciliation.ts       │ generateARReconciliation(supabase, userId, periodId)                            │
 └────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────┘

 Not changed (no direct createClient call):
 - income-statement.ts — delegates to generateTrialBalance(), which gets the client. Pass supabase through:
 generateIncomeStatement(supabase, userId, periodId).
 - balance-sheet.ts — same pattern, delegates to generateTrialBalance().

 Sub-reports (also need injection):
 - lib/reports/ne-bilaga/ne-engine.ts — generateNEDeclaration(supabase, userId, periodId)
 - lib/reports/sru-export/sru-engine.ts — aggregateBalancesBySRU(supabase, userId, periodId), getSRUCoverage(supabase, userId)

 Mechanical change per file:
 1. Remove import { createClient } from '@/lib/supabase/server'
 2. Add import type { SupabaseClient } from '@supabase/supabase-js'
 3. Add supabase: SupabaseClient as first parameter
 4. Delete the const supabase = await createClient() line

 Update callers — each report API route already creates a client for auth. Pass it through:

 // Before (app/api/reports/trial-balance/route.ts)
 const result = await generateTrialBalance(user.id, periodId)

 // After
 const result = await generateTrialBalance(supabase, user.id, periodId)

 12 API routes to update:
 - app/api/reports/trial-balance/route.ts
 - app/api/reports/income-statement/route.ts
 - app/api/reports/balance-sheet/route.ts
 - app/api/reports/vat-declaration/route.ts
 - app/api/reports/sie-export/route.ts
 - app/api/reports/general-ledger/route.ts
 - app/api/reports/journal-register/route.ts
 - app/api/reports/monthly-breakdown/route.ts
 - app/api/reports/supplier-ledger/route.ts
 - app/api/reports/ar-ledger/route.ts
 - app/api/reports/ne-bilaga/route.ts
 - app/api/reports/sru-export/route.ts (+ coverage/route.ts)

 Phase 2: Core services (7 files)

 Same mechanical pattern. Each function gets supabase: SupabaseClient as first parameter.

 ┌──────────────────────────────────────────┬───────────────────────────────────────────────────────────────────────────────┐
 │                   File                   │                                   Functions                                   │
 ├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
 │ lib/core/bookkeeping/period-service.ts   │ lockPeriod, closePeriod, createNextPeriod, getPeriodStatus                    │
 ├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
 │ lib/core/bookkeeping/storno-service.ts   │ correctEntry                                                                  │
 ├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
 │                                          │ validateYearEndReadiness, previewYearEndClosing, generateOpeningBalances      │
 │ lib/core/bookkeeping/year-end-service.ts │ (note: executeYearEndClosing calls others that self-instantiate, so it also   │
 │                                          │ needs the param and must pass it through)                                     │
 ├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
 │                                          │ uploadDocument, createNewVersion, linkToJournalEntry, verifyIntegrity (keep   │
 │ lib/core/documents/document-service.ts   │ ensureDocumentsBucket using createServiceClient — it needs service role for   │
 │                                          │ bucket ops)                                                                   │
 ├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
 │ lib/core/audit/audit-service.ts          │ getAuditLog, getEntityHistory, getCorrectionChain                             │
 ├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
 │ lib/core/tax/tax-code-service.ts         │ getTaxCodes, getTaxCodeByCode, calculateMomsFromTaxCodes, seedTaxCodes        │
 ├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
 │ lib/invoices/invoice-matching.ts         │ findMatchingInvoices                                                          │
 └──────────────────────────────────────────┴───────────────────────────────────────────────────────────────────────────────┘

 Phase 3: Bookkeeping engine + mapping (3 files)

 ┌───────────────────────────────────┬──────────────────────────────────────────────────────────────────────────────────────┐
 │               File                │                                      Functions                                       │
 ├───────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────┤
 │                                   │ getNextVoucherNumber, findFiscalPeriod, createDraftEntry, commitEntry,               │
 │ lib/bookkeeping/engine.ts         │ createJournalEntry, reverseEntry (validateBalance stays pure, resolveAccountIds      │
 │                                   │ already takes client)                                                                │
 ├───────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────┤
 │ lib/bookkeeping/mapping-engine.ts │ evaluateMappingRules, saveUserMappingRule                                            │
 ├───────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────┤
 │ lib/import/sie-import.ts          │ checkDuplicateImport, importVouchers, saveMappings, loadMappings, executeSIEImport   │
 └───────────────────────────────────┴──────────────────────────────────────────────────────────────────────────────────────┘

 Engine.ts cascade: Since createJournalEntry calls createDraftEntry and commitEntry, and commitEntry calls
 getNextVoucherNumber, the client flows through all internal calls. This eliminates the current pattern where each sub-function
  creates its own independent client.

 Special cases

 - lib/bookkeeping/handlers/supplier-invoice-handler.ts — event handler, invoked by event bus. The handler creates its own
 client because it has no caller to receive one from. Leave as-is — this is the edge of the system where the event bus must
 bootstrap a client.
 - lib/extensions/toggle-check.ts — uses createServiceClient() (service role, no cookies). Leave as-is — extension toggle
 checks bypass RLS intentionally.
 - lib/core/documents/document-service.ts ensureDocumentsBucket — uses createServiceClient(). Leave as-is for this one private
 function.

 Phase 2/3 caller updates

 The API routes calling these functions need the same one-line change as the report routes: pass the existing supabase variable
  as the first argument.

 Verification

 npm run build          # No broken imports
 npm test               # All tests pass — mock pattern changes from module mock to direct client mock
 npx vitest run lib/reports     # Report tests specifically
 npx vitest run lib/bookkeeping # Engine tests specifically

 Tests currently mock @/lib/supabase/server. After the refactor, tests can pass a mock client directly via createMockSupabase()
  from tests/helpers.ts — which is already the pattern used by the tests. The vi.mock('@/lib/supabase/server') calls in test
 files can be removed for functions that now accept the client as a parameter.

 ---
 What we're NOT changing

 - engine.ts single write path
 - DB enforcement triggers
 - Extension toggle system
 - Codegen from extensions.config.json
 - Event bus design (lib/events/bus.ts)
 - Report system structure
 - Reconciliation 4-pass algorithm
 - AI extension architecture