# Future Features & Regulatory Integrations

## Phase 2: SIE File Import (Migration)

### Overview

SIE (Standard Import Export) is the Swedish standard for accounting data exchange. Users migrating from Fortnox, Visma, or other systems can export their data as SIE files.

### SIE File Types

| Type | Content | Use Case |
|------|---------|----------|
| SIE1 | Årssaldon | Year-end balances only |
| SIE2 | Periodsaldon | Monthly/periodic balances |
| SIE3 | Objektsaldon | Balances with cost centers |
| SIE4 | Transaktioner | Full transaction history |

**Recommended:** Support SIE4 for complete migration, SIE1/2 for simpler imports.

### Implementation Notes

```typescript
// lib/import/sie-parser.ts

interface SIETransaction {
  verifikationsnummer: string
  datum: Date
  kontonummer: string
  belopp: number
  text: string
}

interface SIEImportResult {
  company: {
    name: string
    orgNumber: string
    fiscalYearStart: Date
  }
  accounts: Array<{ number: string; name: string }>
  transactions: SIETransaction[]
  balances: Array<{ account: string; balance: number }>
}

// SIE files use CP437 encoding and specific format
// Example line: #VER A 1 20240115 "Faktura 1001"
```

### Mapping Decisions Needed

Before implementing, determine mapping for:
- BAS account numbers → system categories
- Opening balances → how to represent
- Customer/supplier data (if present in SIE)
- Historical invoices → create as "imported" status?

---

## Phase 2: Benefits & Gifts Module (Förmånshantering)

### Problem

Influencers receive products ("PR-utskick", "gifted collabs") that may be taxable income. Skatteverket actively audits this. Getting it wrong = skattetillägg.

### Decision Tree Logic

```typescript
// lib/benefits/gift-classifier.ts

interface GiftClassification {
  taxable: boolean
  marketValue: number
  deductibleAsExpense: boolean
  bookingType: 'income' | 'income_and_expense' | 'tax_free'
  reasoning: string
}

interface GiftInput {
  estimatedValue: number
  hasMotprestation: boolean  // Required post/video/mention?
  usedInBusiness: boolean    // Used as props/equipment?
  usedPrivately: boolean     // Personal use?
  isSimplePromoItem: boolean // Pen, mug, basic merch?
}

const TAX_FREE_PROMO_THRESHOLD = 450 // SEK, Skatteverket guideline

export function classifyGift(input: GiftInput): GiftClassification {
  // Rule 1: Simple promotional items under threshold = tax free
  if (input.isSimplePromoItem && input.estimatedValue <= TAX_FREE_PROMO_THRESHOLD && !input.hasMotprestation) {
    return {
      taxable: false,
      marketValue: input.estimatedValue,
      deductibleAsExpense: false,
      bookingType: 'tax_free',
      reasoning: 'Enklare reklamgåva under 450 kr utan krav på motprestation'
    }
  }

  // Rule 2: Motprestation exists = always taxable
  if (input.hasMotprestation) {
    if (input.usedInBusiness && !input.usedPrivately) {
      return {
        taxable: true,
        marketValue: input.estimatedValue,
        deductibleAsExpense: true,
        bookingType: 'income_and_expense',
        reasoning: 'Skattepliktig förmån (motprestation krävdes). Avdragsgill som rekvisita då den endast används i verksamheten.'
      }
    }
    
    return {
      taxable: true,
      marketValue: input.estimatedValue,
      deductibleAsExpense: false,
      bookingType: 'income',
      reasoning: 'Skattepliktig förmån (motprestation krävdes). Ej avdragsgill då produkten används privat.'
    }
  }

  // Rule 3: High value without motprestation but used privately
  if (input.estimatedValue > TAX_FREE_PROMO_THRESHOLD && input.usedPrivately) {
    return {
      taxable: true,
      marketValue: input.estimatedValue,
      deductibleAsExpense: false,
      bookingType: 'income',
      reasoning: 'Värdet överstiger gränsen för skattefria reklamgåvor och produkten används privat.'
    }
  }

  // Default: taxable if significant value
  return {
    taxable: input.estimatedValue > TAX_FREE_PROMO_THRESHOLD,
    marketValue: input.estimatedValue,
    deductibleAsExpense: input.usedInBusiness,
    bookingType: input.estimatedValue > TAX_FREE_PROMO_THRESHOLD ? 'income' : 'tax_free',
    reasoning: 'Klassificering baserad på värde och användning'
  }
}
```

### UI Flow

1. User taps "Logga gåva/produkt"
2. Photo capture or manual entry
3. System queries price APIs (Prisjakt, Google Shopping) for value estimate
4. Decision tree questions:
   - "Fanns krav på att du skulle posta om denna produkt?" [Ja/Nej]
   - "Använder du produkten i din content-produktion?" [Ja/Nej]
   - "Använder du produkten privat?" [Ja/Nej]
5. System shows classification + tax impact
6. Auto-booking to correct accounts

---

## Phase 2: NE-bilaga Generation

### SRU File Format

Skatteverket accepts SRU (Standardiserat RäkenskapsUtdrag) files for tax form import.

```typescript
// lib/tax/sru-generator.ts

interface NEBilaga {
  // R1-series: Income
  R1_nettoomsattning: number      // Net revenue
  R2_ovriga_intakter: number      // Other income
  
  // R3-series: Costs
  R3_varor: number                // Cost of goods
  R4_ovriga_kostnader: number     // Other expenses
  R5_personal: number             // Personnel costs (usually 0 for sole proprietor)
  R6_avskrivningar: number        // Depreciation
  
  // R7-series: Financial
  R7_ranteintakter: number
  R8_rantekostnader: number
  
  // Result
  R9_resultat: number             // Profit/loss before adjustments
  
  // Adjustments
  R10_periodiseringsfond_avsatt: number   // Max 30% of profit
  R11_periodiseringsfond_aterforing: number
  R12_expansionsfond: number
  
  // Final
  R14_overskott_underskott: number
}

function generateSRUFile(data: NEBilaga, personnummer: string, year: number): string {
  const lines: string[] = []
  
  // Header
  lines.push('#DATABESKRIVNING_START')
  lines.push('#PRODUKT SIE')
  lines.push('#FORMAT PC8')
  lines.push('#FILTYP NARINGSBILAGA')
  lines.push(`#UPPGIFTSLAMNARE ${personnummer}`)
  lines.push(`#INKOMSTAR ${year}`)
  lines.push('#DATABESKRIVNING_SLUT')
  
  // Data rows (simplified)
  lines.push(`#UPPGIFT 7001 ${data.R1_nettoomsattning}`)  // R1
  lines.push(`#UPPGIFT 7002 ${data.R2_ovriga_intakter}`)  // R2
  // ... continue for all fields
  
  lines.push('#UPPGIFT_SLUT')
  
  return lines.join('\n')
}
```

### BAS Account to NE Mapping

| BAS Account | Description | NE Ruta |
|-------------|-------------|---------|
| 3000-3999 | Intäkter | R1 |
| 3900-3999 | Övriga rörelseintäkter | R2 |
| 4000-4999 | Varuinköp | R3 |
| 5000-6999 | Övriga externa kostnader | R4 |
| 7000-7699 | Personalkostnader | R5 |
| 7800-7899 | Avskrivningar | R6 |
| 8300-8399 | Ränteintäkter | R7 |
| 8400-8499 | Räntekostnader | R8 |

### Tax Optimization Suggestions

Before generating NE-bilaga, system should suggest:

1. **Periodiseringsfond** (max 30% of profit)
   - Defer tax to future years
   - Must be reversed within 6 years
   - Good for income smoothing

2. **Expansionsfond** 
   - Tax profit at 22% corporate rate instead of marginal personal rate
   - Good if marginal rate > 22%
   - More complex rules

```typescript
function suggestTaxOptimization(profit: number, marginalTaxRate: number) {
  const suggestions = []
  
  if (profit > 0) {
    const maxPeriodisering = profit * 0.30
    suggestions.push({
      type: 'periodiseringsfond',
      amount: maxPeriodisering,
      taxSaved: maxPeriodisering * marginalTaxRate,
      description: `Sätt av ${formatSEK(maxPeriodisering)} till periodiseringsfond för att skjuta upp ${formatSEK(maxPeriodisering * marginalTaxRate)} i skatt.`
    })
  }
  
  if (profit > 100000 && marginalTaxRate > 0.30) {
    suggestions.push({
      type: 'expansionsfond',
      description: 'Din marginalskatt är hög. Överväg expansionsfond för att beskattas med 22% istället.'
    })
  }
  
  return suggestions
}
```

---

## Phase 2b: AB Salary Optimization (3:12-reglerna)

### Overview

For aktiebolag owners, the split between lön (salary) and utdelning (dividend) significantly impacts total tax. The 3:12 rules (Inkomstskattelagen kapitel 57) determine how much dividend can be taxed at the favorable 20% rate vs marginal income tax rates.

### Key Concepts

| Term | Description |
|------|-------------|
| Gränsbelopp | Annual limit for dividend taxed at 20% |
| Löneunderlag | Salary base that increases gränsbelopp |
| Kvalificerade andelar | Shares where owner is "active" in company |
| Sparat utdelningsutrymme | Unused gränsbelopp carried forward |

### Gränsbelopp Calculation (Simplified)

```typescript
// lib/tax/ab-optimization.ts

interface GransbeloppCalculation {
  schablonbelopp: number        // 2.75 × inkomstbasbelopp
  lonebaserat: number           // 50% of löneunderlag (if meets salary requirement)
  sparat: number                // Carried forward from previous years
  totalGransbelopp: number
}

const INKOMSTBASBELOPP_2024 = 74300

function calculateGransbelopp(
  ownerSalary: number,
  totalCompanySalaries: number,
  sparatUtdelningsutrymme: number
): GransbeloppCalculation {
  // Schablonbelopp: 2.75 × IBB
  const schablonbelopp = 2.75 * INKOMSTBASBELOPP_2024  // ~204k

  // Lönebaserat: requires owner salary ≥ 6 IBB (or 9.6% of total + 6 IBB)
  const minOwnerSalary = Math.min(
    6 * INKOMSTBASBELOPP_2024,
    0.096 * totalCompanySalaries + 6 * INKOMSTBASBELOPP_2024
  )
  
  const lonebaserat = ownerSalary >= minOwnerSalary 
    ? totalCompanySalaries * 0.50 
    : 0

  return {
    schablonbelopp,
    lonebaserat,
    sparat: sparatUtdelningsutrymme,
    totalGransbelopp: schablonbelopp + lonebaserat + sparatUtdelningsutrymme
  }
}
```

### Optimization Engine

```typescript
interface OptimizationRecommendation {
  recommendedSalary: number
  recommendedDividend: number
  taxOnSalary: number
  taxOnDividend: number
  totalTax: number
  savingsVsAllSalary: number
  explanation: string
}

function optimizeSalaryDividendSplit(
  availableProfit: number,
  ownerMarginalTaxRate: number,
  sparatUtdelningsutrymme: number
): OptimizationRecommendation {
  // Consider:
  // - Minimum salary for lönebaserat gränsbelopp (6 IBB = ~446k)
  // - Arbetsgivaravgifter (31.42%) on salary
  // - 20% tax on dividend within gränsbelopp
  // - Marginal tax on dividend above gränsbelopp
  // - Bolagsskatt (20.6%) already paid on profit
  
  // Return optimal split with explanation
}
```

### UI Concept

```
┌─────────────────────────────────────────────────────────────┐
│  💡 OPTIMERINGSFÖRSLAG                                      │
│                                                             │
│  Baserat på ditt resultat och skattesituation:              │
│                                                             │
│  Rekommenderad lön:        445 800 kr/år                   │
│  Rekommenderad utdelning:  204 325 kr                       │
│                                                             │
│  Beräknad total skatt:     ~142 000 kr                      │
│  vs allt som lön:          ~185 000 kr                      │
│  ─────────────────────────────────────────────────────────  │
│  Potentiell besparing:     ~43 000 kr                       │
│                                                             │
│  ⚠️ Detta är en uppskattning. Rådgör med revisor.          │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Requirements

- Track sparat utdelningsutrymme (historical data)
- Input for owner's other income (affects marginal rate)
- Annual update of inkomstbasbelopp
- Strong disclaimer: Not tax advice

---

## Phase 3: Skatteverket API Integrations

### Available APIs

Skatteverket offers several APIs that can enhance the product:

#### 1. Skattekonto API

Fetch user's tax account balance and transactions.

**Prerequisite:** User must grant "Läsombud" access in Skatteverket's system.

```typescript
// Conceptual - actual implementation requires OAuth2 + organizational agreement
interface SkattekontoBala {
  saldo: number
  senastInbetalning: Date
  kommandeForfall: Array<{
    datum: Date
    belopp: number
    typ: string  // 'F-skatt', 'Moms', etc.
  }>
}

// Use case: "Du har 15 000 kr på skattekontot, men beräknad skatt är 20 000 kr. Sätt in 5 000 kr nu."
```

#### 2. Momsdeklaration API

Submit VAT declaration directly from app.

**Prerequisites:**
- Registered as e-tjänstleverantör with Skatteverket
- User authentication via BankID
- Signed agreement with Skatteverket

```typescript
interface MomsdeklarationSubmission {
  period: string  // '2024-01' for January
  ruta05: number  // Momspliktig försäljning
  ruta39: number  // Tjänsteförsäljning EU
  ruta40: number  // Export
  ruta21: number  // Inköp tjänster EU
  ruta48: number  // Utgående moms inköp
  // ... all required rutor
}
```

#### 3. Arbetsgivardeklaration API

Not typically needed for sole proprietors without employees, but relevant if they hire.

### Integration Roadmap

| Phase | Integration | User Value |
|-------|-------------|------------|
| MVP | None (manual) | - |
| v1.5 | VIES VAT validation | Automated reverse charge |
| v2.0 | Skattekonto (read) | Real-time tax position |
| v2.5 | Momsdeklaration (submit) | One-click VAT filing |
| v3.0 | NE-bilaga (submit) | Full declaration automation |

---

## Phase 2: Reklammärkning Compliance

### Marknadsföringslagen Requirement

Swedish law requires clear ad disclosure. The "Kissie" case established that marking must be:
- At the very beginning of content
- Immediately visible
- Unambiguous ("Reklam" or "Annons", not just "Samarbete")

### Implementation

In Deal-to-Invoice flow, add mandatory checkbox:

```typescript
interface DealComplianceCheck {
  reklamMarkerad: boolean
  markeringTyp: 'inlagg' | 'video' | 'story' | 'podcast'
  bekraftelse: string  // Timestamp of user confirmation
}

// Before invoice can be marked as complete:
const complianceText = `Jag intygar att allt publicerat material för detta samarbete har reklammarkerats tydligt i början av varje inlägg/video i enlighet med Marknadsföringslagen (2008:486).`
```

---

## Data Retention & GDPR

### Conflict Resolution

**Bokföringslagen**: 7 years mandatory retention for räkenskapsinformation
**GDPR**: Right to erasure

Resolution:
- Accounting records (verifikationer, fakturor, kvitton): 7-year mandatory retention
- Non-accounting data (support chats, preferences, analytics): Can be deleted on request
- Technical implementation: Separate data stores with different retention policies

```typescript
// Database design consideration
interface UserDataPolicy {
  accountingData: {
    retention: '7_years_from_fiscal_year_end',
    deletable: false,
    legal_basis: 'Bokföringslagen 7 kap. 2 §'
  },
  operationalData: {
    retention: 'until_deletion_request',
    deletable: true,
    legal_basis: 'Consent / Legitimate interest'
  }
}
```

### Digital Archive Requirements (July 2024 Law)

Receipt photos must be:
- Stored in immutable format (PDF/A-3, locked JPEG)
- Backed up regularly
- Hosted within EU/EES or adequate country
- Tamper-evident (hash verification)

```typescript
interface ReceiptArchive {
  originalFilename: string
  storedAs: string  // UUID.pdf
  format: 'PDF/A-3'
  sha256Hash: string
  capturedAt: Date
  linkedTransactionId: string
  storageLocation: 'eu-north-1'  // Must be EU
}
```
