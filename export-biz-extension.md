# Export Business Extensions — Complete Idea Registry

> **Sector slug**: `export`
> **Target user**: Small Swedish businesses (enskild firma & aktiebolag) that physically export goods from Sweden to EU and non-EU markets.
> **Constraint note**: Extensions primarily read core bookkeeping data. Some ideas below involve journal entry creation (revaluation, FX gain/loss) — these would require extending the extension permission model or routing through the core engine.

---

## Research Summary

### Key pain points for Swedish exporters
1. **VAT classification complexity** — Domestic (25/12/6%), EU B2B reverse charge (0%), EU B2C (OSS), non-EU export (0%) — each with different momsdeklaration boxes, documentation requirements, and penalty exposure.
2. **Currency management** — Three accounting moments per foreign invoice (invoice date, payment date, period-end revaluation). Most small exporters get this wrong.
3. **Multiple reporting obligations** — Momsdeklaration + Periodisk sammanställning (EC Sales List) + Intrastat (if >SEK 12M dispatches) + Tullverket customs declarations — all with different deadlines and formats.
4. **No market-level profitability visibility** — Same product shipped to Norway vs. USA has wildly different true margins after freight, customs, insurance, and FX costs.
5. **Missing export documentation = retroactive tax** — Non-EU zero-rating denied without proof of export (Tullverket EAD, CMR, bill of lading). 25% VAT + 20% penalty.

### Relevant BAS accounts
| Account | Description | Momsdeklaration box |
|---------|-------------|-------------------|
| `3001` | Revenue goods 25% (domestic) | Box 05 |
| `3002` | Revenue goods 12% (domestic) | Box 05 |
| `3003` | Revenue goods 6% (domestic) | Box 05 |
| `3105` | Goods export outside EU | Box 36 |
| `3108` | Goods to EU B2B (reverse charge) | Box 35 |
| `3305` | Services outside EU | Box 40 |
| `3308` | Services to EU B2B (reverse charge) | Box 39 |
| `3109` | Triangular trade sales (trepartshandel) | Box 38 |
| `3521` | Invoiced freight, EU | Follows goods |
| `3522` | Invoiced freight, export | Box 36 |
| `3960` | FX gains (operating) | — |
| `7960` | FX losses (operating) | — |
| `3969` | Unrealized FX gains | — |
| `7969` | Unrealized FX losses | — |
| `2614` | Output VAT reverse charge 25% | — |
| `2641` | Deductible input VAT | Box 48 |
| `2645` | Calculated input VAT (EU acquisitions) | Box 48 |
| `5710` | Freight, transport, insurance | — |
| `5720` | Customs and forwarding costs | — |
| `6320` | Insurance costs | — |

### Regulatory references
- **Mervärdesskattelagen (ML)** — Swedish VAT Act
- **Bokföringslagen (BFL)** — Swedish Bookkeeping Act (7-year retention)
- **VIES** — EU VAT Information Exchange System (free API for VAT number validation)
- **Riksbanken** — Daily exchange rates (REST API)
- **SCB Intrastat** — Monthly EU trade statistics (IDEP.web, transitioning to new platform 2026)
- **Skatteverket** — Momsdeklaration, Periodisk sammanställning (e-filing)
- **Tullverket** — Export declarations, EAD (Export Accompanying Document)

---

## All Extension Ideas

### IDEA 1: Export VAT Autopilot

**Problem**: Every time an exporter creates an invoice to a customer in another EU country, they must manually determine the correct VAT treatment. Get it wrong and Skatteverket can deny the 0% rate or the customer can't deduct VAT.

**What it does**:
- When creating an invoice, the user enters or selects the customer's country and VAT number (momsregistreringsnummer).
- The system automatically validates the VAT number via the EU VIES database (free API: https://ec.europa.eu/taxation_customs/vies/).
- Based on validated status + destination + goods vs. services, the system auto-applies the correct VAT treatment:
  - **Intra-community supply (B2B, goods to EU)**: 0% VAT, auto-adds text "Omvänd skattskyldighet" and the legal reference.
  - **Export outside EU**: 0% VAT, auto-adds "Export" and prompts for customs documentation.
  - **B2C to EU (distance sale)**: Checks if OSS threshold (EUR 10,000) is exceeded, alerts if VAT registration in destination country may be needed.
  - **Domestic**: Standard 25% / 12% / 6% as normal.
- Auto-books to the correct BAS account (e.g., 3108 for EU goods sales at 0%).
- Stores proof of transport (CMR, bill of lading reference) linked to the invoice — critical for defending the 0% rate in an audit.

**Data pattern**: `both` (reads core invoice/customer data + stores VIES validation results and document references)

**Why it wins**: Fortnox and Visma leave this entirely to the user. This extension eliminates the #1 compliance risk for exporters.

**Note**: This idea touches core invoice creation flow. May require hooks into the invoice form rather than being a standalone workspace. Could also be implemented as a validation/enrichment layer that runs when invoices are created.

---

### IDEA 2: Intrastat Generator

**Problem**: Swedish companies dispatching goods worth >SEK 12M/year (threshold raised from 4.5M in 2025) to other EU countries must file monthly Intrastat reports to SCB. Currently done manually in Excel or IDEP.web.

**What it does**:
- Each product in the system can be tagged with: CN commodity code (8-digit), net weight (kg), country of origin, and supplementary unit (pieces, liters, etc.).
- When an invoice is booked for an intra-community dispatch, the system automatically captures: commodity code, invoice value (in SEK), net weight, destination EU country, transaction nature code, delivery terms.
- At month end, generates a complete Intrastat dispatch declaration in the format accepted by SCB's IDEP.WEB (CSV/XML upload).
- Tracks cumulative dispatch value against the SEK 12M threshold and alerts when the company becomes obligated.
- Handles corrections: if a credit note is issued, generates a correction entry for the relevant month.

**Data pattern**: `both` (reads core invoice data + stores product metadata: CN codes, weights, origin)

**Required data fields per Intrastat line**:
| Field | Source |
|-------|--------|
| CN commodity code (8-digit) | Manual entry per product |
| Partner country (2-letter ISO) | From customer/invoice |
| Transaction nature code | From invoice type |
| Net mass (kg) | Manual entry per product |
| Supplementary unit | Manual entry per product (if required by CN code) |
| Invoiced value (SEK) | From invoice |
| Country of origin | Manual entry per product |
| Partner VAT ID | From customer |
| Delivery terms (Incoterms) | Manual entry per order |

**Why it wins**: Pure pain for every exporting SME above the threshold. No Swedish bookkeeping system below ERP-level (SAP, Dynamics) does this well. Compelling reason to switch to erp-base.

---

### IDEA 3: Multi-Currency Receivables Manager

**Problem**: An exporter invoicing in EUR has open receivables whose SEK value fluctuates daily. At period end, these must be revalued. When payment arrives, there's an FX gain or loss to book. This is messy in current systems.

**What it does**:
- Invoices can be created in any currency (EUR, USD, NOK, DKK, GBP, etc.) with the exchange rate auto-fetched from Riksbanken's daily rates.
- Open receivables dashboard showing: original amount, original SEK value, current SEK value, unrealized FX gain/loss — per customer and per currency.
- Period-end revaluation button: recalculates all open foreign-currency receivables at the closing rate and generates the required journal entries (BAS 3960 Valutakursvinster / 7960 Valutakursförluster / 3969 / 7969).
- Payment matching in foreign currency: When a EUR payment arrives, matches to EUR invoices and auto-calculates realized FX gain/loss, booking it to the correct BAS accounts.
- FX exposure summary: Shows total outstanding per currency — useful for deciding whether to hedge.

**Data pattern**: `both` (reads core invoices/transactions + may create journal entries for revaluation)

**Note**: The revaluation and payment-matching features involve journal entry creation, which currently isn't within extension permissions. Options: (a) route through core engine API, (b) generate draft entries for user approval, (c) expand extension capabilities.

**Why it wins**: Fortnox handles basic multi-currency but the revaluation and FX gain/loss workflow is manual. This makes it automated and audit-ready.

---

### IDEA 4: EU Sales List / Periodisk Sammanställning Auto-Reporter

**Problem**: Every Swedish company making intra-community B2B supplies must file a quarterly (or monthly) EU sales list (periodisk sammanställning) to Skatteverket, listing each EU customer's VAT number and total value of supplies.

**What it does**:
- Automatically compiles all 0%-rated intra-community invoices for the period.
- Groups by customer VAT number and destination country.
- Separates goods (momsdeklaration box 35) from services (box 39).
- Generates the report in Skatteverket's required format (XML for e-filing).
- Cross-references with VIES validation to catch invalid VAT numbers before filing.
- Handles credit notes (reduces the reported value for that customer).
- Alerts if any intra-community invoice is missing a validated VAT number.
- Cross-validates: total in this report should match box 35 + box 39 on the momsdeklaration — flags discrepancies.
- Filing deadline countdown with alerts.

**Data pattern**: `core` (reads invoices + customer data, no manual data entry needed)

**Filing frequency**:
| Type | Default | Reduced (if <SEK 500k/quarter for 4+ quarters) |
|------|---------|------------------------------------------------|
| Goods | Monthly, due 25th | Quarterly, due 25th after quarter end |
| Services | Quarterly | Quarterly |

**Why it wins**: Simple, saves 2-4 hours per quarter, eliminates filing errors. Ties directly into Extension 1 (VAT Autopilot) for seamless compliance.

---

### IDEA 5: Export Document Center

**Problem**: Exporting companies need to produce and track multiple documents per shipment: proforma invoices, commercial invoices with specific fields, packing lists, certificates of origin, CMR transport documents. These are currently created in Word/Excel outside the accounting system.

**What it does**:
- **Proforma invoice generator** — creates a proforma from a quote/order, including commodity codes, country of origin, Incoterms, gross/net weight.
- **Commercial invoice for export** — auto-generates from the booked invoice with all required customs fields (HS codes, quantities, weights, Incoterms, buyer/seller details).
- **Packing list** — generated from order data with carton count, dimensions, weights.
- **Document archive** — links all trade documents to the invoice/order in the system. When audited, everything is in one place.
- **Incoterms tracking** — stores delivery terms per customer and auto-applies to new orders. Tracks which costs are the seller's responsibility based on the Incoterm.

**Data pattern**: `both` (reads core invoice data + stores document metadata, product weights, Incoterms, HS codes)

**Why it wins**: Bridges the gap between accounting and trade compliance. No SME bookkeeping system in Sweden does this. Positions erp-base as the "all-in-one" for exporters.

---

### IDEA 6: Freight & Logistics Cost Allocator

**Problem**: Exporters pay freight costs (shipping, customs brokerage, insurance) that need to be allocated to specific orders or invoices for accurate margin calculation. Currently tracked in spreadsheets.

**What it does**:
- When a freight invoice arrives, the user links it to one or more sales orders/invoices.
- The system allocates the cost proportionally (by weight, value, or manual split).
- **Margin dashboard per export order** — shows revenue, COGS, freight, insurance, customs costs, and true profit margin.
- **Margin per market** — aggregates to show profitability by destination country.
- Auto-suggests BAS accounts based on cost type (e.g., 5710 Frakt, 6320 Försäkringar).

**Data pattern**: `both` (reads core invoice/transaction data + stores cost allocations and links)

**Typical freight cost ranges**:
| Mode | % of goods value |
|------|-----------------|
| Ocean (FCL) | 2-8% |
| Ocean (LCL) | 5-15% |
| Air freight | 15-35% |
| Road (EU) | 3-10% |
| Express/parcel | 10-40% |

**Why it wins**: Answers "Is it actually profitable to sell to the US?" — the single most important strategic question for an exporter. Combined with Incoterm tracking, reveals true margin per market.

---

### IDEA 7: Export VAT Monitor (Exportmoms-monitor)

**Problem**: An exporter with mixed domestic/EU/non-EU sales needs a clear picture of how their revenue splits across VAT treatments and momsdeklaration boxes.

**What it does**:
- Reads journal entry lines on export-related revenue accounts (3105, 3108, 3305, 3308, 3001-3003).
- Shows breakdown: **Domestic vs EU B2B vs Non-EU export** revenue per period.
- Pre-maps amounts to momsdeklaration boxes (05, 35, 36, 39, 40).
- Validation flags: EU sale missing customer VAT number, non-EU sale without export documentation reference.
- Period comparison — this month vs last month, this quarter vs same quarter last year.

**Data pattern**: `core` (reads GL data only)

**Note**: Overlaps with Idea 1 (VAT Autopilot). Could be the "dashboard/reporting" complement to Autopilot's "invoice-time automation". Autopilot prevents errors at creation; Monitor catches them after the fact.

---

### IDEA 8: Export Market Profitability (Lönsamhet per exportmarknad)

**Problem**: Exporters don't know which markets are actually profitable after all costs.

**What it does**:
- Reads revenue data from core (invoices grouped by customer country).
- Allows manual entry of market-specific costs: freight per shipment, customs duties, insurance, packaging, EKN premiums.
- Calculates contribution margin per market (revenue minus all allocated export costs).
- Shows freight cost as % of revenue per market.
- Revenue trend per market over time.
- Comparison table: margin ranking across all export markets.
- Optional Incoterm tracking per market.

**Data pattern**: `both` (reads core revenue + manual cost allocation)

**Note**: Overlaps significantly with Idea 6 (Freight & Logistics Cost Allocator). Could be merged — Idea 6 handles per-order cost allocation, Idea 8 aggregates to market-level profitability. Together they form a complete cost-to-margin pipeline.

---

### IDEA 9: Export Compliance Tracker (Exportefterlevnad)

**Problem**: Missing documentation leads to retroactive VAT + penalties. Multiple deadlines across Skatteverket, SCB, and Tullverket.

**What it does**:
- Reads non-EU export invoices from core data.
- Document checklist per export: Tullverket EAD reference, CMR/bill of lading number, customs declaration number — manual entry.
- Dashboard showing compliance status per invoice (complete / missing documents).
- Intrastat threshold monitor: tracks cumulative EU dispatches against SEK 12M.
- Deadline calendar: EC Sales List (25th), Intrastat (10th business day), momsdeklaration.
- Filing status overview per period (filed / pending / overdue).

**Data pattern**: `both` (reads core invoices + manual document tracking)

**Note**: Overlaps with Idea 5 (Export Document Center) on the document tracking side, and with Idea 2 (Intrastat Generator) on threshold monitoring. Could be a lightweight version that just tracks status without generating documents.

---

## Overlap Analysis

| Idea | Unique value | Overlaps with |
|------|-------------|---------------|
| 1. VAT Autopilot | Invoice-time VAT automation, VIES validation | 7 (Monitor is post-hoc reporting) |
| 2. Intrastat Generator | SCB filing format generation, CN code management | 9 (threshold monitoring) |
| 3. Multi-Currency Receivables | FX revaluation, payment matching | — |
| 4. EU Sales List | Skatteverket filing format, VAT ID aggregation | 1 (VIES validation shared) |
| 5. Export Document Center | Proforma/packing list generation, doc archive | 9 (document tracking) |
| 6. Freight Cost Allocator | Per-order cost allocation, margin per order | 8 (market profitability) |
| 7. VAT Monitor | Post-hoc VAT analysis, box mapping | 1 (VAT classification) |
| 8. Market Profitability | Country-level margin aggregation | 6 (cost allocation feeds into this) |
| 9. Compliance Tracker | Deadline calendar, document checklists | 2 (Intrastat threshold), 5 (document tracking) |

---

## Evaluation Criteria

| Criterion | Weight | Description |
|-----------|--------|-------------|
| **Pain severity** | 30% | How much does this problem cost the user in time, money, or risk? |
| **Differentiation** | 25% | Does any competing Swedish bookkeeping tool do this? |
| **Feasibility** | 20% | Can we build it within the current extension architecture (read-only + manual data)? |
| **Data availability** | 15% | Does the core system already have the data needed? |
| **Standalone value** | 10% | Does it deliver value on its own, or only with other extensions? |

---

## Scoring

| Idea | Pain (30%) | Diff (25%) | Feasibility (20%) | Data (15%) | Standalone (10%) | Total |
|------|-----------|-----------|-------------------|-----------|-----------------|-------|
| 1. VAT Autopilot | 10 | 10 | 5 | 7 | 8 | **8.15** |
| 2. Intrastat Generator | 8 | 10 | 8 | 6 | 9 | **8.30** |
| 3. Multi-Currency Receivables | 9 | 8 | 5 | 8 | 9 | **7.75** |
| 4. EU Sales List | 9 | 9 | 9 | 9 | 9 | **9.00** |
| 5. Export Document Center | 7 | 10 | 8 | 6 | 7 | **7.75** |
| 6. Freight Cost Allocator | 7 | 9 | 9 | 5 | 6 | **7.35** |
| 7. VAT Monitor | 8 | 7 | 10 | 10 | 9 | **8.55** |
| 8. Market Profitability | 7 | 8 | 9 | 7 | 6 | **7.45** |
| 9. Compliance Tracker | 7 | 8 | 9 | 7 | 7 | **7.55** |

---

## Final Selection — 4 Extensions to Build

> **Decision**: VAT Autopilot deferred (requires core invoice flow changes). 4 extensions is enough for a strong v1.
> **Language**: Swedish UI with English for international trade terms (Incoterms, VIES, CN codes, FOB/CIF).
> **Data**: All 4 extensions work with existing core schema — no database migrations needed for v1.
> **Product metadata**: Stored in `extension_data` table (isolated to Intrastat extension).

### 1. EU Sales List / Periodisk Sammanställning (Idea 4) — Score: 9.00
- Mandatory reporting, saves real hours, pure read-only, high standalone value
- Generates downloadable CSV/XML file for upload to Skatteverket
- Immediately useful to every exporter with EU B2B sales

### 2. Export VAT Monitor / Exportmoms-monitor (Idea 7) — Score: 8.55
- Post-hoc VAT analysis dashboard, 100% feasible within current architecture
- Maps revenue to momsdeklaration boxes, catches errors before filing

### 3. Intrastat Generator (Idea 2) — Score: 8.30
- No competing tool in the SME segment, generates SCB-compatible files
- Requires manual product metadata (stored in extension_data) but delivers massive time savings

### 4. Multi-Currency Receivables Manager / Valutafordringar (Idea 3) — Score: 7.75
- Dashboard portion (exposure by currency + unrealized gain/loss) is pure read-only
- Core schema already has full multi-currency support (currency, exchange_rate, total_sek on invoices)
- Journal entry generation for revaluation deferred to future phase

### Deferred
- **Export VAT Autopilot** (Idea 1) — Deferred. Requires modifying core invoice creation flow, which violates the "extensions don't modify core data" constraint. Keep in this document for future consideration.

### Future Phase
- **Export Document Center** (Idea 5) — Proforma invoices, packing lists, document archive
- **Freight Cost Allocator** (Idea 6) + **Market Profitability** (Idea 8) — Could merge into "Export Profitability"
- **Compliance Tracker** (Idea 9) — Partially covered by the 4 selected extensions combined

---

## Core Schema Findings

The existing schema already supports everything we need:

**Invoice type** (`types/index.ts`):
- `currency: Currency` — EUR, USD, GBP, NOK, DKK, SEK
- `exchange_rate: number | null` — rate at invoice date
- `subtotal` / `subtotal_sek` — original and SEK amounts
- `total` / `total_sek` — original and SEK amounts
- `vat_treatment: VatTreatment` — includes `reverse_charge`, `export`, `exempt`
- `moms_ruta: string | null` — momsdeklaration box (05, 35, 36, 39, 40)

**Customer type** (`types/index.ts`):
- `country: string` — ISO country code
- `vat_number: string | null`
- `vat_number_validated: boolean`
- `vat_number_validated_at: string | null`
- `customer_type: CustomerType`

**JournalEntryLine type** (`types/index.ts`):
- `currency: string`
- `amount_in_currency: number | null`
- `exchange_rate: number | null`
- `account_number: string` — BAS account (3105, 3108, 3305, 3308, etc.)

**Transaction type** (`types/index.ts`):
- `currency: Currency`
- `amount_sek: number | null`
- `exchange_rate: number | null`

---

## Implementation Plan

### Phase 0: Sector Registration & Shared Infrastructure

**Goal**: Register the export sector, create shared components, set up the extension folder structure.

#### 0.1 Create folder structure
```
extensions/
  export/
    eu-sales-list/
      index.ts                    # Extension definition
      lib/
        eu-sales-list-engine.ts   # Core logic: aggregate, validate, generate file
        vies-validator.ts         # VIES API VAT number validation (shared utility)
        skv-xml-generator.ts      # Skatteverket XML format generation
    vat-monitor/
      index.ts
      lib/
        vat-monitor-engine.ts     # GL account reading, box mapping, validation
    intrastat/
      index.ts
      lib/
        intrastat-engine.ts       # Data aggregation, CN code management
        scb-file-generator.ts     # SCB IDEP.web compatible CSV/XML
    currency-receivables/
      index.ts
      lib/
        receivables-engine.ts     # Exposure calc, unrealized gain/loss
        riksbanken-rates.ts       # Daily rate fetching (extend existing lib/currency/)
```

#### 0.2 Register sector in `lib/extensions/sectors.ts`
```typescript
{
  slug: 'export',
  name: 'Export & Utrikeshandel',
  icon: 'Ship',
  description: 'Verktyg för svenska företag som exporterar varor till EU och övriga världen',
  extensions: [
    {
      slug: 'eu-sales-list',
      name: 'Periodisk sammanställning',
      sector: 'export',
      category: 'accounting',
      icon: 'FileText',
      dataPattern: 'core',
      readsCoreTables: ['invoices', 'customers'],
      hasOwnData: false,
      description: 'Generera periodisk sammanställning (EC Sales List) för Skatteverket',
      longDescription: 'Sammanställer automatiskt alla momsfria EU-försäljningar grupperat per kund och momsregistreringsnummer. Genererar nedladdningsbar fil för uppladdning till Skatteverket. Validerar kundernas VAT-nummer via VIES och flaggar saknade uppgifter.'
    },
    {
      slug: 'vat-monitor',
      name: 'Exportmoms-monitor',
      sector: 'export',
      category: 'reports',
      icon: 'Shield',
      dataPattern: 'core',
      readsCoreTables: ['journal_entry_lines', 'journal_entries', 'invoices'],
      hasOwnData: false,
      description: 'Övervaka momsbehandling för export och EU-handel',
      longDescription: 'Visar intäkter uppdelat på inhemsk försäljning, EU B2B (reverse charge) och export utanför EU. Mappar automatiskt till rätt rutor i momsdeklarationen (ruta 05, 35, 36, 39, 40). Flaggar potentiella fel som saknat momsregistreringsnummer på EU-kunder eller felaktig momsbehandling.'
    },
    {
      slug: 'intrastat',
      name: 'Intrastat-generator',
      sector: 'export',
      category: 'accounting',
      icon: 'BarChart3',
      dataPattern: 'both',
      readsCoreTables: ['invoices', 'customers'],
      hasOwnData: true,
      description: 'Generera Intrastat-deklarationer för rapportering till SCB',
      longDescription: 'Tagga produkter med CN-koder (Combined Nomenclature), vikt och ursprungsland. Genererar kompletta Intrastat-deklarationer i CSV-format för uppladdning till SCB:s IDEP.web. Övervakar tröskelvärdet på 12 MSEK för utförsel och varnar när rapporteringsskyldighet uppstår.'
    },
    {
      slug: 'currency-receivables',
      name: 'Valutafordringar',
      sector: 'export',
      category: 'reports',
      icon: 'TrendingUp',
      dataPattern: 'core',
      readsCoreTables: ['invoices', 'journal_entry_lines', 'transactions'],
      hasOwnData: false,
      description: 'Övervaka valutaexponering och orealiserade kursvinster/-förluster',
      longDescription: 'Visar öppna kundfordringar per valuta med aktuellt SEK-värde baserat på Riksbankens dagskurser. Beräknar orealiserade valutakursvinster och -förluster. Visar realiserade kursdifferenser per period (konto 3960/7960). Ger en samlad bild av företagets valutarisk.'
    }
  ]
}
```

#### 0.3 Shared components to build
All placed in `components/extensions/export/shared/`:

| Component | Purpose | Used by |
|-----------|---------|---------|
| `PeriodSelector` | Month/quarter picker for reporting periods | All 4 |
| `CurrencyDisplay` | Shows amount in original currency + SEK | 3, 4 |
| `DeadlineCard` | Countdown to next filing deadline | 1, 2 |
| `ComplianceStatusBadge` | Filed / Pending / Overdue indicator | 1, 2 |
| `MomsrutaLabel` | Styled label for momsdeklaration box numbers | 1, 2 |
| `CountryFlag` | Small flag icon + country name for EU countries | 1, 3, 4 |
| `ExportKPICard` | Extension of existing KPICard with currency formatting | All 4 |
| `DownloadButton` | Trigger file download (CSV/XML) with loading state | 1, 3 |

#### 0.4 Shared utilities
Placed in `extensions/export/shared/`:

| Utility | Purpose | Used by |
|---------|---------|---------|
| `vies-client.ts` | VIES SOAP/REST API client for VAT number validation | 1 |
| `riksbanken-client.ts` | Extend existing `lib/currency/` to fetch daily rates | 4 |
| `eu-countries.ts` | EU member state list with ISO codes, currency, VAT prefixes | 1, 2, 3 |
| `moms-box-mapping.ts` | Maps BAS accounts + vat_treatment to momsdeklaration boxes | 1, 2 |
| `file-generators.ts` | CSV and XML file generation utilities | 1, 3 |

---

### Phase 1: EU Sales List / Periodisk Sammanställning

**Extension slug**: `eu-sales-list`
**Data pattern**: `core` (read-only from invoices + customers)
**Output**: Downloadable CSV/XML file

#### 1.1 Engine (`eu-sales-list-engine.ts`)

**Input**: User ID, period (year + month or quarter), filing type (goods/services/both)

**Logic**:
1. Fetch all invoices for the period where:
   - `vat_treatment = 'reverse_charge'` (EU B2B)
   - `status` is `sent` or `paid` (not draft)
   - Customer `country` is an EU member state (not Sweden)
2. Join with customers to get `vat_number`, `country`, `name`
3. Group by customer `vat_number`
4. For each customer, separate goods invoices (revenue accounts 3108) from services (3308)
5. Sum `total_sek` for goods and services separately
6. Handle credit notes: subtract from the customer's total (can result in negative amounts)
7. Validate:
   - Flag customers with missing or unvalidated VAT numbers
   - Flag invoices without `moms_ruta` set to '35' or '39'
   - Cross-check: sum of goods should equal journal entries on account 3108 for the period
   - Cross-check: sum of services should equal journal entries on account 3308 for the period

**Output structure**:
```typescript
interface ECSalesListReport {
  period: { year: number; month?: number; quarter?: number }
  filingType: 'monthly' | 'quarterly'
  reporterVatNumber: string
  reporterName: string
  lines: ECSalesListLine[]
  totals: { goods: number; services: number; triangulation: number }
  warnings: ECSalesListWarning[]
  crossCheck: { boxMatch: boolean; box35Total: number; box39Total: number }
}

interface ECSalesListLine {
  customerVatNumber: string
  customerName: string
  customerCountry: string  // ISO 2-letter
  goodsAmount: number      // SEK, rounded to whole number
  servicesAmount: number   // SEK, rounded to whole number
  triangulationAmount: number  // SEK, for trepartshandel
}

interface ECSalesListWarning {
  type: 'missing_vat_number' | 'unvalidated_vat_number' | 'missing_moms_ruta' | 'cross_check_mismatch'
  invoiceId?: string
  customerId?: string
  message: string
}
```

#### 1.2 File generators

**Skatteverket XML format** (`skv-xml-generator.ts`):
- Generate XML matching SKV 5740 schema
- Include header: reporter VAT number, period, contact info
- Include lines: customer VAT number, goods amount, services amount
- Encoding: UTF-8

**CSV fallback** (`csv-generator.ts`):
- Simple CSV with columns: Customer VAT Number, Country, Goods (SEK), Services (SEK)
- BOM for Excel compatibility

#### 1.3 VIES integration (`vies-client.ts`)
- Call EU VIES API to validate customer VAT numbers
- Cache validation results (valid for 24 hours)
- Show validation status indicator (valid / invalid / pending / error)
- Used in the warnings system to flag invalid numbers before filing

#### 1.4 Workspace UI (`EuSalesListWorkspace.tsx`)

**Layout**:
```
┌─────────────────────────────────────────────────┐
│  Periodisk sammanställning                       │
│                                                  │
│  [Period selector: 2026 / Kvartal 1 ▼]          │
│  Filing type: ○ Varor (monthly) ○ Tjänster (quarterly) ○ Båda │
│                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │ Total varor│  │Total tjänst│  │  Kunder    │ │
│  │ 1 250 000  │  │   340 000  │  │    12      │ │
│  │    SEK     │  │    SEK     │  │            │ │
│  └────────────┘  └────────────┘  └────────────┘ │
│                                                  │
│  ⚠ 2 varningar                    [Ladda ner ▼] │
│                                                  │
│  ┌───────────────────────────────────────────┐   │
│  │ VAT-nummer      │ Land │ Varor  │ Tjänster│   │
│  │ DE123456789     │ 🇩🇪  │ 450 000│   0     │   │
│  │ FR87654321      │ 🇫🇷  │ 320 000│ 120 000 │   │
│  │ FI11223344      │ 🇫🇮  │ 280 000│  80 000 │   │
│  │ ⚠ NL(saknas)    │ 🇳🇱  │ 200 000│   0     │   │
│  │ ...             │      │        │         │   │
│  └───────────────────────────────────────────┘   │
│                                                  │
│  Korsvalidering mot momsdeklaration:             │
│  Ruta 35 (varor): 1 250 000 ✓                   │
│  Ruta 39 (tjänster): 340 000 ✓                   │
│  Nästa deadline: 25 april 2026 (31 dagar kvar)   │
└─────────────────────────────────────────────────┘
```

**Features**:
- Period selector (month or quarter)
- KPI cards: total goods, total services, customer count
- Warning banner with expandable details
- Sortable table of customers with VAT numbers, country flags, amounts
- Download button: CSV or XML format
- Cross-validation section: compares with momsdeklaration box totals
- Deadline countdown

#### 1.5 Tests (`__tests__/eu-sales-list-engine.test.ts`)

Test cases:
- Aggregation by customer VAT number (multiple invoices to same customer)
- Goods vs services separation (based on revenue account)
- Credit note handling (reduces customer total, can go negative)
- Missing VAT number warning
- Unvalidated VAT number warning
- Cross-check with GL account totals
- Empty period (no EU sales)
- Mixed period (some EU, some non-EU, some domestic)
- Currency conversion (all amounts in SEK regardless of invoice currency)

---

### Phase 2: Export VAT Monitor / Exportmoms-monitor

**Extension slug**: `vat-monitor`
**Data pattern**: `core` (read-only from journal entries + invoices)
**Output**: Dashboard with momsdeklaration box mapping

#### 2.1 Engine (`vat-monitor-engine.ts`)

**Input**: User ID, period (year + month or quarter)

**Logic**:
1. Fetch all journal entry lines for the period on revenue accounts:
   - Domestic: `3001` (25%), `3002` (12%), `3003` (6%)
   - EU goods: `3108` (reverse charge, 0%)
   - EU services: `3308` (reverse charge, 0%)
   - Non-EU goods: `3105` (export, 0%)
   - Non-EU services: `3305` (export, 0%)
   - Triangular: `3109` (trepartshandel)
   - Invoiced freight: `3521` (EU), `3522` (export)
2. Map each account to the correct momsdeklaration box:
   - `3001/3002/3003` → Box 05 (standard taxable sales)
   - `3108` → Box 35 (EU goods)
   - `3305` → Box 40 (other services abroad)
   - `3308` → Box 39 (EU services, main rule)
   - `3105` → Box 36 (goods export outside EU)
   - `3109` → Box 38 (triangular trade sales)
   - `3521` → follows goods treatment (Box 35)
   - `3522` → Box 36
3. Sum credit amounts per box (revenue is credit-side)
4. Also fetch VAT account totals:
   - `2611` (output VAT 25%), `2621` (12%), `2631` (6%) → Boxes 10, 11, 12
   - `2641` (input VAT) → Box 48
5. Calculate net VAT (output - input) → Box 49
6. Validate:
   - Box 35 + Box 39 should match EU Sales List totals (if extension 1 is enabled)
   - Invoices with `vat_treatment = 'reverse_charge'` should be on accounts 3108/3308
   - Invoices with `vat_treatment = 'export'` should be on accounts 3105/3305
   - Flag any invoice where the `moms_ruta` doesn't match the expected box for its account

**Output structure**:
```typescript
interface VatMonitorReport {
  period: { year: number; month?: number; quarter?: number }
  boxes: Record<string, VatBoxData>  // '05', '10', '11', '12', '35', '36', '39', '40', '48', '49'
  revenueBreakdown: {
    domestic: { amount: number; percentage: number }
    euGoods: { amount: number; percentage: number }
    euServices: { amount: number; percentage: number }
    exportGoods: { amount: number; percentage: number }
    exportServices: { amount: number; percentage: number }
    triangular: { amount: number; percentage: number }
  }
  warnings: VatMonitorWarning[]
  previousPeriod?: VatMonitorReport  // For comparison
}

interface VatBoxData {
  boxNumber: string
  label: string       // Swedish label
  amount: number      // SEK
  accounts: string[]  // Contributing BAS accounts
}

interface VatMonitorWarning {
  type: 'wrong_account' | 'missing_moms_ruta' | 'vat_treatment_mismatch' | 'missing_vat_number' | 'cross_check_mismatch'
  severity: 'error' | 'warning'
  invoiceId?: string
  message: string
}
```

#### 2.2 Box mapping reference (`moms-box-mapping.ts`)

```typescript
// Shared between EU Sales List and VAT Monitor
const ACCOUNT_TO_BOX: Record<string, string> = {
  '3001': '05', '3002': '05', '3003': '05',  // Domestic revenue
  '3108': '35',                                // EU goods (reverse charge)
  '3308': '39',                                // EU services (reverse charge)
  '3105': '36',                                // Export goods (non-EU)
  '3305': '40',                                // Export services (non-EU)
  '3109': '38',                                // Triangular trade
  '3521': '35',                                // Invoiced freight EU
  '3522': '36',                                // Invoiced freight export
  '2611': '10', '2621': '11', '2631': '12',   // Output VAT
  '2641': '48',                                // Input VAT
}

const BOX_LABELS: Record<string, string> = {
  '05': 'Momspliktig försäljning',
  '10': 'Utgående moms 25%',
  '11': 'Utgående moms 12%',
  '12': 'Utgående moms 6%',
  '35': 'Varuförsäljning till annat EU-land',
  '36': 'Varuförsäljning utanför EU (export)',
  '37': 'Mellanmans inköp vid trepartshandel',
  '38': 'Mellanmans försäljning vid trepartshandel',
  '39': 'Tjänsteförsäljning till EU (huvudregeln)',
  '40': 'Övrig försäljning av tjänster utomlands',
  '41': 'Försäljning med omvänd skattskyldighet (Sverige)',
  '42': 'Övrig försäljning m.m.',
  '48': 'Ingående moms att dra av',
  '49': 'Moms att betala eller få tillbaka',
}
```

#### 2.3 Workspace UI (`VatMonitorWorkspace.tsx`)

**Layout**:
```
┌─────────────────────────────────────────────────────────┐
│  Exportmoms-monitor                                      │
│                                                          │
│  [Period: 2026-03 ▼]  [Jämför med: 2026-02 ▼]          │
│                                                          │
│  ── Intäktsfördelning ──────────────────────────────     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Inrikes  │ │ EU varor │ │EU tjänst │ │ Export   │   │
│  │2 100 000 │ │1 250 000 │ │  340 000 │ │  890 000 │   │
│  │   46%    │ │   27%    │ │    7%    │ │   20%    │   │
│  │  ↑ +5%   │ │  ↓ -3%   │ │  ↑ +12% │ │  ↑ +8%  │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│                                                          │
│  ── Momsdeklaration (förhandsvisning) ──────────────     │
│  ┌─────────────────────────────────────────────────┐     │
│  │ Ruta │ Beskrivning                    │ Belopp  │     │
│  │  05  │ Momspliktig försäljning        │2 100 000│     │
│  │  10  │ Utgående moms 25%             │  525 000│     │
│  │  35  │ Varuförsäljning EU            │1 250 000│     │
│  │  36  │ Export utanför EU              │  890 000│     │
│  │  39  │ Tjänsteförsäljning EU          │  340 000│     │
│  │  48  │ Ingående moms                  │  380 000│     │
│  │  49  │ Moms att betala               │  145 000│     │
│  └─────────────────────────────────────────────────┘     │
│                                                          │
│  ⚠ 1 varning: Faktura #2026-042 till DE-kund saknar    │
│    validerat VAT-nummer men är bokförd på konto 3108.    │
│                                                          │
│  ── Trend (senaste 6 månader) ──────────────────────     │
│  [Bar chart: domestic vs EU vs export per month]         │
└─────────────────────────────────────────────────────────┘
```

**Features**:
- Period selector with comparison period
- KPI cards: revenue by destination type with % share and delta
- Momsdeklaration preview table with all relevant boxes pre-filled
- Warning panel with actionable messages
- 6-month trend chart showing revenue mix over time
- Drill-down: click a box number to see contributing invoices

#### 2.4 Tests (`__tests__/vat-monitor-engine.test.ts`)

Test cases:
- Correct box mapping for each revenue account
- Mixed domestic + EU + export revenue
- Period comparison (delta calculation)
- Warning: invoice on 3108 without validated VAT number
- Warning: invoice `vat_treatment` doesn't match account
- Warning: `moms_ruta` doesn't match expected box for account
- Empty period
- Only domestic sales (no export boxes populated)
- Freight accounts follow goods treatment
- VAT calculation: output minus input = box 49

---

### Phase 3: Intrastat Generator

**Extension slug**: `intrastat`
**Data pattern**: `both` (reads invoices + stores product metadata in extension_data)
**Output**: Downloadable CSV file for SCB IDEP.web

#### 3.1 Product metadata storage

Uses `extension_data` table with these key patterns:
- `product:{productId}` → `{ cn_code, description, net_weight_kg, country_of_origin, supplementary_unit, supplementary_unit_type }`
- `settings` → `{ default_transaction_nature: '11', default_delivery_terms: 'FCA', threshold_alert_enabled: true }`

The `productId` is a user-defined identifier (e.g., SKU or product name) since there's no core products table.

#### 3.2 Engine (`intrastat-engine.ts`)

**Input**: User ID, period (year + month)

**Logic**:
1. Fetch all invoices for the period where:
   - Customer `country` is an EU member state (not Sweden)
   - `vat_treatment = 'reverse_charge'` (B2B goods)
   - Revenue account is `3108` (goods to EU)
   - `status` is `sent` or `paid`
2. For each invoice line, look up product metadata from extension_data
3. Aggregate by: CN code + partner country + country of origin + transaction nature + delivery terms
4. For each aggregated line, calculate:
   - Total invoiced value in SEK (using `total_sek` from invoice)
   - Total net mass (kg) from product metadata × quantity
   - Supplementary units (if required by CN code)
5. Handle credit notes: generate correction lines for the original period
6. Calculate cumulative dispatch value (rolling 12 months) for threshold monitoring

**Output structure**:
```typescript
interface IntrastatReport {
  period: { year: number; month: number }
  reporterVatNumber: string
  reporterName: string
  flowType: 'dispatch'  // We focus on exports
  lines: IntrastatLine[]
  totals: { invoicedValue: number; netMass: number; lineCount: number }
  thresholdStatus: {
    cumulativeValue: number     // Rolling 12 months
    threshold: 12_000_000       // SEK
    isObligated: boolean
    percentageUsed: number
  }
  warnings: IntrastatWarning[]
}

interface IntrastatLine {
  cnCode: string            // 8-digit CN commodity code
  partnerCountry: string    // 2-letter ISO (destination)
  countryOfOrigin: string   // 2-letter ISO
  transactionNature: string // 2-digit code (e.g., '11' for outright sale)
  deliveryTerms: string     // Incoterms code
  invoicedValue: number     // SEK, rounded to whole
  netMass: number           // kg, up to 3 decimals
  supplementaryUnit?: number
  supplementaryUnitType?: string
  partnerVatId: string      // Customer VAT number
}

interface IntrastatWarning {
  type: 'missing_cn_code' | 'missing_weight' | 'missing_origin' | 'unmatched_invoice_line' | 'threshold_approaching'
  invoiceId?: string
  productId?: string
  message: string
}
```

#### 3.3 SCB file generator (`scb-file-generator.ts`)

Generates CSV compatible with IDEP.web upload:
- Header row with field names
- One row per aggregated line
- Encoding: UTF-8 with BOM
- Semicolon-separated (IDEP.web standard)
- Fields: CN code, partner country, country of origin, transaction nature, delivery terms, invoiced value, net mass, supplementary unit, partner VAT ID

#### 3.4 Workspace UI (`IntrastatWorkspace.tsx`)

**Layout**:
```
┌──────────────────────────────────────────────────────────┐
│  Intrastat-generator                                      │
│                                                           │
│  [Period: 2026-03 ▼]                                     │
│                                                           │
│  ── Tröskelvärde ────────────────────────────────────     │
│  ┌────────────────────────────────────────────────┐       │
│  │ Ackumulerad utförsel (12 mån): 8 450 000 SEK  │       │
│  │ ████████████████░░░░░░░░  70% av 12 000 000   │       │
│  │ Status: Under tröskelvärdet (frivillig)        │       │
│  └────────────────────────────────────────────────┘       │
│                                                           │
│  ── Produktregister ─────────────────── [+ Lägg till]     │
│  ┌──────────────────────────────────────────────────┐     │
│  │ Produkt     │ CN-kod   │ Vikt(kg) │ Ursprung    │     │
│  │ Stålbalk M8 │ 72163100 │ 45.5     │ SE          │     │
│  │ Ventil DN50 │ 84818019 │ 2.3      │ DE          │     │
│  │ ⚠ Pump XL   │ (saknas) │ 12.0     │ SE          │     │
│  └──────────────────────────────────────────────────┘     │
│                                                           │
│  ── Deklaration mars 2026 ──────────── [Ladda ner CSV]    │
│  ┌──────────────────────────────────────────────────┐     │
│  │ CN-kod   │ Land │ Urspr │ Värde SEK│ Vikt kg    │     │
│  │ 72163100 │ DE   │ SE    │  450 000 │  4 550     │     │
│  │ 72163100 │ FI   │ SE    │  120 000 │  1 200     │     │
│  │ 84818019 │ DE   │ DE    │  230 000 │    46      │     │
│  │ Total    │      │       │  800 000 │  5 796     │     │
│  └──────────────────────────────────────────────────┘     │
│                                                           │
│  ⚠ 1 varning: Produkt "Pump XL" saknar CN-kod.          │
│  Deadline: 14 april 2026 (10:e arbetsdagen)              │
└──────────────────────────────────────────────────────────┘
```

**Features**:
- Threshold progress bar (cumulative 12-month dispatches vs SEK 12M)
- Product registry: CRUD for product metadata (CN codes, weights, origin)
- Auto-generated declaration table from period's EU goods invoices
- Warning panel for missing metadata
- Download button for SCB-compatible CSV
- Deadline display (10th business day of following month)

#### 3.5 Tests (`__tests__/intrastat-engine.test.ts`)

Test cases:
- Aggregation by CN code + country + origin
- Multiple invoices to same country with same CN code (should aggregate)
- Credit note correction (negative line for original period)
- Missing CN code warning
- Missing weight warning
- Threshold calculation (rolling 12 months)
- Threshold crossing alert
- Empty period (no EU goods dispatches)
- Non-EU invoices excluded
- Services excluded (only goods on account 3108)

---

### Phase 4: Multi-Currency Receivables Manager / Valutafordringar

**Extension slug**: `currency-receivables`
**Data pattern**: `core` (read-only from invoices + journal entries + transactions)
**Output**: Dashboard showing FX exposure and unrealized gains/losses

#### 4.1 Engine (`receivables-engine.ts`)

**Input**: User ID, reference date (default: today)

**Logic**:
1. Fetch all unpaid invoices (`status = 'sent'` or `'overdue'`) where `currency != 'SEK'`
2. For each invoice, calculate:
   - Original amount in foreign currency (`total`)
   - Booked SEK value (`total_sek` or `total × exchange_rate`)
   - Current SEK value using today's Riksbanken rate
   - Unrealized gain/loss = current SEK value - booked SEK value
3. Group by currency for exposure summary
4. Fetch realized gains/losses from journal entry lines:
   - Account `3960` (gains) credit amounts for the period
   - Account `7960` (losses) debit amounts for the period
5. Fetch historical realized FX per month for trend analysis
6. Calculate totals:
   - Total foreign receivables (SEK equivalent at current rate)
   - Total unrealized gain/loss
   - Total realized gain/loss for current period

**Output structure**:
```typescript
interface CurrencyReceivablesReport {
  referenceDate: string
  exchangeRates: Record<string, { rate: number; date: string }>  // From Riksbanken

  // Exposure by currency
  exposureByCurrency: CurrencyExposure[]

  // Individual receivables
  receivables: ForeignReceivable[]

  // Realized FX for period
  realizedGainLoss: {
    period: { year: number; month: number }
    gains: number   // Account 3960 credit total
    losses: number  // Account 7960 debit total
    net: number
  }

  // Monthly trend (last 12 months)
  monthlyTrend: MonthlyFXTrend[]
}

interface CurrencyExposure {
  currency: string
  totalForeignAmount: number    // In original currency
  bookedSekValue: number        // At invoice-date rates
  currentSekValue: number       // At today's Riksbanken rate
  unrealizedGainLoss: number    // currentSek - bookedSek
  invoiceCount: number
  averageBookedRate: number
  currentRate: number
}

interface ForeignReceivable {
  invoiceId: string
  invoiceNumber: string
  customerName: string
  customerCountry: string
  currency: string
  foreignAmount: number
  bookedSekAmount: number
  bookedRate: number
  currentSekAmount: number
  currentRate: number
  unrealizedGainLoss: number
  invoiceDate: string
  dueDate: string
  daysOutstanding: number
}

interface MonthlyFXTrend {
  month: string  // 'YYYY-MM'
  realizedGains: number
  realizedLosses: number
  netRealized: number
  unrealizedAtMonthEnd: number
}
```

#### 4.2 Riksbanken rate integration

Extend `lib/currency/` or create `riksbanken-client.ts`:
- Fetch daily mid-rates from Riksbanken's REST API
- Cache rates for the current day
- Support historical rate lookup (for trend calculations)
- Fallback: use the most recent available rate if today's isn't published yet (rates published at 16:15 on business days)

**Riksbanken API**: `https://api.riksbank.se/swea/v1/CrossRates`

#### 4.3 Workspace UI (`CurrencyReceivablesWorkspace.tsx`)

**Layout**:
```
┌──────────────────────────────────────────────────────────┐
│  Valutafordringar                                         │
│                                                           │
│  Växelkurser per 2026-03-15 (Riksbanken)                 │
│  EUR: 11.42  USD: 10.85  GBP: 13.72  NOK: 1.02          │
│                                                           │
│  ── Valutaexponering ────────────────────────────────     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │   EUR    │ │   USD    │ │   GBP    │ │  Totalt  │    │
│  │€ 125 000 │ │$ 45 000  │ │£ 12 000  │ │          │    │
│  │1 427 500 │ │  488 250 │ │  164 640 │ │2 080 390 │    │
│  │  SEK     │ │  SEK     │ │  SEK     │ │  SEK     │    │
│  │ +32 500  │ │  -8 200  │ │ +1 440   │ │ +25 740  │    │
│  │ orealis. │ │ orealis. │ │ orealis. │ │ orealis. │    │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │
│                                                           │
│  ── Öppna fordringar ─────────────────────────────────    │
│  ┌──────────────────────────────────────────────────┐     │
│  │ Faktura  │ Kund       │ Valuta│ Belopp │Orealis.│     │
│  │ 2026-031 │ Müller GmbH│ EUR   │ 50 000 │+12 500 │     │
│  │ 2026-035 │ Smith Inc  │ USD   │ 25 000 │ -5 200 │     │
│  │ 2026-038 │ Dupont SA  │ EUR   │ 75 000 │+20 000 │     │
│  │ 2026-041 │ Jones Ltd  │ GBP   │ 12 000 │ +1 440 │     │
│  │ 2026-044 │ Brown Corp │ USD   │ 20 000 │ -3 000 │     │
│  └──────────────────────────────────────────────────┘     │
│                                                           │
│  ── Realiserade kursdifferenser 2026 ─────────────────    │
│  ┌──────────────────────────────────────────────────┐     │
│  │ Månad   │ Vinst(3960)│ Förlust(7960)│ Netto    │     │
│  │ Jan     │   +8 500   │    -3 200    │  +5 300  │     │
│  │ Feb     │  +12 300   │    -7 800    │  +4 500  │     │
│  │ Mar     │   +4 200   │    -1 100    │  +3 100  │     │
│  │ Totalt  │  +25 000   │   -12 100    │ +12 900  │     │
│  └──────────────────────────────────────────────────┘     │
│                                                           │
│  ── Period-end revaluation preview ───────────────────    │
│  Om bokslut görs idag: netto orealiserad vinst +25 740   │
│  (Konto 3969: +33 940 / Konto 7969: -8 200)             │
│  ℹ Bokföringsposterna skapas inte av detta tillägg.      │
│    Använd värdena ovan som underlag vid periodbokslut.    │
└──────────────────────────────────────────────────────────┘
```

**Features**:
- Live Riksbanken exchange rates display
- Exposure KPI cards per currency showing foreign amount, SEK value, unrealized gain/loss
- Sortable receivables table with per-invoice unrealized gain/loss
- Color coding: green for gains, red for losses
- Realized FX trend table (monthly, from accounts 3960/7960)
- Period-end revaluation preview (informational — tells user what entries to make, doesn't create them)
- Note clarifying that this extension doesn't create journal entries

#### 4.4 Tests (`__tests__/receivables-engine.test.ts`)

Test cases:
- Unrealized gain calculation (rate increased since invoice date)
- Unrealized loss calculation (rate decreased)
- Multiple currencies aggregation
- Paid invoices excluded from exposure
- Realized gains from account 3960
- Realized losses from account 7960
- Monthly trend calculation
- Empty state (no foreign receivables)
- SEK-only invoices excluded
- Exchange rate not available (use most recent)

---

### Phase 5: Integration & Polish

#### 5.1 Register all extensions in loader
Add to `FIRST_PARTY_EXTENSIONS` in `lib/extensions/loader.ts`:
```typescript
import { euSalesListExtension } from '@/extensions/export/eu-sales-list'
import { vatMonitorExtension } from '@/extensions/export/vat-monitor'
import { intrastatExtension } from '@/extensions/export/intrastat'
import { currencyReceivablesExtension } from '@/extensions/export/currency-receivables'
```

#### 5.2 Register workspace components
Add to `lib/extensions/workspace-registry.tsx`:
```typescript
'export/eu-sales-list': dynamic(() => import('@/components/extensions/export/EuSalesListWorkspace')),
'export/vat-monitor': dynamic(() => import('@/components/extensions/export/VatMonitorWorkspace')),
'export/intrastat': dynamic(() => import('@/components/extensions/export/IntrastatWorkspace')),
'export/currency-receivables': dynamic(() => import('@/components/extensions/export/CurrencyReceivablesWorkspace')),
```

#### 5.3 Add icon imports
Update `lib/extensions/icon-resolver.tsx` with new icons:
- `Ship` — sector icon
- `FileText` — EU Sales List
- `Shield` — VAT Monitor
- `BarChart3` — Intrastat (already exists)
- `TrendingUp` — Currency Receivables (already exists)

#### 5.4 Cross-extension validation
When multiple export extensions are enabled:
- VAT Monitor can cross-reference with EU Sales List totals
- Intrastat threshold data validates against VAT Monitor's box 35 total
- Currency Receivables exposure aligns with invoices visible in EU Sales List

#### 5.5 API routes
Each extension needs data-fetching API routes:

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/extensions/export/eu-sales-list/report` | GET | Generate report for period |
| `/api/extensions/export/eu-sales-list/download` | GET | Download CSV/XML file |
| `/api/extensions/export/eu-sales-list/validate-vat` | POST | VIES VAT number validation |
| `/api/extensions/export/vat-monitor/report` | GET | Generate VAT box report |
| `/api/extensions/export/intrastat/report` | GET | Generate Intrastat declaration |
| `/api/extensions/export/intrastat/download` | GET | Download SCB CSV file |
| `/api/extensions/export/intrastat/products` | GET/POST/DELETE | Product metadata CRUD |
| `/api/extensions/export/currency-receivables/report` | GET | Exposure + unrealized report |
| `/api/extensions/export/currency-receivables/rates` | GET | Current Riksbanken rates |

---

## Build Order Summary

| Phase | Extension | Key deliverables | Depends on |
|-------|-----------|-----------------|------------|
| 0 | Infrastructure | Sector registration, shared components, shared utilities | — |
| 1 | EU Sales List | Engine, VIES client, XML generator, workspace, tests | Phase 0 |
| 2 | VAT Monitor | Engine, box mapping, workspace, tests | Phase 0 |
| 3 | Intrastat | Engine, product CRUD, SCB CSV generator, workspace, tests | Phase 0 |
| 4 | Currency Receivables | Engine, Riksbanken client, workspace, tests | Phase 0 |
| 5 | Integration | Loader registration, workspace registry, icon imports, cross-validation | Phases 1-4 |
