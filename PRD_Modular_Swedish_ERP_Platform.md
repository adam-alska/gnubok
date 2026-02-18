# Product Requirements Document
## Modular Swedish ERP & Accounting Platform

**Version 2.0 | February 2026 | CONFIDENTIAL**

*A next-generation bokföringssystem for Swedish aktiebolag*

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision & Positioning](#2-product-vision--positioning)
3. [Target Users & Market](#3-target-users--market)
4. [Core Platform Architecture](#4-core-platform-architecture)
5. [Module System Design](#5-module-system-design)
6. [Core Accounting Engine (Always Active)](#6-core-accounting-engine-always-active)
7. [Module Catalog: Categories & Modules](#7-module-catalog-categories--modules)
8. [Industry Packs & Business Type Recommendations](#8-industry-packs--business-type-recommendations)
9. [User Experience & Onboarding Flow](#9-user-experience--onboarding-flow)
10. [Technical Architecture](#10-technical-architecture)
11. [Database Design](#11-database-design)
12. [Event System](#12-event-system)
13. [Security & Compliance](#13-security--compliance)
14. [Integration Strategy](#14-integration-strategy)
15. [Development Roadmap](#15-development-roadmap)
16. [Business Model & Pricing](#16-business-model--pricing)
17. [Success Metrics & KPIs](#17-success-metrics--kpis)
18. [Risks & Mitigations](#18-risks--mitigations)
19. [Appendices](#19-appendices)

---

## 1. Executive Summary

This document defines the product requirements for a modular Swedish ERP and accounting platform designed to compete directly with Fortnox and Visma. The platform takes a fundamentally different architectural approach: rather than offering a rigid, one-size-fits-all product, it provides a rock-solid core accounting engine with a composable module system that lets every business tailor their experience to their specific industry and needs.

The core insight driving this product is that a restaurant, a hair salon, and a consulting firm all need correct Swedish accounting (BAS-kontoplan, momsredovisning, SIE export), but their day-to-day operational needs are completely different. Today, they all use the same generic Fortnox interface. This platform changes that by letting each business activate industry-specific modules that add relevant functionality, terminology, dashboards, and workflows on top of a shared, audited accounting foundation.

The platform targets Swedish aktiebolag (limited companies) with 5 to 50 employees, starting with the Food & Beverage industry cluster before expanding to Beauty & Wellness, Fitness & Health, and beyond.

> **Key Differentiator:** Every business gets a complete Swedish bokföringssystem out of the box. The module system lets them shape their platform to their industry without custom development, code generation, or AI-driven modifications. Modules are pre-built, tested, and audited by the platform team. The user simply activates what they need.

### 1.1 Document Scope

This PRD covers the full product vision, technical architecture, module system design, core accounting engine specification, initial module catalog, onboarding flow, development roadmap, and business model. It is intended for the founding engineering team and serves as the authoritative reference for building the MVP and subsequent releases.

---

## 2. Product Vision & Positioning

### 2.1 Vision Statement

Build the most adaptable accounting platform in Sweden, where every business gets a system that feels like it was built specifically for their industry — powered by a modular architecture that makes this economically viable at scale.

### 2.2 Positioning

The platform sits in a unique position in the Swedish market:

| Competitor | Strength | Weakness | Our Advantage |
|---|---|---|---|
| **Fortnox** | Market leader, trusted, integrations | Rigid, same UI for everyone, slow to innovate | Industry-tailored experience from day one |
| **Visma** | Enterprise-grade, comprehensive | Complex, expensive, overwhelming for SMBs | Simple to start, grows with you via modules |
| **Bokio** | Simple, modern UI, free tier | Too basic for growing businesses | Professional-grade with modular depth |
| **Odoo** | Highly modular, open source | Complex setup, requires developer, not Swedish-first | Swedish-native, no developer needed, curated modules |

### 2.3 Core Principles

- **Correctness first:** The accounting engine must be bulletproof. Swedish accounting standards (BAS, K2/K3, BFL, BFN) are non-negotiable. Every module that touches financial data must maintain the integrity of the general ledger.
- **Composition over configuration:** Users don't configure complex settings. They activate pre-built modules. The platform composes their experience from tested building blocks.
- **Industry-native experience:** When a restaurant owner uses the platform, it should feel like it was built for restaurants. The terminology, the dashboards, the workflows, the reports — all should speak their language.
- **Progressive complexity:** Start simple. A sole-owner café might only use core accounting and invoicing. A multi-location restaurant group might activate 15 modules. Both are well-served.
- **Open data, no lock-in:** SIE4 export is always available. Users own their data. The platform competes on value, not on trapping users.

---

## 3. Target Users & Market

### 3.1 Primary Target

Swedish aktiebolag (AB) with 5–50 employees. This segment is large enough to need real accounting but small enough to be underserved by enterprise ERP systems. They typically use Fortnox or Visma today and find these tools either too rigid or too complex.

### 3.2 User Personas

#### Persona 1: The Restaurant Owner

- **Name:** Maria, 38, owns a mid-range restaurant in Göteborg with 12 employees
- **Current tools:** Fortnox for accounting, Excel for food cost tracking, paper for daily cash reconciliation
- **Pain points:** Can't see real-time food cost percentage in her accounting system. Spends hours reconciling Z-rapporter manually. Her accountant (redovisningskonsult) has to explain the financial reports because they're too abstract.
- **What she wants:** Open the app in the morning, see yesterday's omsättning, matkostnadsprocent, and personalkostnad. Import Z-rapport with one click. Have her bokföringsbyrå access the same system.

#### Persona 2: The Redovisningskonsult

- **Name:** Erik, 45, runs a small bokföringsbyrå with 8 clients across different industries
- **Current tools:** Fortnox for all clients, same interface regardless of industry
- **Pain points:** Has to manually set up chart of accounts differently for each client. Wastes time explaining generic reports. Wants to standardize his process per industry.
- **What he wants:** Set up a new restaurant client in 10 minutes with the right modules pre-activated. See all his clients in one view. Access industry-relevant reports without custom configuration.

#### Persona 3: The Growing Business

- **Name:** Ahmed, 32, started a food truck, now expanding to a second location and considering a café
- **Current tools:** Bokio (outgrowing it), spreadsheets for everything else
- **Pain points:** Bokio is too basic. Fortnox feels like it's built for accountants, not business owners. Needs to track multiple locations but doesn't want enterprise pricing.
- **What he wants:** A system that grows with him. Start with food truck modules, add café modules when he expands. One platform, one subscription, one view of his whole business.

### 3.3 Market Size

There are approximately 430,000 active aktiebolag in Sweden. The addressable market of businesses with 5–50 employees in service industries represents roughly 80,000–120,000 companies. The Swedish cloud accounting market is estimated at 8–10 billion SEK annually.

---

## 4. Core Platform Architecture

### 4.1 Architecture Overview

The platform follows a three-layer architecture where each layer has clear responsibilities and boundaries:

| Layer | Description | Who Controls It | Examples |
|---|---|---|---|
| **Layer 1: Core Engine** | Accounting foundation. Always active. Handles double-entry bookkeeping, BAS-kontoplan, moms, SIE, financial statements. | Platform team only. Never modified by modules. | Huvudbok, verifikationer, momsredovisning, resultaträkning, balansräkning |
| **Layer 2: Feature Modules** | Self-contained functionality packages. Activated per tenant. Hook into the core via events and APIs. | Platform team builds all modules. Users activate/deactivate. | Fakturering, kassaintegration, matkostnadsanalys, kvittoskanning |
| **Layer 3: Business Type Config** | Metadata layer. Maps business types to recommended modules. Controls UI terminology and dashboard defaults. | Platform team maintains mappings. Users select their type. | Restaurant pack, Salon pack, Gym pack |

### 4.2 Multi-Tenancy Model

The platform is a single-codebase, multi-tenant SaaS application. All tenants share the same deployment, the same database server (Supabase PostgreSQL), and the same module code. Tenant isolation is achieved through a `tenant_id` column on every database table, enforced at both the application level and through PostgreSQL Row Level Security (RLS) policies — a natural fit since Supabase has first-class RLS support.

Each tenant has a configuration record that tracks which modules are active, which business type they've selected, and any module-specific settings. This configuration drives the entire user experience: which navigation items appear, which dashboard widgets are shown, which pages are accessible, and which API endpoints are available.

### 4.3 Module Lifecycle

Modules go through the following states:

- **Available:** The module exists in the catalog but is not active for this tenant. Its pages, widgets, and routes are hidden.
- **Activating:** The user has chosen to activate the module. The platform runs the module's `onActivate` hook, which may seed default data and register event subscriptions.
- **Active:** The module is fully operational. Its navigation items, pages, widgets, API routes, and event hooks are all live.
- **Deactivating:** The user has chosen to deactivate. The platform runs `onDeactivate`, which hides UI elements and unregisters event hooks. Data is preserved.
- **Inactive:** Same as Available but retains any data from when it was active. Reactivating restores the module with its previous data intact.

> **Design Decision — Data Preservation:** When a module is deactivated, its data is never deleted. This is critical for accounting integrity. If a user activated kassaintegration for 6 months and then deactivated it, those 6 months of dagskassa records must remain in the database and be accessible for auditing and reporting. Deactivation only hides the UI and stops event processing.

---

## 5. Module System Design

### 5.1 Module Contract

Every module is a feature folder in the codebase that exports a standardized definition. This contract is the foundation of the entire system. A module can register the following capabilities:

| Capability | Description | Example |
|---|---|---|
| **Database Schema** | New tables required by this module (defined in Supabase migrations) | `mod_kassa_dagskassa` table for daily cash register data |
| **API Routes** | Next.js API route handlers under `app/api/modules/{moduleId}/` | `GET /api/modules/kassaintegration/dagskassa/:date` |
| **Supabase Edge Functions** | Server-side logic for external integrations requiring secrets | Tink bank API calls, Stripe webhook processing |
| **Event Hooks** | Subscriptions to core events or other module events | On `leverantorsfaktura.added`, check if food supplier and update food cost |
| **Navigation Items** | Sidebar menu entries that appear when module is active | "Dagskassa" and "Z-rapporter" menu items |
| **Pages** | Full page views accessible via Next.js routing | DagskassaPage showing daily sales breakdown |
| **Dashboard Widgets** | Cards/charts that appear on the user's dashboard | Today's sales widget showing revenue vs yesterday |
| **Settings Panel** | Module-specific configuration UI | Select POS system type, configure moms split defaults |
| **Seed Data** | Default data created when module is activated | Default BAS-konto mappings for food cost categories |
| **Scheduled Jobs** | Recurring background tasks (via Supabase pg_cron or Edge Functions + cron) | Nightly food cost percentage rollup calculation |
| **Dependencies** | Other modules that must be active for this one to work | Matkostnadsanalys depends on varuinkop module |

### 5.2 Module Registration Pattern

Modules are statically imported and registered at build time. There is no dynamic plugin loading. This is a deliberate choice for a small team: it keeps the system simple, fully type-safe, and easy to debug. Every module is part of the same codebase, the same test suite, and the same deployment.

The module registry maintains a master list of all available modules. At runtime, it consults the tenant's configuration (stored in the `tenant_modules` table in Supabase) to determine which modules are active and should have their routes, hooks, and UI elements registered for that tenant's requests.

### 5.3 Module Isolation Rules

- **Modules may read from core tables:** Any module can query the general ledger, chart of accounts, invoices, and other core data via Supabase client or server-side queries.
- **Modules must not write to core tables directly:** Instead, modules use core services (e.g., `verifikation.create()`) to interact with the accounting engine. This ensures all writes go through validation and double-entry enforcement.
- **Modules own their own tables:** Each module prefixes its tables (e.g., `mod_kassa_`, `mod_food_cost_`) and has full read/write access to them. All module tables have RLS policies scoped to `tenant_id`.
- **Modules communicate via events:** If module A needs to notify module B of something, it emits an event. Module B subscribes. There are no direct function calls between modules.
- **Modules may extend core UI:** Modules can add widgets to the dashboard, items to the navigation, and columns to existing list views via extension points defined by the core.

### 5.4 Module Dependency Management

Some modules depend on other modules. For example, matkostnadsanalys (food cost analysis) requires varuinkop (purchasing) to be active because it analyzes purchasing data. When a user tries to activate a module with unmet dependencies, the platform clearly shows what else needs to be activated and offers to activate the dependencies together.

Circular dependencies are not allowed and are enforced at build time through static analysis of the module definitions.

---

## 6. Core Accounting Engine (Always Active)

### 6.1 Overview

The core accounting engine is the non-negotiable foundation of the platform. It is always active for every tenant and cannot be deactivated or modified by modules. It implements Swedish accounting standards as defined by BFN (Bokföringsnämnden), BFL (Bokföringslagen), and ÅRL (Årsredovisningslagen) for K2 companies.

### 6.2 Chart of Accounts (BAS-kontoplan)

The platform ships with the standard BAS-kontoplan pre-configured. On tenant creation, the full BAS 2024 chart of accounts is seeded into the tenant's account table. The platform supports all standard BAS account classes:

| Class | Range | Description | Examples |
|---|---|---|---|
| 1 | 1000–1999 | Tillgångar (Assets) | 1930 Bankkonto, 1910 Kassa, 1510 Kundfordringar |
| 2 | 2000–2999 | Eget kapital & skulder | 2440 Leverantörsskulder, 2610 Utgående moms 25% |
| 3 | 3000–3999 | Intäkter (Revenue) | 3001 Försäljning varor 25%, 3002 Försäljning varor 12% |
| 4 | 4000–4999 | Varuinköp & direkta kostnader | 4010 Inköp varor, 4011 Inköp livsmedel |
| 5–6 | 5000–6999 | Övriga externa kostnader | 5010 Lokalhyra, 6110 Kontorsförnödenheter |
| 7 | 7000–7999 | Personalkostnader | 7010 Löner, 7510 Arbetsgivaravgifter |
| 8 | 8000–8999 | Finansiella poster & bokslut | 8310 Ränteintäkter, 8999 Årets resultat |

Users can customize account names and add sub-accounts but cannot modify the fundamental structure. Modules can suggest additional accounts during their activation (e.g., the food cost module suggests adding 4011 Inköp livsmedel if not present).

### 6.3 Double-Entry Bookkeeping Engine

Every financial transaction in the system is recorded as a verifikation (journal entry) with one or more debit and credit rows that must balance to zero. The engine enforces the following invariants:

- **Balance requirement:** Sum of all debit amounts must equal sum of all credit amounts for every verifikation. Unbalanced entries are rejected.
- **Immutability:** Posted verifikationer cannot be modified. Corrections are made by creating new correcting entries. This complies with BFL 5 kap. 5§.
- **Sequential numbering:** Verifikationer are numbered sequentially within each räkenskapsår (fiscal year) with no gaps. This complies with BFL 5 kap. 6§.
- **Audit trail:** Every verifikation records who created it, when, and from which source (manual entry, module, import, integration).
- **Period control:** Entries can only be posted to open periods. Closed periods are locked and require explicit re-opening with audit logging.

### 6.4 Momsredovisning (VAT Reporting)

The platform handles Swedish moms (VAT) at all standard rates:

| Rate | Usage | BAS Account (Output) | BAS Account (Input) |
|---|---|---|---|
| 25% | Standard rate (most goods and services) | 2610 Utgående moms 25% | 2640 Ingående moms |
| 12% | Food, restaurant services, hotel | 2620 Utgående moms 12% | 2640 Ingående moms |
| 6% | Books, newspapers, culture, transport | 2630 Utgående moms 6% | 2640 Ingående moms |
| 0% | Healthcare, education, financial services | N/A | N/A |

The system automatically determines the momsredovisningsperiod based on the company's annual turnover: monthly (omsättning > 40M SEK), quarterly (> 1M SEK), or annually. It generates the momsdeklaration (VAT return) data in the format required by Skatteverket.

### 6.5 Financial Statements

The core engine generates the following reports, always available to every tenant:

- **Resultaträkning (Income Statement):** Follows the K2 format with revenue, cost of goods sold, gross profit, operating expenses, operating result, financial items, and net result.
- **Balansräkning (Balance Sheet):** Assets (tillgångar), equity and liabilities (eget kapital och skulder), following K2 structure.
- **Huvudbok (General Ledger):** Complete listing of all transactions per account for any selected period.
- **Verifikationslista (Journal Entry List):** Sequential list of all verifikationer with full details.
- **Saldobalans (Trial Balance):** All accounts with their debit/credit balances for a selected period.
- **Momsrapport (VAT Report):** Summary of output and input VAT for the declaration period.

### 6.6 SIE4 Import & Export

SIE (Standard Import Export) version 4 is the standard data exchange format for Swedish accounting. The platform supports full SIE4 import (for migrating from another system) and export (for sharing with accountants or switching systems). The import process validates data integrity, maps accounts to the BAS-kontoplan, and flags any discrepancies for manual review.

### 6.7 Räkenskapsår (Fiscal Year) Management

The core supports standard calendar-year fiscal years (January–December) and brutet räkenskapsår (non-calendar fiscal years). It handles årsbokslut (year-end closing) by transferring the result to retained earnings and opening balances for the new year. The first räkenskapsår may be shorter or longer than 12 months as permitted by ÅRL.

---

## 7. Module Catalog: Categories & Modules

### 7.1 Catalog Structure

The module catalog is organized into categories. Each category groups related functionality. Users browse the catalog to discover and activate modules. When a user selects their business type, relevant categories and modules are highlighted with recommendation badges.

### 7.2 Category: Fakturering & Betalning

Modules related to invoicing, payments, and accounts receivable.

| Module | Description | Dependencies | Key Features |
|---|---|---|---|
| **Kundfakturering** | Create, send, and manage customer invoices with Swedish compliance (Mervärdeskattelagen) | Core | Invoice creation, PDF generation, email sending, OCR-nummer, payment status tracking, kundreskontra |
| **Autofakturering** | Recurring invoice automation for subscription-based services | Kundfakturering | Recurring schedules, automatic generation and sending, pause/resume |
| **ROT/RUT-hantering** | Handle ROT and RUT tax deductions on invoices per Skatteverket rules | Kundfakturering | Automatic calculation of deduction amount, Skatteverket formatting, buyer personnummer handling |
| **Påminnelser & Inkasso** | Automated payment reminders and debt collection integration | Kundfakturering | Configurable reminder schedules, late fees (dröjsmålsränta), inkasso handoff |

### 7.3 Category: Bank & Likviditet

| Module | Description | Dependencies | Key Features |
|---|---|---|---|
| **Bankintegration** | Auto-import bank transactions via Tink or Open Banking APIs | Core | Daily auto-import, multi-bank support, transaction categorization |
| **Automatisk matchning** | AI-assisted matching of bank transactions to invoices and expenses | Bankintegration | Rule-based matching, learning from corrections, unmatched queue |
| **Likviditetsprognos** | Cash flow forecasting based on receivables, payables, and recurring costs | Bankintegration, Kundfakturering | 30/60/90-day forecasts, scenario modeling, alert thresholds |

### 7.4 Category: Leverantörer & Inköp

| Module | Description | Dependencies | Key Features |
|---|---|---|---|
| **Leverantörsreskontra** | Manage supplier invoices, payment tracking, and accounts payable | Core | Invoice registration, due dates, payment scheduling, OCR import |
| **Inköpsorder** | Create and track purchase orders to suppliers | Leverantörsreskontra | PO creation, supplier management, delivery tracking, PO-to-invoice matching |
| **Kvittoskanning** | OCR-based receipt scanning that auto-creates bokföring entries | Core | Photo capture, OCR extraction, auto-kontosättning, manual review queue |

### 7.5 Category: Rapporter & Analys

| Module | Description | Dependencies | Key Features |
|---|---|---|---|
| **Budgetmodul** | Set budgets per account/category and track actual vs budget | Core | Annual budget setup, monthly breakdown, variance analysis, alerts |
| **KPI-dashboard** | Customizable dashboard with business-relevant key metrics | Core | Configurable widgets, period comparison, export to PDF |
| **Periodjämförelse** | Compare financial performance across months, quarters, or years | Core | Side-by-side comparison, trend visualization, anomaly highlighting |

### 7.6 Category: Personal & Lön

| Module | Description | Dependencies | Key Features |
|---|---|---|---|
| **Löneintegration** | Import salary data from external payroll systems (Hogia, Visma Lön, etc.) | Core | File import, auto-bokföring of payroll entries, arbetsgivaravgifter |
| **Personalkostnadsöversikt** | Track and analyze total staff costs vs revenue | Löneintegration | Cost per employee, ratio to omsättning, trend analysis |
| **Traktamente & Utlägg** | Employee expense and travel allowance management | Core | Expense submission, approval workflow, Skatteverket traktamente rates |
| **Semesterskuldberäkning** | Calculate and track vacation pay liability per employee | Löneintegration | Automatic calculation per ÅL, liability tracking, period accruals |

### 7.7 Category: Restaurang & Mat (F&B Cluster)

These modules are recommended for businesses in the Food & Beverage industry cluster. This is the first industry-specific category to be built.

| Module | Description | Dependencies | Key Features |
|---|---|---|---|
| **Kassaintegration** | Import Z-rapporter from POS systems and auto-bokför daily sales | Core | CSV/file import, iZettle/Trivec support, automatic moms split (12%/25%), dagskassaavstämning |
| **Matkostnadsanalys** | Track and analyze food cost as percentage of revenue | Inköpsorder | Daily/weekly/monthly food cost %, target vs actual, trend charts, alerts when over target |
| **Svinnhantering** | Record and analyze food waste by category | Matkostnadsanalys | Waste logging, cost calculation, waste-to-revenue ratio, category breakdown |
| **Tipshantering** | Track, allocate, and report tips received by staff | Core | Tip pool management, per-employee allocation, tax reporting, bokföring integration |
| **Receptkalkyl** | Calculate cost per recipe/menu item based on ingredient prices | Inköpsorder | Recipe builder, cost per portion, margin calculation, price change impact analysis |
| **Alkohol & Accis** | Handle alcohol excise tax (punktskatt) for breweries and bars | Core | Accis calculation, Tullverket reporting format, inventory tracking for excise goods |

### 7.8 Future Categories (Post-MVP)

The following categories are planned for future development and listed here to inform architectural decisions:

- **Salong & Skönhet:** Bokningsintegration, provisionsberäkning per anställd, produktförsäljning (retail vs tjänst moms split).
- **Fitness & Hälsa:** Medlemshantering, autogiroförsäljning, drop-in vs abonnemang tracking.
- **Bygg & Hantverkare:** ROT-avdragshantering, projektbudget vs utfall, ÄTA-hantering, underentreprenörsspårning.
- **E-handel:** Shopify/WooCommerce-integration, automatbokföring av ordrar, lagervärdering, returhantering, multi-currency.
- **Konsultbolag:** Projektredovisning, timregistrering, milstolpsfakturering, resekostnader.

---

## 8. Industry Packs & Business Type Recommendations

### 8.1 How Industry Packs Work

An industry pack is not a separate product or a pre-configured instance. It is a metadata layer that maps a business type to a set of recommended modules. When a user selects their business type during onboarding (or changes it later in settings), the platform uses this mapping to surface relevant modules in the catalog with recommendation badges.

The user is never restricted to their industry pack's recommendations. They can browse the entire catalog and activate any module. The business type selection simply provides a curated starting point.

### 8.2 F&B Cluster: Business Types and Recommended Modules

| Module | Restaurang | Café | Bageri | Bar/Pub | Bryggeri | Food Truck | Catering |
|---|---|---|---|---|---|---|---|
| Kundfakturering | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓✓ |
| Leverantörsreskontra | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Kassaintegration | ✓✓ | ✓✓ | ✓ | ✓✓ | ✓ | ✓ | — |
| Matkostnadsanalys | ✓✓ | ✓ | ✓✓ | — | ✓ | ✓ | ✓ |
| Svinnhantering | ✓✓ | ✓ | ✓✓ | — | — | ✓ | ✓ |
| Tipshantering | ✓✓ | ✓ | — | ✓✓ | — | — | — |
| Receptkalkyl | ✓ | ✓ | ✓✓ | — | ✓✓ | ✓ | ✓ |
| Alkohol & Accis | ✓ | — | — | ✓✓ | ✓✓ | — | ✓? |
| Inköpsorder | ✓ | ✓ | ✓✓ | ✓ | ✓✓ | ✓ | ✓ |
| Bankintegration | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Personalkostnadsöversikt | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| KPI-dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Legend:** ✓✓ = Highly recommended (pre-checked during onboarding), ✓ = Recommended (shown prominently), — = Not typically relevant (available but not highlighted).

### 8.3 Onboarding Module Suggestion UX

After the user selects their business type, the platform presents a module suggestion screen organized into three tiers:

- **Included with your plan:** Core accounting modules that are always active (huvudbok, moms, resultaträkning, etc.)
- **Recommended for your business:** Modules flagged as ✓✓ for their business type, pre-checked. The user can uncheck any they don't want.
- **Also popular in your industry:** Modules flagged as ✓, shown but not pre-checked.

Below these, a link to "Browse all modules" opens the full catalog. This onboarding step is skippable and all choices are changeable later.

---

## 9. User Experience & Onboarding Flow

### 9.1 Onboarding Flow

The onboarding is designed to get the user to a working, personalized accounting platform in under 5 minutes:

1. **Create Account:** Email/password or BankID login via Supabase Auth. Enter company org.nr.
2. **Company Setup:** Platform pulls company data from Bolagsverket via org.nr (company name, address, F-skatt status, momsregistrering, SNI-kod). User confirms or corrects.
3. **Import or Start Fresh:** Option to import SIE4 file from existing system (Fortnox, Visma) or start with a clean räkenskapsår. Import includes validation and discrepancy flagging.
4. **Select Business Type:** Visual grid of business types organized by industry cluster. SNI-kod from Bolagsverket can auto-suggest. User picks one (or skips for generic setup).
5. **Module Suggestions:** Based on business type, platform suggests recommended modules (as described in section 8.3). User reviews and confirms.
6. **Connect Bank:** Optional step to connect their bank account via Tink/Open Banking for automatic transaction import.
7. **Dashboard:** User lands on their personalized dashboard with active module widgets, quick-start guide, and contextual help.

### 9.2 Main Application Layout

The application follows a standard SaaS layout with module-driven navigation:

- **Left sidebar:** Primary navigation. Shows core items (Dashboard, Bokföring, Rapporter) at the top, followed by active module navigation items grouped by category. Inactive modules are not shown.
- **Top bar:** Company name, räkenskapsår selector, notification bell, user menu, and a search bar that searches across all active modules.
- **Main content area:** Renders the active page from either core or an active module via Next.js App Router.
- **Dashboard:** The home page. Shows widgets from active modules arranged in a grid. Users can rearrange widgets but the initial layout is determined by the business type configuration.

### 9.3 Module Catalog UI

Accessible from settings, the module catalog is where users discover and manage modules:

- **Category browsing:** Modules organized by category with counts showing how many are active vs available.
- **Recommendation badges:** Modules recommended for the user's business type are badged with "Rekommenderas för [business type]."
- **Module detail page:** Each module has a detail page showing description, screenshots, what it adds (pages, widgets, reports), dependencies, and an activate/deactivate button.
- **Active modules view:** A filtered view showing only currently active modules with quick deactivation options.

### 9.4 Redovisningskonsult (Accountant) Access

The platform supports a multi-user model where a business owner can invite their bokföringsbyrå (accounting firm) to access their account. The accountant gets a separate role with access to all accounting data and reports, the ability to create and edit verifikationer, perform årsbokslut, and generate SIE exports. The accountant may have access to multiple client tenants and can switch between them from a single login.

---

## 10. Technical Architecture

### 10.1 Tech Stack

| Component | Technology | Rationale |
|---|---|---|
| **Language** | TypeScript (everywhere) | Team's strongest language. Shared types between frontend and backend. Single language reduces context switching. |
| **Framework** | Next.js (App Router) | Full-stack React framework. API routes, Server Components, Server Actions, SSR/SSG — all in one. One deploy, one mental model. Eliminates need for separate backend. |
| **Styling** | Tailwind CSS + shadcn/ui | Utility-first for rapid development. shadcn/ui provides professional, accessible components out of the box. |
| **Database** | PostgreSQL (via Supabase) | Rock-solid, ACID-compliant, perfect for financial data. Supabase provides managed Postgres with built-in RLS, auth, storage, edge functions, and real-time. |
| **Backend-as-a-Service** | Supabase | Handles auth, database, storage, edge functions, real-time subscriptions, and cron jobs (pg_cron). Reduces infrastructure work dramatically for a small team. |
| **ORM / Query** | Supabase JS Client + Drizzle ORM | Supabase client for standard CRUD and RLS-enforced queries. Drizzle for complex queries, migrations, and type-safe schema definitions. |
| **Authentication** | Supabase Auth | Built-in email/password, magic link, OAuth providers, and potential for BankID via custom provider. Row-level security integrates directly with auth. |
| **File Storage** | Supabase Storage | Receipt images, invoice PDFs, SIE file uploads. Scoped per tenant with storage policies. |
| **Edge Functions** | Supabase Edge Functions (Deno) | Server-side logic requiring secrets: bank API calls (Tink), payment webhooks (Stripe), OCR processing, Skatteverket integration. |
| **Scheduled Jobs** | Supabase pg_cron + Edge Functions | Nightly food cost rollups, bank transaction sync, overdue invoice checks. pg_cron triggers Edge Functions on schedule. |
| **Hosting** | Vercel (frontend) + Supabase (backend) | Vercel for Next.js with EU region deployment. Supabase for all backend services with EU region (Frankfurt or Stockholm). Both support EU data residency. |
| **Testing** | Vitest + Playwright | Vitest for unit/integration (fast, TypeScript-native). Playwright for E2E. |
| **CI/CD** | GitHub Actions | Standard, integrates with Vercel deployments and Supabase migrations. |

### 10.2 Project Structure

The entire application lives in a single Next.js project:

```
├── app/                                    ← Next.js App Router
│   ├── (auth)/                             ← Auth pages (login, signup, onboarding)
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── onboarding/
│   │       ├── company/page.tsx
│   │       ├── business-type/page.tsx
│   │       └── modules/page.tsx
│   │
│   ├── (app)/                              ← Authenticated app shell
│   │   ├── layout.tsx                      ← Sidebar + topbar (reads active modules)
│   │   ├── dashboard/page.tsx              ← Dynamic dashboard with module widgets
│   │   │
│   │   ├── bokforing/                      ← Core accounting pages
│   │   │   ├── huvudbok/page.tsx
│   │   │   ├── verifikationer/page.tsx
│   │   │   ├── kontoplan/page.tsx
│   │   │   └── perioder/page.tsx
│   │   │
│   │   ├── rapporter/                      ← Core report pages
│   │   │   ├── resultatrakning/page.tsx
│   │   │   ├── balansrakning/page.tsx
│   │   │   ├── momsrapport/page.tsx
│   │   │   └── saldobalans/page.tsx
│   │   │
│   │   ├── moduler/                        ← Module catalog
│   │   │   ├── page.tsx                    ← Browse all modules
│   │   │   └── [moduleId]/page.tsx         ← Module detail page
│   │   │
│   │   ├── installningar/                  ← Settings
│   │   │   ├── foretag/page.tsx
│   │   │   ├── anvandare/page.tsx
│   │   │   └── moduler/page.tsx
│   │   │
│   │   └── m/                              ← Module pages (namespaced)
│   │       ├── fakturering/
│   │       │   ├── page.tsx                ← Invoice list
│   │       │   └── ny/page.tsx             ← New invoice
│   │       ├── kassaintegration/
│   │       │   ├── dagskassa/page.tsx
│   │       │   └── z-rapporter/page.tsx
│   │       ├── matkostnadsanalys/
│   │       │   └── page.tsx
│   │       └── ... more module pages
│   │
│   └── api/                                ← API routes
│       ├── core/                           ← Core accounting API
│       │   ├── verifikationer/route.ts
│       │   ├── konton/route.ts
│       │   └── rapporter/route.ts
│       ├── modules/                        ← Module API routes
│       │   ├── fakturering/route.ts
│       │   ├── kassaintegration/route.ts
│       │   └── ... more module routes
│       └── webhooks/                       ← External webhooks
│           ├── tink/route.ts
│           └── stripe/route.ts
│
├── modules/                                ← Module definitions & business logic
│   ├── _registry.ts                        ← Master module registry
│   ├── _types.ts                           ← Module contract types
│   │
│   ├── core-bokforing/                     ← Core accounting (always active)
│   │   ├── module.ts                       ← Module definition
│   │   ├── services/
│   │   │   ├── huvudbok.service.ts
│   │   │   ├── verifikation.service.ts
│   │   │   ├── moms.service.ts
│   │   │   └── sie.service.ts
│   │   ├── validators/
│   │   │   └── verifikation.validator.ts
│   │   └── events.ts                       ← Core events emitted
│   │
│   ├── fakturering/
│   │   ├── module.ts
│   │   ├── services/
│   │   │   ├── faktura.service.ts
│   │   │   └── paminnelse.service.ts
│   │   ├── components/                     ← Module-specific UI components
│   │   │   ├── FakturaForm.tsx
│   │   │   └── FakturaPreview.tsx
│   │   ├── widgets/
│   │   │   └── ObetaladaFakturorWidget.tsx
│   │   └── hooks.ts                        ← Event subscriptions
│   │
│   ├── kassaintegration/
│   │   ├── module.ts
│   │   ├── services/
│   │   │   ├── zrapport.parser.ts
│   │   │   └── dagskassa.service.ts
│   │   ├── components/
│   │   │   └── ZRapportImport.tsx
│   │   ├── widgets/
│   │   │   └── DagensForsaljningWidget.tsx
│   │   └── hooks.ts
│   │
│   ├── matkostnadsanalys/
│   │   ├── module.ts
│   │   ├── services/
│   │   │   └── food-cost.service.ts
│   │   ├── components/
│   │   │   └── FoodCostChart.tsx
│   │   ├── widgets/
│   │   │   └── MatkostnadWidget.tsx
│   │   └── hooks.ts
│   │
│   └── ... more modules
│
├── lib/                                    ← Shared utilities
│   ├── supabase/
│   │   ├── client.ts                       ← Browser Supabase client
│   │   ├── server.ts                       ← Server-side Supabase client
│   │   └── admin.ts                        ← Service role client (for migrations/admin)
│   ├── events/
│   │   ├── emitter.ts                      ← Typed event emitter
│   │   └── types.ts                        ← Event type definitions
│   ├── tenant/
│   │   ├── context.ts                      ← Tenant context provider
│   │   └── middleware.ts                   ← Tenant resolution middleware
│   └── modules/
│       ├── guard.ts                        ← Module activation check middleware
│       └── loader.ts                       ← Active module loader for UI
│
├── components/                             ← Shared UI components
│   ├── ui/                                 ← shadcn/ui components
│   ├── layout/
│   │   ├── Sidebar.tsx                     ← Module-aware sidebar
│   │   ├── Topbar.tsx
│   │   └── DashboardGrid.tsx              ← Widget grid renderer
│   └── shared/
│       ├── DataTable.tsx
│       ├── KontoSelector.tsx
│       └── PeriodPicker.tsx
│
├── supabase/                               ← Supabase configuration
│   ├── migrations/                         ← Database migrations (Drizzle-generated)
│   │   ├── 0001_core_tables.sql
│   │   ├── 0002_bas_kontoplan_seed.sql
│   │   ├── 0003_mod_fakturering.sql
│   │   ├── 0004_mod_kassaintegration.sql
│   │   └── ...
│   ├── functions/                          ← Supabase Edge Functions
│   │   ├── tink-sync/index.ts
│   │   ├── ocr-receipt/index.ts
│   │   └── nightly-rollup/index.ts
│   └── seed.sql                            ← Development seed data
│
├── types/                                  ← Global TypeScript types
│   ├── database.ts                         ← Generated Supabase types
│   ├── modules.ts                          ← Module system types
│   └── accounting.ts                       ← Accounting domain types
│
├── middleware.ts                            ← Next.js middleware (auth + tenant resolution)
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

### 10.3 Backend Architecture

The backend uses a hybrid approach leveraging both Next.js and Supabase:

- **Next.js API Routes** handle application logic: module activation/deactivation, complex business operations, report generation, SIE import/export, and any operation that requires orchestrating multiple database queries or service calls.
- **Next.js Server Actions** handle form mutations: creating verifikationer, sending invoices, updating settings — anywhere a form submits data. This eliminates boilerplate API route code for simple CRUD operations.
- **Supabase Direct Access** from the client handles simple reads: fetching lists, loading dashboard data, real-time subscriptions for collaborative editing. RLS policies ensure tenant isolation even for direct client queries.
- **Supabase Edge Functions** handle external integrations: Tink bank API calls, OCR processing, Stripe webhooks — anything requiring secrets that shouldn't be in the Next.js bundle or that benefits from running close to the data.

Request flow for a module operation: incoming request hits Next.js middleware (auth check, tenant resolution) → API route or Server Action checks module activation status → calls module service → service uses Supabase client for database operations → core events are emitted → subscribed module hooks process side effects.

### 10.4 Frontend Architecture

The frontend uses Next.js App Router with Server Components as the default. Module pages are regular Next.js pages under the `/m/` namespace. The app shell (`layout.tsx`) fetches the tenant's active modules and dynamically renders the sidebar navigation and dashboard widgets.

Module UI code is organized within each module's feature folder (`modules/{name}/components/` and `modules/{name}/widgets/`). Module pages in `app/(app)/m/` import from these folders. This keeps the routing in Next.js's domain while the business logic and UI components live with the module definition.

A module guard middleware wraps all `/m/{moduleId}/` routes and `/api/modules/{moduleId}/` routes, checking the tenant's active modules before allowing access. If the module is not active, the user sees a "Module not activated" page with a link to the catalog.

---

## 11. Database Design

### 11.1 Multi-Tenancy Strategy

The platform uses a shared-database, shared-schema multi-tenancy model with row-level tenant isolation. Every table includes a `tenant_id` column. Supabase's built-in Row Level Security (RLS) is the primary isolation mechanism:

```sql
-- Example RLS policy (applied to every table)
CREATE POLICY "Tenant isolation" ON verifikationer
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('app.current_tenant_id')::uuid));
```

The tenant ID is set in the Supabase session context via the JWT claims from Supabase Auth, ensuring that every query — whether from the Next.js server, the client, or an Edge Function — is automatically scoped to the correct tenant.

### 11.2 Core Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `tenants` | Company/organization records | id, org_nr, name, address, f_skatt, moms_registered, moms_period, fiscal_year_start, business_type |
| `users` | User accounts with tenant membership | id (Supabase Auth UID), tenant_id, email, name, role (owner, admin, staff, accountant) |
| `accounts` | Chart of accounts (BAS-kontoplan) | tenant_id, account_number, name, type, is_active, parent_account |
| `fiscal_years` | Räkenskapsår definitions | tenant_id, start_date, end_date, status (open, closed), opening_balances_posted |
| `verifikationer` | Journal entries (the core of everything) | tenant_id, nummer, date, description, fiscal_year_id, created_by, source_module, is_posted |
| `verifikation_rows` | Individual debit/credit lines | verifikation_id, account_number, debit, credit, moms_code, description |
| `tenant_modules` | Which modules are active per tenant | tenant_id, module_id, activated_at, deactivated_at, status, config (JSONB) |
| `business_types` | Reference table of business types | id, name, cluster, icon, sni_codes[], recommended_modules[] |

### 11.3 Module Table Convention

Every module that needs database storage follows the naming convention `mod_{module_short_name}_{table_name}`. For example, the kassaintegration module uses `mod_kassa_dagskassa` and `mod_kassa_z_rapporter`. All module tables include `tenant_id` and have RLS policies identical to core tables.

Module tables are created via Supabase migrations stored in `supabase/migrations/`. The tables exist for all tenants (they're part of the shared schema), but only contain data for tenants that have activated the module. When a module is activated for a tenant, the `onActivate` hook may seed tenant-specific default data.

### 11.4 Configuration Storage

Module-specific configuration is stored as JSONB in the `tenant_modules` table's `config` column. This allows each module to store arbitrary settings (e.g., the kassaintegration module stores the POS system type and default moms split rules) without requiring schema changes. The JSONB schema is validated at the application level using Zod schemas defined in each module's definition.

---

## 12. Event System

### 12.1 Purpose

The event system is the primary mechanism for inter-module communication and the way modules react to changes in the core accounting engine. It ensures loose coupling: the core and individual modules never call each other's functions directly. Instead, they emit typed events that any module can subscribe to.

### 12.2 Core Events

| Event | Emitted When | Payload |
|---|---|---|
| `verifikation.created` | A new journal entry is posted | tenantId, verifikationId, date, rows[], sourceModule |
| `verifikation.reversed` | A correction entry reverses a previous one | tenantId, originalId, reversalId |
| `faktura.created` | A new customer invoice is created | tenantId, fakturaId, customerId, totalAmount, momsAmount |
| `faktura.sent` | An invoice is sent to the customer | tenantId, fakturaId, sentVia (email/post) |
| `faktura.paid` | An invoice is marked as paid | tenantId, fakturaId, paymentDate, paymentMethod |
| `faktura.overdue` | An invoice passes its due date unpaid | tenantId, fakturaId, dueDate, daysPastDue |
| `leverantorsfaktura.added` | A new supplier invoice is registered | tenantId, fakturaId, supplierId, totalAmount, momsAmount |
| `leverantorsfaktura.paid` | A supplier invoice is paid | tenantId, fakturaId, paymentDate |
| `bank_transaction.imported` | A new bank transaction arrives | tenantId, transactionId, amount, date, description, bankAccount |
| `bank_transaction.matched` | A bank transaction is matched to a record | tenantId, transactionId, matchedType, matchedId |
| `period.closed` | A month/quarter is closed | tenantId, periodStart, periodEnd |
| `period.reopened` | A previously closed period is reopened | tenantId, periodStart, periodEnd, reopenedBy |
| `fiscal_year.closed` | A fiscal year is closed (årsbokslut) | tenantId, fiscalYearId |

### 12.3 Implementation

For the Next.js + Supabase architecture, the event system has two layers:

**In-request events:** A simple typed event emitter (same pattern as before) handles synchronous events within a single API route or Server Action. When a verifikation is created, the emitter fires `verifikation.created` and all subscribed module hooks run within the same request. This covers the majority of use cases.

**Async/cross-request events:** For events that need to trigger background processing (e.g., nightly rollups, or events that should fire even if no user is currently making a request), Supabase provides two mechanisms:

- **Database triggers + pg_notify:** A PostgreSQL trigger fires on INSERT to `verifikationer`, sending a notification that a Supabase Edge Function can pick up.
- **Supabase Realtime:** For real-time UI updates when another user or background process makes changes (e.g., accountant creates a verifikation, business owner's dashboard updates live).

If a module's event handler fails, the failure is logged but does not roll back the core operation that emitted the event. Module handlers are expected to be idempotent and to handle their own error recovery.

---

## 13. Security & Compliance

### 13.1 Data Residency

All data is stored within the EU. Supabase supports EU region deployment (Frankfurt). The Next.js frontend is deployed to Vercel's EU edge. This is a non-negotiable requirement for Swedish financial data. Both services must guarantee EU data residency and GDPR compliance.

### 13.2 Authentication & Authorization

Authentication is handled by Supabase Auth with support for email/password, magic links, and Google OAuth. BankID integration is a future consideration via a custom Supabase Auth provider.

Authorization follows a role-based model:

- **Owner:** Full access including billing and tenant settings.
- **Admin:** Full access except billing.
- **Staff:** Access to active modules, no admin functions.
- **Accountant:** Read access to all financial data, write access to verifikationer and reports, access to SIE export and årsbokslut.

Module-level authorization is enforced by middleware that checks whether the requested module is active for the tenant before processing the request. RLS policies in Supabase provide defense-in-depth at the database level.

### 13.3 Financial Data Integrity

- **Immutable verifikationer:** Once posted, journal entries cannot be modified. This is enforced at the database level with a PostgreSQL trigger that prevents UPDATE on posted verifikationer.
- **Audit logging:** All state changes to financial data are logged with timestamp, user, and before/after values. Supabase's `auth.uid()` function automatically captures the acting user.
- **Backup strategy:** Supabase provides automated daily backups with point-in-time recovery (PITR) on Pro plan. Minimum 7-day retention (30-day on Team plan).
- **Encryption:** Data encrypted at rest (Supabase uses AES-256) and in transit (TLS 1.3). Sensitive fields (personnummer, bank account numbers) are additionally encrypted at the application level before storage.

---

## 14. Integration Strategy

### 14.1 Banking

Bank transaction import via Tink (now part of Visa) or similar Open Banking aggregator. Tink supports all major Swedish banks (Swedbank, SEB, Nordea, Handelsbanken, Danske Bank, Länsförsäkringar). Implemented as the Bankintegration module, with the Tink API calls running in a Supabase Edge Function (to keep API secrets secure).

### 14.2 POS Systems

The kassaintegration module supports importing daily sales data from point-of-sale systems. Initial support focuses on file-based import (CSV, Z-rapport format) for maximum compatibility. Future versions will add direct API integrations with major Swedish POS providers: Zettle (iZettle), Trivec, Lightspeed, and Square.

### 14.3 Payroll

The löneintegration module imports salary data from external payroll systems. Initial support via SIE-L (the payroll subset of SIE) and CSV import. Future API integrations with Hogia Lön, Visma Lön, and Fortnox Lön.

### 14.4 Skatteverket

Electronic filing integration with Skatteverket for momsdeklaration and arbetsgivardeklaration. This is a high-value feature that requires certification. Planned for post-MVP when the core is stable.

### 14.5 Third-Party API Strategy

All external integrations follow a consistent adapter pattern within their respective modules. Each integration defines an adapter interface, and specific providers implement that interface. This allows swapping providers (e.g., switching from Tink to another bank aggregator) without modifying the module's business logic. External API calls always run in Supabase Edge Functions to keep secrets out of the Next.js client bundle.

---

## 15. Development Roadmap

### 15.1 Phase 1: Foundation (Weeks 1–5)

Build the core infrastructure and accounting engine. No modules beyond the always-active core.

- **Week 1–2:** Next.js project setup with App Router, Supabase project creation (EU region), Supabase Auth integration, multi-tenancy with RLS policies on all tables, basic module registry with one dummy module to validate the pattern, event system implementation, Tailwind + shadcn/ui component library setup.
- **Week 3–4:** Core accounting engine: BAS-kontoplan seeding on tenant creation, verifikation creation with double-entry enforcement, huvudbok, saldobalans, period management. All core pages built with Server Components.
- **Week 5:** Financial statements: resultaträkning and balansräkning generation, momsrapport, SIE4 export.

> **Milestone 1:** At the end of Phase 1, a user can sign up, get a working bokföringssystem with BAS-kontoplan, create verifikationer, view huvudbok, generate resultaträkning, balansräkning, momsrapport, and export SIE4. No industry-specific features yet, but the core is rock-solid.

### 15.2 Phase 2: First Modules (Weeks 6–10)

Build the first set of universally useful modules.

- **Week 6–7:** Kundfakturering module: invoice creation, PDF generation (via Supabase Edge Function or server-side), email sending, kundreskontra, payment tracking.
- **Week 8:** SIE4 import (migration from other systems), leverantörsreskontra module.
- **Week 9–10:** Bankintegration module (via Tink Edge Function): auto-import, transaction list, basic matching UI. Module catalog UI where users can browse and activate modules.

> **Milestone 2:** At the end of Phase 2, the platform is a functional Fortnox alternative. Users can do daily bokföring, send invoices, track supplier bills, import bank transactions, and migrate from their old system via SIE4. The module system is live.

### 15.3 Phase 3: F&B Cluster (Weeks 11–16)

Build the first industry-specific modules and the business type selection/recommendation system.

- **Week 11–12:** Kassaintegration module (Z-rapport import, dagskassa, auto-bokföring). Business type selection UI in onboarding.
- **Week 13–14:** Matkostnadsanalys and svinnhantering modules.
- **Week 15–16:** Tipshantering, receptkalkyl modules. KPI-dashboard module with customizable widgets. Industry pack recommendation engine.

> **Milestone 3:** At the end of Phase 3, a restaurant owner can sign up, select "Restaurang," get recommended modules, activate them, and have a daily workflow that includes importing Z-rapporter, tracking food costs, managing tips, and seeing industry-specific KPIs. This is the differentiation point from Fortnox.

### 15.4 Phase 4: Growth & Polish (Weeks 17–24)

- **Weeks 17–18:** Kvittoskanning module (OCR via Supabase Edge Function), automatisk matchning (AI-assisted bank matching).
- **Weeks 19–20:** Budgetmodul, periodjämförelse, advanced reporting.
- **Weeks 21–22:** Accountant access (multi-client view), redovisningskonsult portal.
- **Weeks 23–24:** Performance optimization, security audit, onboarding polish, preparation for public launch.

---

## 16. Business Model & Pricing

### 16.1 Pricing Strategy

The pricing model follows a base-plus-modules approach:

| Tier | Price (SEK/month) | Includes | Target |
|---|---|---|---|
| **Starter** | 199 | Core accounting, SIE export, 1 user, up to 3 modules | Solo founders, very small AB |
| **Business** | 499 | Core accounting, SIE, invoicing, bank integration, 5 users, up to 10 modules | Small businesses, 5–15 employees |
| **Professional** | 999 | Everything in Business, unlimited modules, unlimited users, accountant access, priority support | Growing businesses, 15–50 employees, businesses with accountant |
| **Enterprise** | Custom | Custom pricing, SSO, dedicated support, SLA, custom integrations | Larger organizations, bokföringsbyråer managing many clients |

### 16.2 Revenue Expansion

The module system creates natural upsell paths. As users grow and need more functionality, they activate more modules, which may push them to higher tiers. Industry-specific modules provide clear value that justifies the Business or Professional tier. Accountant access is gated to the Professional tier, creating incentive for businesses whose bokföringsbyrå recommends the platform.

### 16.3 Cost Structure

Supabase pricing is usage-based (database size, edge function invocations, auth users, storage). The Pro plan ($25/month per project) covers most needs for early growth. Vercel Pro ($20/month per team member) handles the frontend. Total infrastructure cost at launch is estimated at $50–100/month, scaling with usage.

---

## 17. Success Metrics & KPIs

### 17.1 Product Metrics

- **Activation rate:** Percentage of signups that complete onboarding and create at least one verifikation within 7 days. Target: > 40%.
- **Module adoption:** Average number of active modules per tenant. Target: > 4 within first month.
- **Daily active usage:** Percentage of paying tenants that log in at least once per business day. Target: > 60%.
- **Churn rate:** Monthly churn of paying tenants. Target: < 3%.
- **Net Promoter Score:** Measured quarterly. Target: > 50 (Fortnox averages ~30).

### 17.2 Technical Metrics

- **Page load time:** Largest Contentful Paint < 1.5s (leveraging Next.js Server Components and edge caching).
- **API response time:** p95 < 200ms for all read operations, < 500ms for writes.
- **Uptime:** 99.9% availability (< 8.7 hours downtime per year). Critical for accounting software.
- **Module activation time:** < 2 seconds from click to fully active module with UI visible.
- **SIE4 import speed:** < 30 seconds for a typical 3-year import with 10,000+ verifikationer.

---

## 18. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Accounting engine bugs causing incorrect financial data | Critical | Medium | Extensive test suite with known-good BAS scenarios. Double-entry balance check on every write. Automated reconciliation tests. External auditor review before launch. |
| Module activation/deactivation causing data inconsistency | High | Medium | Modules never delete core data. Activation/deactivation wrapped in transactions. Comprehensive integration tests for module lifecycle. |
| Supabase service outage affecting all tenants | High | Low | Supabase has 99.9% SLA on Pro. Implement graceful degradation for non-critical features. Daily backups with PITR. Document manual failover procedures. |
| Tink/bank integration downtime | Medium | Medium | Graceful degradation: manual import always available. Queue failed syncs for retry. Clear user communication of sync status. |
| Swedish accounting regulation changes (BAS update, moms rate change) | Medium | Low (annual) | Abstract regulatory values into configuration. BAS-kontoplan versioning. Regression tests for regulation-dependent calculations. |
| Difficulty competing with Fortnox's ecosystem and integrations | High | High | Focus on differentiation (industry-specific experience) rather than matching Fortnox feature-for-feature. Target underserved segments first (restaurants, salons). |
| Supabase vendor lock-in | Medium | Low | Use Drizzle ORM for schema/migrations (portable). Core business logic in Next.js, not Edge Functions. Supabase is open source — self-hosting is a fallback option. |
| Performance degradation as data grows | Medium | Medium | Proper indexing (tenant_id + date on all queries). Supabase connection pooling (Supavisor). Read replicas for heavy reporting. Load testing at 10x expected volume. |

---

## 19. Appendices

### 19.1 Appendix A: Swedish Accounting Standards Reference

- **BFL (Bokföringslagen 1999:1078):** The Swedish Bookkeeping Act. Defines who must keep books, requirements for verifikationer, arkivering (7 years), and årsbokslut obligations.
- **BFN (Bokföringsnämnden):** The Swedish Accounting Standards Board. Issues BFNAR (Bokföringsnämndens allmänna råd) including the K2 and K3 frameworks.
- **ÅRL (Årsredovisningslagen 1995:1554):** The Annual Reports Act. Defines the format and content of annual financial statements.
- **K2 (BFNAR 2016:10):** Simplified annual report rules for smaller companies. Most AB in our target segment use K2. Defines fixed formats for resultaträkning and balansräkning.
- **BAS-kontoplanen:** The standard chart of accounts used by virtually all Swedish companies. Maintained by BAS-kontogruppen. Updated annually.
- **SIE (Standard Import Export):** The standard file format for exchanging accounting data between Swedish accounting systems. Version 4 (SIE4) includes full transaction-level data.
- **Mervärdeskattelagen (ML):** The Swedish VAT Act. Defines moms rates, reporting periods, and compliance requirements.

### 19.2 Appendix B: Glossary

| Swedish Term | English Translation | Description |
|---|---|---|
| Bokföring | Bookkeeping | The recording of financial transactions |
| Verifikation | Journal entry / voucher | A record of a financial transaction with debit and credit rows |
| Huvudbok | General ledger | Complete record of all transactions organized by account |
| Kontoplan | Chart of accounts | The structured list of accounts used for bookkeeping |
| Räkenskapsår | Fiscal year | The 12-month period for financial reporting |
| Resultaträkning | Income statement | Report showing revenue, costs, and profit/loss |
| Balansräkning | Balance sheet | Report showing assets, equity, and liabilities |
| Momsredovisning | VAT reporting | Periodic reporting of output and input VAT to Skatteverket |
| Redovisningskonsult | Accounting consultant | External accountant managing a company's books |
| Bokföringsbyrå | Accounting firm | Firm providing bookkeeping and accounting services |
| Årsbokslut | Year-end closing | The process of closing a fiscal year and preparing annual reports |
| Dagskassa | Daily cash register | Daily reconciliation of cash register / POS system sales |
| Z-rapport | Z-report | End-of-day summary report from a POS system |
| Kundreskontra | Accounts receivable | Tracking of outstanding customer invoices |
| Leverantörsreskontra | Accounts payable | Tracking of outstanding supplier invoices |
| Arbetsgivaravgifter | Employer contributions | Social security contributions paid by the employer |
| Traktamente | Travel allowance | Per diem allowance for business travel |
| Omsättning | Turnover / revenue | Total sales revenue for a period |
| Matkostnadsprocent | Food cost percentage | Food cost as a percentage of food revenue (key F&B metric) |
| Svinn | Waste / shrinkage | Food or inventory lost to waste, spoilage, or theft |

---

*End of Document*
