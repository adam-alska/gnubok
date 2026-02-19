Base ERP Architecture: Core + Add-on System (v2)
The Core
Every item here is non-negotiable for legal compliance or market viability. Nothing below can be an add-on.

Authentication, Tenancy & Access Control
Magic link auth via Supabase
Onboarding wizard (entity type EF/AB, company details, tax registration, fiscal year, bank connection)
RLS on every table, user_id scoping
Multi-company support per user
Delegated access roles: owner, accountant (full read/write), audit:read (read-only, scoped to fiscal year). The audit role is the foundation for Digital Audit 2026 compliance where Skatteverket gets API access to a specific fiscal year.

Document Archive (Compliance Layer)
The July 2024 Bokföringslagen amendment makes the system the legal archive. This is not a feature, it is a legal obligation.
Hash-on-upload. Every uploaded file (receipt image, e-invoice XML, PDF) gets a SHA-256 hash computed and stored alongside the blob. The hash is the proof of integrity.
WORM storage. Uploaded documents are write-once. Any modification (crop, contrast, re-scan) creates a new version. The original remains accessible and linked in the version chain.
Deletion blocking. The system hard-rejects any attempt to delete a document linked to a committed voucher or a locked period. No admin override.
Digitization metadata. Every upload logs: user who uploaded, timestamp, source (camera, file upload, e-invoice), and a digitization date field. This justifies destruction of the paper original.
Linkage integrity. Strict foreign key from journal_entry_lines to document_attachments. No orphaned documents, no undocumented entries.

Seven-Year Retention & Purge Prevention
System calculates retention expiry: fiscal year end + 7 calendar years.
All delete operations (company, fiscal year, journal entries, documents) are blocked within the retention window.
"Delete Company" requires a verified full SIE4 export + linked document archive before proceeding, and only after retention expires.
GDPR conflict resolution: pseudonymize CRM master data on request, but never touch the ledger. Invoice snapshots with names remain intact as part of the fiscal record.

Chart of Accounts (BAS Kontoplan)
BAS seeding per entity type (EF/AB), K1 vs full plan
Account CRUD: add, deactivate, rename. Deactivated accounts preserve historical data but block new postings.
Account metadata: type (tillgång/skuld/intäkt/kostnad), default tax code, SRU code mapping
SRU mapping table. Every BAS account maps to an SRU code. This is what makes tax filing work. Without it the system cannot generate Inkomstdeklaration 2 data.
Annual BAS updates. Migration mechanism for BAS Group changes. Deprecated accounts get frozen (no new postings), not deleted.
Dimensions. Minimum two dimension types: Kostnadsställe (cost center) and Projekt. Stored on journal entry lines. Required for SIE4 dimension export (#OBJEKT) and expected by any consultancy or construction firm.

Double-Entry Bookkeeping (Immutable Ledger)
Draft/Commit lifecycle:
Journal entries start as drafts with temporary IDs (TMP-xxxx). Drafts are freely editable.
On commit ("Bokför"), the system assigns the next permanent voucher number from the series. At this moment the row becomes immutable.
DB-level enforcement: committed rows have UPDATE and DELETE restrictions. Application code cannot bypass this.
Voucher series management:
Sequential numbering per series per fiscal year. Gaps are impermissible under Bokföringslagen.
Gap detection: background check that flags any missing numbers in a committed series.
Concurrent write safety: SELECT ... FOR UPDATE or advisory locks to prevent duplicate number assignment.
Storno correction logic:
Posted vouchers are never edited. Corrections follow the three-step flow:
Step 1: System generates a reversal voucher (storno) that nullifies the original.
Step 2: System generates the corrected entry with the right data.
Step 3: All three vouchers (original, reversal, correction) are linked in the behandlingshistorik.
UI presents a single "Correct" button. The user sees a "Corrected" status tag. The triple-entry logic runs in the background.
Debit == Credit validation: enforced at DB level via check constraint or trigger. No exceptions.
Guaranteed delivery: transactional outbox pattern for journal creation from upstream events (invoice created, payment received, etc.). Failed entries go to a dead letter queue with alerting. Silent failure is not acceptable.

Audit Trail (Behandlingshistorik)
Every mutation to journal entries, accounts, documents, settings, user roles logged with: actor, timestamp, action type, before-state, after-state.
Committed vouchers log all correction chains (original -> storno -> corrected).
Attempted deletions of protected data logged as security events.
The audit log itself is append-only. No updates, no deletes.

Period Management
Fiscal year definition with support for broken fiscal years (brutet räkenskapsår).
Multi-fiscal-year support with clean year boundaries.
Period locking (låsning av period). Locked periods reject all writes to journal entries and documents within that period. Locking is one-way without admin unlock + audit log entry.
Year-end closing (årsbokslut):
Zero out result accounts (class 3-8).
Transfer net result to equity (account 2099).
Generate closing entries as committed vouchers.
Calculate and verify that UB of year N == IB of year N+1.
Block manual editing of IB to prevent breaking continuity.
Opening balances workflow for new companies or mid-year migrations.

Tax Code Engine
Decoupled from the chart of accounts. Tax codes tag transaction lines independently.
Code
Rate
Description
Momsdeklaration Boxes
MP1
25%
Standard output VAT
05 (basis) + 10 (tax)
MP2
12%
Food/hotel
06 (basis) + 11 (tax)
MP3
6%
Books/transport/culture
07 (basis) + 12 (tax)
MPI
25/12/6%
Standard input VAT
48
IV
0%
Intra-community acquisition
20 (basis) + 30 (input) + 30 (output)
EUS
0%
EU sale of goods/services
35/36 + Periodisk sammanställning
IP
0%
Import of goods
50 (basis) + 60 (output) + 48 (input)
EXP
0%
Export outside EU
08 (basis)
OSS
varies
One Stop Shop (e-commerce)
Excluded from boxes 05-49, routed to OSS report

Momsdeklaration generated by summing per tax code, not per account. This survives any account plan customization.
Validation: calculated tax (basis * rate) must match reported tax within tolerance. Deviations trigger warnings.
Periodisk sammanställning (EC Sales List) auto-populated from EUS-tagged lines.

Financial Reports
Resultaträkning (income statement) by BAS class
Balansräkning (balance sheet) with assets == equity + liabilities validation
Råbalans (trial balance) with zero-sum verification
Momsdeklaration (all rutor 05-49) generated from tax code engine
SRU-based tax data for Inkomstdeklaration 2 (sums per SRU code)
All reports respect period locks, fiscal year boundaries, and dimension filters (kostnadsställe, projekt)

SIE4
Export: spec-validated output including #IB, #UB, #RES, #VER, #OBJEKT (dimensions), #KONTO with all used accounts. Explicit character encoding handling (CP437/Latin-1) with Swedish character validation. #ORGNR validated against Luhn algorithm.
Import: 4-step wizard (upload, parse, map accounts, review & execute). Creates journal entries from imported data. Validates that imported IB matches existing UB if prior year exists.
Round-trip integrity: export from system, re-import, verify all balances match with zero difference.
Cross-system validation: export must parse without errors in Visma and Fortnox.

Invoicing
Create, edit, send, track invoices
Credit notes with automatic storno reversal entries
VAT via tax code engine (not hardcoded per account)
Multi-currency with Riksbanken exchange rates
Currency gain/loss (kursdifferens). When payment arrives at a different rate than invoiced, system auto-books the difference to 3960/7960.
PDF generation
Peppol BIS Billing 3.0. Generate and send e-invoices via Peppol network. This is the mandated B2G standard and increasingly B2B. Validate output against Peppol Schematron. This replaces email delivery for Peppol-capable recipients.
Public payment/dispute page (token-based, no auth)
Configurable reminder system (intervals, templates, enable/disable)

Banking
PSD2 connection via Enable Banking for transaction sync
OAuth consent flow with 90-day renewal handling
Transaction sync with deduplication (unique(user_id, external_id))
Invoice-to-payment matching (amount + date + OCR reference)
ISO 20022 file handling:
PAIN.001 generation for outgoing supplier payments. Batch multiple payments per PaymentInformation block. Validate against bank-specific XSD before download.
CAMT.053 parsing for end-of-day bank statements. Feed into reconciliation engine matching to general ledger.
CAMT.054 parsing for incoming payment notifications with OCR references. Auto-mark invoices as paid.

Transaction Management
Transaction list with categorization
Manual categorization creates journal entries (via draft/commit flow)
Mapping rules engine: MCC code, merchant name, description pattern, amount threshold
Extensible rule types (hook for add-ons to register custom rules)

Customers
Name, org number, VAT number (validated format), address, payment terms, international flag
Peppol participant ID (for e-invoice routing)
Linked to invoices
Subject to GDPR pseudonymization (but not deletion if linked to fiscal records)

Tax Calendar
Auto-generated Swedish tax deadlines: F-skatt, arbetsgivardeklaration, momsdeklaration (monthly/quarterly), inkomstdeklaration, årsredovisning, bokslut
Calendar views (month/week/day) + ICS export
Deadline status tracking (upcoming, due, overdue, filed)

The Extension Architecture
1. Event Bus
The core emits events. Extensions subscribe. One-way dependency.
typescript
// lib/events/types.ts
export type CoreEvent =
  // Bookkeeping
  | { type: 'journal_entry.drafted'; payload: DraftJournalEntry }
  | { type: 'journal_entry.committed'; payload: JournalEntry }
  | { type: 'journal_entry.corrected'; payload: { original: JournalEntry; storno: JournalEntry; corrected: JournalEntry } }
  // Documents
  | { type: 'document.uploaded'; payload: Document & { hash: string } }
  // Invoicing
  | { type: 'invoice.created'; payload: Invoice }
  | { type: 'invoice.sent'; payload: Invoice }
  | { type: 'invoice.paid'; payload: Invoice & { transaction: Transaction; kursdifferens?: number } }
  | { type: 'invoice.overdue'; payload: Invoice & { days: number } }
  | { type: 'credit_note.created'; payload: CreditNote }
  // Banking
  | { type: 'transaction.synced'; payload: Transaction[] }
  | { type: 'transaction.categorized'; payload: Transaction & { account: string; taxCode: string } }
  | { type: 'bank.statement_received'; payload: CAMT053Statement }
  | { type: 'bank.payment_notification'; payload: CAMT054Notification }
  // Periods
  | { type: 'period.locked'; payload: { fiscalYear: number; period: number } }
  | { type: 'period.year_closed'; payload: { fiscalYear: number } }
  // Customers
  | { type: 'customer.created'; payload: Customer }
  | { type: 'customer.pseudonymized'; payload: { customerId: string } }
  // Audit
  | { type: 'audit.security_event'; payload: AuditSecurityEvent }
Implementation: in-process handlers initially. Add webhook dispatch (POST to registered URLs) when external plugin consumers exist.
2. Extension Registry
typescript
// lib/extensions/types.ts
export interface Extension {
  id: string
  name: string
  version: string

  // Surfaces
  routes?: RouteDefinition[]
  apiRoutes?: ApiRouteDefinition[]
  sidebarItems?: SidebarItem[]
  eventHandlers?: EventSubscription[]
  mappingRuleTypes?: MappingRuleType[]
  reportTypes?: ReportDefinition[]
  settingsPanel?: SettingsPanelDef
  taxCodes?: TaxCodeDefinition[]        // for add-ons introducing new tax scenarios
  dimensionTypes?: DimensionDefinition[] // for add-ons adding custom dimensions beyond the base two

  onInstall?(ctx: ExtensionContext): Promise<void>
  onUninstall?(ctx: ExtensionContext): Promise<void>
}
3. Database Extension Pattern
First-party add-ons: own migration folder, own tables with user_id + RLS.
Third-party add-ons: use API routes + webhook events + generic extension_data table:
sql
create table extension_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  extension_id text not null,
  key text not null,
  value jsonb not null,
  created_at timestamptz default now(),
  unique(user_id, extension_id, key)
);
```

### Core constraint

The base never imports from `extensions/`. Dependency flows one direction: extensions import from `lib/core/`, `lib/events/`, `lib/extensions/`.

---

## Add-ons

Each add-on is self-contained. Listed by priority tier.

### Tier 1: High value, build soon after core

**`receipt-ocr`**
- Subscribes to: `document.uploaded`
- Does: Claude Vision OCR, extracts merchant/date/line items/totals, fuzzy-matches to bank transactions (±3 days, amount similarity), suggests BAS account + tax code
- Special rules: Systembolaget -> non-deductible, restaurant -> representation (90 kr/person limit)
- Registers: custom mapping rule types for OCR-based categorization

**`ai-categorization`**
- Subscribes to: `transaction.synced`
- Does: suggests BAS account + tax code for uncategorized transactions
- No hard dependency on any specific AI provider. Interface-based so the model is swappable.

**`ne-bilaga`**
- Registers as: `reportType` via extension registry
- Does: generates NE-bilaga (income tax appendix for enskild firma, fields R1-R11) from journal entries
- Only relevant for EF entity type. Hidden for AB.

**`sru-export`**
- Registers as: `reportType`
- Does: generates SRU files for Skatteverket electronic filing. Reads SRU mappings from core account metadata.

**`push-notifications`**
- Subscribes to: `invoice.overdue`, `period.locked`, deadline events from tax calendar
- Does: Web Push via VAPID. Per-user preferences with quiet hours.

**`owner-payroll`**
- Registers: routes, sidebar item, settings panel
- Does: single-employee salary for AB owner. Gross salary, tax deduction, employer contributions (arbetsgivaravgifter). Monthly AGI XML generation for Skatteverket. Box 821 absence reporting (VAB, parental leave) with date tracking. Bilförmån and traktamente input fields with Skatteverket standard rates.
- Subscribes to: tax calendar deadline events for arbetsgivardeklaration due dates

### Tier 2: Market differentiation

**`annual-report`**
- Registers as: `reportType` + routes
- Does: K2 taxonomy mapping from BAS accounts. Generates iXBRL for Bolagsverket digital filing. API integration: validate, upload, redirect to BankID signing. Board member signature flow.
- K3 support as a sub-toggle within this add-on (component depreciation, fair value).

**`ai-chat`**
- Registers: floating widget component, routes for session management
- Does: RAG-powered Swedish tax/accounting assistant using LangChain + embeddings. Session history. Rate limited.
- No event subscriptions. Read-only access to user's bookkeeping data for context.

**`bankid`**
- Registers: auth provider, signing flow component
- Does: BankID integration for login and document signing. Secure Start (animated QR code, mandatory since May 2024). Certificate management for merchant certificates.
- Used by: `annual-report` (Bolagsverket signing), `owner-payroll` (AGI signing), future audit access.

**`deductions`**
- Registers: routes, sidebar item, report types
- Does: Schablonavdrag for mileage (korjournal, 25 kr/mil) and home office (2,000-4,000 kr/year). Generates journal entries.

### Tier 3: Vertical enablers

**`inventory-value`**
- Registers: routes, report type
- Does: tracks financial value of stock on account 1400. Accepts journal entries from vertical inventory modules (retail, construction, food). Does not do logistics, variants, batches, or expiry tracking. That is the vertical's job.

**`multi-currency-advanced`**
- Registers: additional tax codes, report types
- Does: automated unrealized gain/loss calculations at period end. Currency revaluation entries. Beyond the base kursdifferens on invoice payment.

**`oss-reporting`**
- Registers: report type, tax codes
- Does: OSS (One Stop Shop) VAT return for e-commerce sellers. Transactions tagged with OSS tax codes excluded from standard momsdeklaration and routed here.

**`saf-t-export`**
- Registers: report type
- Does: SAF-T XML generation. Forward-looking compliance for potential 2026 EU mandate. Maps from the core's granular data model (header -> line -> tax detail).

---

## Repo Structure
```
app/
  (auth)/
  (onboarding)/
  (dashboard)/
    bookkeeping/
    invoices/
    transactions/
    banking/
    customers/
    reports/
    calendar/
    settings/
    extensions/             → marketplace / management
  (public)/
  api/
    journal-entries/
    invoices/
    transactions/
    banking/
    reports/
    customers/
    deadlines/
    documents/              → upload, hash verification, version history
    audit/                  → audit log queries, security events
    extensions/             → register, list, config
    webhooks/               → outbound event delivery

lib/
  core/
    bookkeeping/            → draft/commit, storno, voucher series, period locking
    accounts/               → BAS kontoplan, SRU mapping, dimensions
    reports/                → resultaträkning, balansräkning, råbalans, moms
    invoicing/              → create, send, credit, VAT, Peppol, reminders
    banking/                → PSD2, sync, matching, ISO 20022 (PAIN/CAMT)
    transactions/           → categorization, mapping rules
    tax/                    → tax code engine, deadlines, fiscal year, year-end closing
    sie/                    → import + export with dimension support
    documents/              → hash-on-upload, WORM storage, deletion blocking, versioning
    audit/                  → append-only audit log, behandlingshistorik
    retention/              → purge prevention, retention expiry calculation
  events/                   → event bus, types, webhook dispatch
  extensions/               → registry, types, loader

extensions/                 → first-party add-ons
  receipt-ocr/
  ai-categorization/
  ai-chat/
  ne-bilaga/
  sru-export/
  push-notifications/
  owner-payroll/
  annual-report/
  bankid/
  deductions/
  inventory-value/
  multi-currency-advanced/
  oss-reporting/
  saf-t-export/

components/
  ui/                       → Radix primitives, design system
  core/                     → base feature components
  extensions/               → shared extension UI patterns

supabase/
  migrations/               → base schema only

types/


