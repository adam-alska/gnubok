# Extension System — Design Document

## The App

erp-base is a Swedish accounting platform for sole traders (enskild firma) and limited companies (aktiebolag). It handles the legally required bookkeeping and financial management that every Swedish business needs.

## Core Functionality

The core is the standard accounting system. It's what every user gets out of the box — the features that exist in any accounting platform like Fortnox, Visma, or Björn Lundén. Nothing more, nothing less:

- Double-entry bookkeeping (journal entries, BAS chart of accounts, voucher numbering)
- Invoicing (create, send, track, payment matching)
- Supplier invoice management
- Bank transaction reconciliation
- Financial reports (income statement, balance sheet, trial balance, VAT declaration, general ledger)
- Tax compliance (SRU export, NE-bilaga, tax deadline tracking)
- Document archive with 7-year legal retention
- Customer and supplier management

That's the core. It doesn't include receipt scanning, AI categorization, AI chat, push notifications, or PSD2 bank connection. Those are not standard accounting features — they're value-adds.

## Extensions

Extensions are **everything beyond the core accounting system**. They are self-contained tools that a user adds to their dashboard. No extensions are active by default — the user chooses which ones they want.

There are two kinds of extensions:

### General Extensions

General extensions are not tied to any specific business sector. They're useful for any business but they go beyond what a standard accounting system offers. They are optional — the user toggles them on from the marketplace.

Examples:
- **Receipt OCR** — Scan receipts and extract data automatically
- **AI Categorization** — AI-powered transaction categorization suggestions
- **AI Chat** — AI assistant for tax and bookkeeping questions
- **Push Notifications** — Event notifications for accounting activities
- **Enable Banking** — PSD2 automatic bank transaction sync

These currently exist in the codebase at `extensions/` and are always loaded. They need to be migrated to the toggle system so users choose to enable them.

### Sector Extensions

Sector extensions are tied to a specific market sector. They're only relevant to businesses operating in that sector. A restaurant owner wants "Food Cost %" but an IT consultant does not.

Examples:
- **Restaurant:** Food Cost %, Earnings Per Alcohol Liter, POS Z-Report Import, Tip Tracking
- **Construction:** ROT Calculator, Project Cost Tracking
- **Hotel:** RevPAR, Occupancy Tracking
- **IT/Consulting:** Billable Hours Ratio, Project Billing Metrics
- **E-commerce:** Shopify Order Import, Multi-channel Revenue Analytics

### The Unified Model

Both general and sector extensions live in the same system:

```
extensions/
  general/                    ← General extensions (any business)
    receipt-ocr/
    ai-categorization/
    ai-chat/
    push-notifications/
    enable-banking/
  restaurant/                 ← Restaurant sector extensions
    food-cost/
    earnings-per-liter/
    pos-import/
    tip-tracking/
  construction/               ← Construction sector extensions
    rot-calculator/
    project-cost/
  hotel/                      ← Hotel sector extensions
    revpar/
    occupancy/
  tech/                       ← IT/Consulting sector extensions
    billable-hours/
    project-billing/
  ecommerce/                  ← E-commerce sector extensions
    shopify-import/
    multichannel-revenue/
```

In the marketplace:
- General extensions are shown to everyone, always visible
- Sector extensions are suggested based on the user's primary sector
- But all extensions are browsable by everyone regardless of sector

In the sidebar under "Your Extensions":
- Both general and sector extensions appear together
- Whatever the user has enabled shows up here

---

## Design Decisions (Confirmed)

### 1. Extensions are self-contained — they do NOT write to the core accounting system

Extensions are **independent tools that live on the dashboard**. They are NOT part of the core accounting system. They have their own world, their own data, their own purpose. They never create journal entries, invoices, or modify any accounting records.

There are two one-way data flows into an extension. Data never flows back:

```
Core Accounting Data ──→ Extension (reads it, displays it, uses it in calculations)
User Manual Input    ──→ Extension (stores it in extension's own data, processes it)
Extension            ──✗──→ Core Accounting (never writes back)
```

An extension may:
- **Be fed core data** — the platform feeds accounting data (journal entries, transactions, invoices) into the extension for it to read and use in calculations
- **Accept user input** — the user submits data directly into the extension for data that doesn't exist in any accounting system (e.g. liters of alcohol sold per day, POS Z-report files, Shopify order exports)
- **Store its own data** — extension-specific data lives in the extension's own storage, separate from core accounting
- **Calculate and display** — combine core data + extension data to produce metrics, reports, insights

An extension may NOT:
- Create journal entries
- Create or modify invoices
- Modify transactions or any core accounting table
- Write back to the core accounting system in any way

This is a critical architectural constraint. Extensions are safe — enabling or disabling one can never corrupt or affect the accounting data. The core bookkeeping is a walled garden that extensions can look into but never modify.

**Important:** Features like POS Z-Report Import and Shopify Order Import are EXTENSIONS. They import data into the extension's own storage and provide analytics on that data. They do not create journal entries from imported data. The bookkeeping of POS data or Shopify orders is a separate activity the user does in the core platform.

### 2. Data source depends on the extension — three patterns

**Pattern A: Fed from core accounting data**
Some extensions are fed existing bookkeeping data. For example, a "Food Cost %" extension reads journal entries for food purchase accounts (4000-series) and food revenue accounts (3000-series), then calculates and displays the metric. The user doesn't enter anything — the data already exists in the bookkeeping. These are extensions for data that Fortnox, Visma, and other accounting systems already have.

**Pattern B: User submits data manually**
Some extensions need data that doesn't exist in any accounting system. No system tracks liters of alcohol sold, or daily staff tips, or room occupancy counts. For these extensions, the user manually submits data into the extension's workspace. The extension stores, processes, and displays this data. This has nothing to do with the core accounting functionality.

**Pattern C: Both**
Some extensions combine core accounting data with user-submitted data. "Earnings Per Alcohol Liter" reads alcohol revenue from the bookkeeping (Pattern A) and takes user-entered liter counts (Pattern B) to calculate revenue per liter.

### 3. Full marketplace for post-onboarding management

After onboarding, users have a dedicated "Extensions" marketplace page where they can:
- Browse all available extensions (general + all sectors)
- Read descriptions and details
- Toggle extensions on/off at any time
- Discover extensions from sectors other than their primary one

### 4. Primary sector with cross-sector browsing

During onboarding, the user selects a **primary sector** (e.g. "Restaurant & Cafe"). The app then suggests extensions for that sector, plus general extensions. But the user is NOT locked in — they can browse and enable extensions from any sector at any time via the marketplace.

The primary sector serves as a **recommendation filter**, not a restriction.

### 5. First-party now, third-party later

We build all extensions ourselves initially. But the architecture should be clean and well-defined enough that external developers could eventually build extensions too. This means:
- Clear extension interface/contract
- Well-documented data access patterns
- Self-contained extension structure (each extension is a standalone module)

---

## The User Experience

1. User signs up, goes through onboarding
2. During onboarding, they select their business sector ("Restaurant & Cafe")
3. The app suggests extensions: general extensions + extensions for that sector
4. User toggles on the ones they want
5. On the dashboard, the sidebar has a **"Your Extensions"** section listing all enabled extensions
6. Clicking an extension opens its workspace — a dedicated page with the extension's own UI
7. The user interacts with the extension: views data, enters inputs, sees calculations/reports
8. User can browse the marketplace anytime to add/remove extensions

---

## Extension Definition

### What an Extension Contains

| Part | Required? | Description |
|------|-----------|-------------|
| **Metadata** | Yes | Name, description, sector (or 'general'), category, icon — for marketplace and sidebar |
| **Workspace UI** | Yes | A React component — the main page the user sees when they click the extension |
| **Extension data** | Depends | Storage for user-submitted data and extension state |
| **Configuration** | Optional | Settings panel for customizing the extension's behavior |
| **Core data queries** | Optional | Queries that read from journal entries, transactions, invoices, etc. |

### Extension Interface

```typescript
interface ExtensionDefinition {
  // Identity
  slug: string                      // URL-safe ID, unique within sector (e.g. 'earnings-per-liter')
  name: string                      // Display name (e.g. 'Earnings Per Alcohol Liter')
  sector: string                    // 'general' | 'restaurant' | 'construction' | 'hotel' | 'tech' | 'ecommerce'
  category: ExtensionCategory       // 'accounting' | 'reports' | 'import' | 'operations'

  // Display (for marketplace and sidebar)
  description: string               // One-line description
  longDescription: string           // Detailed description with features
  icon: string                      // Lucide icon name
  entityTypes?: EntityType[]        // Supported entity types (default: both EF and AB)

  // Data patterns
  dataPattern: 'core' | 'manual' | 'both'  // How the extension gets its data
  readsCoreTables?: string[]        // Which core tables this extension reads (for pattern A/C)
  hasOwnData?: boolean              // Whether users submit data into this extension (for pattern B/C)
}
```

### Sector Definition

```typescript
interface Sector {
  slug: string                      // 'general' | 'restaurant' | 'construction' | etc.
  name: string                      // 'General' | 'Restaurant & Cafe' | etc.
  icon: string                      // Lucide icon name
  description: string               // Short tagline
  extensions: ExtensionDefinition[]
}
```

### Extension Categories

```typescript
type ExtensionCategory = 'accounting' | 'reports' | 'import' | 'operations'
```

| Category | Color | Purpose |
|----------|-------|---------|
| Accounting & Tax | Red | Calculations related to bookkeeping, VAT, deductions |
| Industry Reports | Blue | KPIs, analytics, metrics |
| Smart Import | Green | Parse and import data from external tools |
| Operational Tools | Gray | Day-to-day business tools |

---

## Concrete Examples

| Extension | Sector | Data Pattern | User Input | Reads Core Data | What it Does |
|-----------|--------|--------------|------------|-----------------|--------------|
| Receipt OCR | General | B (manual) | Uploads receipt images | None | Scans receipts, extracts merchant/amount/VAT data |
| AI Categorization | General | A (core) | None | Uncategorized transactions | Suggests BAS account categories using AI |
| Enable Banking | General | B (manual) | Bank connection setup | None | Syncs bank transactions via PSD2 |
| Earnings Per Alcohol Liter | Restaurant | A + B (both) | Liters sold per day/week | Alcohol revenue from BAS 3001 | Calculates revenue/liter, trends over time |
| Food Cost % | Restaurant | A (core) | None | Food purchases (4000-series), food revenue (3000-series) | Calculates food_cost/food_revenue %, trends |
| Tip Tracking | Restaurant | B (manual) | Tip amounts per shift | Optionally reads staff cost accounts | Total tips, tips/employee, tip % of revenue |
| POS Z-Report Import | Restaurant | B (manual) | Uploads Z-report CSV/Excel | None | Parses POS data, stores in extension, shows daily sales analytics |
| Shopify Order Import | E-commerce | B (manual) | Uploads order export | None | Imports orders into extension, shows revenue by product, trends |
| ROT Calculator | Construction | A + B (both) | Labor hours, material costs per job | Invoice data for customer billing | ROT deduction amounts (30% of labor, max 50k/year per customer) |
| RevPAR | Hotel | A + B (both) | Room count and occupancy | Room revenue accounts | Revenue Per Available Room, occupancy rate |
| Billable Hours Ratio | IT/Consulting | A + B (both) | Hours worked per project | Invoice data for billed amounts | Billable/total hours, effective hourly rate |

---

## Architecture

### Where Things Live

```
extensions/
  general/                          ← General extensions
    receipt-ocr/
      index.ts                      ← Extension definition + logic
      lib/
      __tests__/
    ai-categorization/
      index.ts
      lib/
    ai-chat/
      index.ts
      lib/
    push-notifications/
      index.ts
      lib/
    enable-banking/
      index.ts
      lib/
  restaurant/                       ← Restaurant sector
    earnings-per-liter/
      index.ts
      lib/
    food-cost/
      index.ts
      lib/
    pos-import/
      index.ts
      lib/
    tip-tracking/
      index.ts
      lib/
  construction/                     ← Construction sector
    rot-calculator/
      index.ts
      lib/
  hotel/                            ← Hotel sector
    revpar/
      index.ts
      lib/
  tech/                             ← IT/Consulting sector
    billable-hours/
      index.ts
      lib/
  ecommerce/                        ← E-commerce sector
    shopify-import/
      index.ts
      lib/

lib/
  extensions/
    types.ts                        ← ExtensionDefinition, Sector, ExtensionCategory types
    sectors.ts                      ← Sector + extension metadata registry (source of truth)
    workspace-registry.tsx           ← Maps sector/slug → lazy-loaded React component
    hooks.ts                        ← useExtensionToggle, useEnabledExtensions

components/
  extensions/
    ExtensionWorkspaceShell.tsx     ← Shared layout wrapper
    shared/                         ← Shared UI primitives
      KPICard.tsx
      DataEntryForm.tsx
      DateRangeFilter.tsx
      EmptyExtensionState.tsx
      ExtensionLoadingSkeleton.tsx
    general/                        ← General extension workspaces
      ReceiptOcrWorkspace.tsx
      AiCategorizationWorkspace.tsx
      AiChatWorkspace.tsx
    restaurant/                     ← Restaurant extension workspaces
      EarningsPerLiterWorkspace.tsx
      FoodCostWorkspace.tsx
      PosImportWorkspace.tsx
    construction/
      RotCalculatorWorkspace.tsx
    hotel/
      RevparWorkspace.tsx
    tech/
      BillableHoursWorkspace.tsx
    ecommerce/
      ShopifyImportWorkspace.tsx

app/(dashboard)/
  extensions/                       ← Marketplace
    page.tsx                        ← Extension hub (browse sectors + general)
    [sector]/
      page.tsx                      ← Extensions for a specific sector
      [extension]/
        page.tsx                    ← Extension detail + toggle
  e/                                ← Extension workspaces
    [sector]/
      [slug]/
        page.tsx                    ← Renders the workspace component
```

### Data Storage

Extensions store their data in the existing `extension_data` table:

```
extension_data:
  user_id:      auth user
  extension_id: 'restaurant/earnings-per-liter'   (sector/slug format)
  key:          'settings' | 'entries' | 'config' | custom keys
  value:        JSONB (flexible)
```

For the "Earnings Per Liter" extension, data might look like:
```
key: 'settings'     → { "defaultUnit": "liter", "currency": "SEK" }
key: 'entries'      → [{ "date": "2025-01-15", "liters": 42.5, "type": "spirits" }, ...]
key: 'config'       → { "revenueAccounts": ["3001"], "trackByType": true }
```

### The Toggle System

New database table:

```sql
create table extension_toggles (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users on delete cascade,
  sector_slug     text not null,       -- 'general' | 'restaurant' | 'construction' | etc.
  extension_slug  text not null,
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint extension_toggles_unique unique (user_id, sector_slug, extension_slug)
);
```

Also add to company_settings:
```sql
alter table company_settings add column sector_slug text;
```

### API Routes for Extensions

Each extension that needs data persistence gets API routes:

```
app/api/extensions/[sector]/[slug]/
  data/route.ts       — GET (read entries), POST (submit new entry), DELETE (remove entry)
  settings/route.ts   — GET (read settings), PATCH (update settings)
```

These are simple CRUD routes that read/write to `extension_data`. They follow the existing API route pattern (auth check, RLS, user_id filtering).

### Sidebar Integration

The sidebar (`DashboardNav.tsx`) gets a new section: **"Your Extensions"**. It reads enabled extensions from `extension_toggles` and renders links:

```
── Your Extensions ──────────
  📷 Receipt OCR             → /e/general/receipt-ocr
  🤖 AI Categorization       → /e/general/ai-categorization
  📊 Food Cost %             → /e/restaurant/food-cost
  🍷 Earnings Per Liter      → /e/restaurant/earnings-per-liter
```

Each link goes to `/e/{sector}/{slug}` which renders the extension's workspace component.

### Onboarding Integration

Add two new steps to the onboarding flow (after entity type selection):

**Step 2: Sector Selection**
"What type of business do you run?"
Grid of sectors with icons and descriptions. User picks one.
Stores `sector_slug` on `company_settings`.

**Step 3: Extension Suggestions**
"Here are tools for your business. Pick the ones you want."
Shows general extensions + extensions for the selected sector, grouped by category.
User toggles desired extensions. Inserts into `extension_toggles`.
Can be skipped — user can always add extensions later from the marketplace.

---

## The Extension Workspace Pattern

Every extension workspace follows the same pattern:

```
┌─────────────────────────────────────────────────┐
│  Extension Workspace Shell                       │
│  ┌─────────────────────────────────────────────┐ │
│  │  Header: Extension name + settings link     │ │
│  ├─────────────────────────────────────────────┤ │
│  │                                             │ │
│  │  Extension-specific UI                      │ │
│  │                                             │ │
│  │  This is where the extension does its thing │ │
│  │  - Data entry forms                         │ │
│  │  - KPI cards and charts                     │ │
│  │  - Tables of submitted data                 │ │
│  │  - Calculation results                      │ │
│  │  - Date range filters                       │ │
│  │                                             │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

The `ExtensionWorkspaceShell` provides consistent chrome (header, breadcrumbs, settings link). The extension fills in the content area with whatever UI it needs.

### Example: Earnings Per Alcohol Liter

When the user clicks this extension, they see:

1. **KPI cards at top**: Current earnings/liter, trend vs last month, total liters this month
2. **Data entry section**: Form to log daily sales (date, liters sold, alcohol type)
3. **History table**: Past entries with edit/delete
4. **Chart**: Earnings per liter over time (line chart)
5. **Revenue breakdown**: Reads from core journal entries — alcohol revenue by account

The extension reads revenue data from journal_entry_lines (BAS 3001 for 25% alcohol revenue) and combines it with user-submitted liter data to calculate the metric.

---

## Migration from Current Architecture

The current codebase has receipt-ocr, ai-categorization, ai-chat, push-notifications, sru-export, ne-bilaga, and enable-banking implemented as always-on server-side plugins using the `Extension` interface, the extension registry, and the event bus.

These need to become general extensions in the new system:
1. Move from `extensions/{name}/` to `extensions/general/{name}/`
2. Add metadata (description, icon, category) to each
3. Register them in the sector data registry under the `general` sector
4. Create workspace components for each
5. Make them toggleable via `extension_toggles` (instead of always loaded)
6. The existing event bus integration and server-side behavior stays — general extensions may still use the event bus for background processing (e.g. ai-categorization reacting to transaction.synced). The toggle check becomes a gate in their event handlers.

Note: SRU export and NE-bilaga may remain as core features since they're legally required for Swedish accounting compliance, not optional value-adds. This is a decision to make during implementation.

---

## What Needs to Be Built

1. **Extension types** — ExtensionDefinition, Sector, ExtensionCategory in types
2. **Sector data registry** — All sectors and extension metadata in code
3. **Database migration** — extension_toggles table + sector_slug on company_settings
4. **Toggle hooks** — useExtensionToggle, useEnabledExtensions (client-side)
5. **Workspace component registry** — Maps sector/slug → lazy-loaded React component
6. **Workspace routing** — `app/(dashboard)/e/[sector]/[slug]/page.tsx`
7. **Workspace shell** — Shared layout wrapper component
8. **Marketplace pages** — `app/(dashboard)/extensions/` for browsing and toggling
9. **Sidebar "Your Extensions"** — Wire enabled extensions into DashboardNav
10. **Onboarding steps** — Sector selection + extension suggestions
11. **Shared UI components** — KPICard, DataEntryForm, DateRangeFilter, EmptyExtensionState
12. **Extension API routes** — Generic CRUD for extension_data
13. **Migrate general extensions** — Move current extensions to new toggle system
14. **Build first sector extensions** — Starting with restaurant sector

---

## Summary

**The app** is a Swedish accounting platform.

**Core functionality** is the standard accounting system: bookkeeping, invoicing, reports, tax, bank reconciliation. Every user gets this.

**Extensions** are everything beyond core accounting. They come in two kinds:
- **General extensions** (receipt-ocr, ai-categorization, etc.) — useful for any business, not sector-specific
- **Sector extensions** (food cost %, earnings per liter, etc.) — tied to a specific market sector

All extensions live in the same system, use the same toggle mechanism, appear in the same marketplace, and show up under "Your Extensions" in the sidebar. No extensions are active by default — the user chooses which ones to add.

Extensions are read-only with respect to the core accounting system. They can be fed accounting data, they can accept manual user input, but they never write back to the bookkeeping.
