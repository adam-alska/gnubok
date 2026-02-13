# BAS Accounting Guide for Creator Economy

## Overview

This document provides the accounting logic layer for automatic transaction categorization using the Swedish BAS-kontoplan. It covers MCC code mapping, expense validation rules, and VAT handling for influencer-specific transactions.

## BAS Account Structure

The BAS-kontoplan uses a hierarchical 4-digit system where each position carries semantic meaning:

| Position | Name | Example | Meaning |
|----------|------|---------|---------|
| 1 | Kontoklass | **5**410 | Category (5 = External costs) |
| 2 | Kontogrupp | 5**4**10 | Type (54 = Consumables) |
| 3 | Huvudkonto | 54**1**0 | Main account for reporting |
| 4 | Underkonto | 541**0** | Detail level, VAT codes |

This enables validation logic built directly on account number structure.

---

## Account Classes Overview

| Class | Swedish | English | Influencer Relevance |
|-------|---------|---------|---------------------|
| 1xxx | Tillgångar | Assets | Equipment, bank accounts |
| 2xxx | Eget kapital & Skulder | Equity & Liabilities | VAT, owner withdrawals |
| 3xxx | Intäkter | Revenue | Platform income, sponsorships |
| 4xxx | Direkta kostnader | Direct costs | Merchandise COGS (rare) |
| 5xxx | Övriga externa kostnader | Other external costs | 90% of expenses land here |
| 6xxx | Övriga externa kostnader | Other external costs | Services, representation |
| 7xxx | Personalkostnader | Personnel costs | AB salary (see salary module) |
| 8xxx | Finansiella poster | Financial items | Interest, currency gains/losses |

---

## Critical BAS Accounts for Influencers

### Assets (Class 1)

| Account | Name | Use Case | Notes |
|---------|------|----------|-------|
| 1210 | Maskiner och inventarier | Cameras, computers > 29,400 kr | Depreciate over 5 years (20%/year) |
| 1930 | Företagskonto | Main bank account | Primary reconciliation account |

### Equity & Liabilities (Class 2)

| Account | Name | Use Case | Notes |
|---------|------|----------|-------|
| 2010 | Eget kapital | Owner's equity | Rolling balance |
| 2013 | Eget uttag | Private expenses paid with business card | **Critical for rejected deductions** |
| 2018 | Egen insättning | Owner deposits / travel allowance credit | Traktamente booking |
| 2440 | Leverantörsskulder | Accounts payable | If not paying immediately |
| 2611 | Utgående moms 25% | Output VAT 25% | Swedish domestic sales |
| 2614 | Utg. moms utländska förvärv | Output VAT on foreign purchases | Reverse charge (credit side) |
| 2641 | Ingående moms | Input VAT | Deductible VAT on purchases |
| 2645 | Ing. moms utländska förvärv | Input VAT on foreign purchases | Reverse charge (debit side) |

### Revenue (Class 3)

| Account | Name | Use Case | Notes |
|---------|------|----------|-------|
| 3001 | Försäljning 25% | Swedish sponsorships/collaborations | Standard domestic |
| 3044 | Försäljning tjänst EU | AdSense (Ireland), EU affiliates | VAT-free, requires Periodisk sammanställning |
| 3045 | Försäljning tjänst Export | Twitch (USA), non-EU platforms | VAT-free (export) |
| 3900 | Övriga intäkter | Stipends, royalties, misc | |

### Costs (Class 5-6)

| Account | Name | Use Case | Notes |
|---------|------|----------|-------|
| 5010 | Lokalhyra | Studio rental | Not for home office (strict rules) |
| 5410 | Förbrukningsinventarier | Cameras, computers < 29,400 kr | Direct deduction |
| 5420 | Programvaror | Adobe CC, Epidemic Sound, SaaS | Licenses/subscriptions |
| 5480 | Arbetskläder | Protective gear, uniforms | **NOT regular clothes** |
| 5490 | Övriga förbrukningsartiklar | Props, consumable supplies | |
| 5800 | Resekostnader | Train, flights, car rental | VAT varies (6% domestic travel) |
| 5820 | Taxikostnader | Taxi, Uber | |
| 5831 | Kost och logi Sverige | Hotels in Sweden | 12% VAT |
| 5832 | Kost och logi utlandet | Hotels abroad | No VAT recovery |
| 5841 | Traktamente, avdragsgillt | Travel allowance | Calculated per Skatteverket rates |
| 5890 | Övriga resekostnader | Non-deductible travel portion | For mixed-use trips |
| 5910 | Annonsering | Facebook Ads, Google Ads | Often triggers reverse charge |
| 5930 | Reklamtrycksaker | Promotional materials | |
| 6071 | Representation, avdragsgill | Simple refreshments (max 60 kr/person) | Very limited deduction |
| 6072 | Representation, ej avdragsgill | Meals for representation | VAT still deductible |
| 6230 | Datakommunikation | Web hosting, domains, internet | Infrastructure |
| 6500 | Övriga externa tjänster | Photographers, editors (with F-skatt) | Consultant services |
| 6991 | Övriga avdragsgilla kostnader | Miscellaneous deductible | Use sparingly |
| 6992 | Övriga ej avdragsgilla | Fines, penalties | No tax effect |

---

## MCC Code Mapping

Merchant Category Codes (MCC) are the primary signal for automatic categorization from bank transactions.

### Implementation

```typescript
// lib/accounting/mcc-mapping.ts

interface MCCMapping {
  mcc: string
  description: string
  riskLevel: 'low' | 'medium' | 'high' | 'very_high'
  primaryAccount: string
  secondaryAccount?: string
  requiresUserInput: boolean
  autoRejectReason?: string
  logic: string
}

const MCC_MAPPINGS: MCCMapping[] = [
  // ADVERTISING & MARKETING
  {
    mcc: '7311',
    description: 'Advertising Services',
    riskLevel: 'low',
    primaryAccount: '5910',
    secondaryAccount: '5930',
    requiresUserInput: false,
    logic: 'Standard for Facebook/Google Ads. Triggers EU VAT check.'
  },

  // ELECTRONICS & EQUIPMENT
  {
    mcc: '5732',
    description: 'Electronics Stores',
    riskLevel: 'medium',
    primaryAccount: '5410',
    secondaryAccount: '1210',
    requiresUserInput: false,
    logic: 'Amount determines routing. >29,400 kr → 1210 (asset).'
  },
  {
    mcc: '5946',
    description: 'Camera & Photo Supply',
    riskLevel: 'medium',
    primaryAccount: '5410',
    secondaryAccount: '1210',
    requiresUserInput: false,
    logic: 'Same as electronics. Check amount threshold.'
  },

  // RESTAURANTS & FOOD - HIGH RISK
  {
    mcc: '5812',
    description: 'Eating Places/Restaurants',
    riskLevel: 'high',
    primaryAccount: '6072',
    secondaryAccount: '2013',
    requiresUserInput: true,
    logic: 'Requires user input: Representation or private? Default to private (2013).'
  },
  {
    mcc: '5814',
    description: 'Fast Food',
    riskLevel: 'high',
    primaryAccount: '2013',
    requiresUserInput: false,
    autoRejectReason: 'Fast food is typically private expense',
    logic: 'Default to eget uttag. Rarely valid business expense.'
  },

  // CLOTHING - VERY HIGH RISK (Almost always rejected)
  {
    mcc: '5611',
    description: "Men's Clothing",
    riskLevel: 'very_high',
    primaryAccount: '2013',
    secondaryAccount: '5480',
    requiresUserInput: true,
    autoRejectReason: 'Clothes that can be worn privately are not deductible (RÅ81 1:29)',
    logic: 'Default MUST be 2013 (private). Only 5480 if protective/uniform.'
  },
  {
    mcc: '5621',
    description: "Women's Ready-to-Wear",
    riskLevel: 'very_high',
    primaryAccount: '2013',
    secondaryAccount: '5480',
    requiresUserInput: true,
    autoRejectReason: 'Clothes that can be worn privately are not deductible',
    logic: 'Default MUST be 2013 (private).'
  },
  {
    mcc: '5631',
    description: "Women's Accessories",
    riskLevel: 'very_high',
    primaryAccount: '2013',
    requiresUserInput: false,
    autoRejectReason: 'Accessories are private expenses',
    logic: 'Always 2013.'
  },

  // COSMETICS - VERY HIGH RISK
  {
    mcc: '5977',
    description: 'Cosmetic Stores',
    riskLevel: 'very_high',
    primaryAccount: '2013',
    secondaryAccount: '5490',
    requiresUserInput: true,
    autoRejectReason: 'Cosmetics are private expenses unless specific props',
    logic: 'Default private (2013). Only 5490 if clearly production props.'
  },

  // TRAVEL - MEDIUM RISK
  {
    mcc: '4111',
    description: 'Commuter Transport',
    riskLevel: 'low',
    primaryAccount: '5800',
    requiresUserInput: false,
    logic: 'Train/bus. 6% VAT in Sweden.'
  },
  {
    mcc: '4112',
    description: 'Passenger Railways',
    riskLevel: 'low',
    primaryAccount: '5800',
    requiresUserInput: false,
    logic: 'Train tickets. 6% VAT.'
  },
  {
    mcc: '4121',
    description: 'Taxicabs/Limousines',
    riskLevel: 'medium',
    primaryAccount: '5820',
    secondaryAccount: '2013',
    requiresUserInput: true,
    logic: 'Business trip or private? Ask user.'
  },
  {
    mcc: '4722',
    description: 'Travel Agencies',
    riskLevel: 'medium',
    primaryAccount: '5800',
    secondaryAccount: '2013',
    requiresUserInput: true,
    logic: 'Is the trip business-related? May need to split.'
  },
  {
    mcc: '7011',
    description: 'Hotels/Motels',
    riskLevel: 'medium',
    primaryAccount: '5831',
    secondaryAccount: '5832',
    requiresUserInput: false,
    logic: '5831 for Sweden (12% VAT), 5832 for abroad (no VAT).'
  },

  // SOFTWARE & DIGITAL SERVICES - LOW RISK
  {
    mcc: '7372',
    description: 'Computer Programming',
    riskLevel: 'low',
    primaryAccount: '6230',
    secondaryAccount: '5420',
    requiresUserInput: false,
    logic: 'Web hosting, domains, SaaS subscriptions.'
  },
  {
    mcc: '5734',
    description: 'Computer Software Stores',
    riskLevel: 'low',
    primaryAccount: '5420',
    requiresUserInput: false,
    logic: 'Software licenses.'
  },

  // ALCOHOL - ALWAYS REJECT
  {
    mcc: '5921',
    description: 'Package Stores (Systembolaget)',
    riskLevel: 'very_high',
    primaryAccount: '2013',
    requiresUserInput: false,
    autoRejectReason: 'Alcohol is not deductible',
    logic: 'Always 2013. No exceptions.'
  },

  // GROCERIES - HIGH RISK
  {
    mcc: '5411',
    description: 'Grocery Stores',
    riskLevel: 'high',
    primaryAccount: '2013',
    secondaryAccount: '6072',
    requiresUserInput: true,
    autoRejectReason: 'Food is typically private expense',
    logic: 'Default 2013. Only 6072 if documented representation.'
  },

  // STREAMING SERVICES
  {
    mcc: '4899',
    description: 'Cable/Streaming Services',
    riskLevel: 'medium',
    primaryAccount: '5420',
    secondaryAccount: '2013',
    requiresUserInput: true,
    logic: 'Netflix for research? Usually private. Ask user.'
  },

  // GYM & FITNESS - ALWAYS REJECT
  {
    mcc: '7941',
    description: 'Sports Clubs/Gyms',
    riskLevel: 'very_high',
    primaryAccount: '2013',
    requiresUserInput: false,
    autoRejectReason: 'Gym memberships are private expenses, even for fitness influencers',
    logic: 'Always 2013. IL 9 kap. 2 §'
  }
]
```

---

## Keyword-Based Categorization

For generic MCCs (Amazon, PayPal), analyze transaction description text.

```typescript
// lib/accounting/keyword-rules.ts

interface KeywordRule {
  keywords: string[]
  account: string
  confidence: 'high' | 'medium' | 'low'
  vatTreatment?: 'standard' | 'reverse_charge' | 'none'
}

const KEYWORD_RULES: KeywordRule[] = [
  // Software & Subscriptions
  {
    keywords: ['adobe', 'creative cloud'],
    account: '5420',
    confidence: 'high',
    vatTreatment: 'reverse_charge'  // Adobe Ireland
  },
  {
    keywords: ['epidemic sound'],
    account: '5420',
    confidence: 'high',
    vatTreatment: 'standard'  // Swedish company
  },
  {
    keywords: ['canva'],
    account: '5420',
    confidence: 'high',
    vatTreatment: 'reverse_charge'
  },
  {
    keywords: ['spotify', 'spotify ab'],
    account: '2013',  // Usually private
    confidence: 'medium'
  },
  {
    keywords: ['spotify for business', 'soundtrack'],
    account: '5420',
    confidence: 'high'
  },

  // Web Infrastructure
  {
    keywords: ['one.com', 'loopia', 'godaddy', 'namecheap', 'cloudflare'],
    account: '6230',
    confidence: 'high'
  },
  {
    keywords: ['vercel', 'netlify', 'heroku', 'aws', 'digitalocean'],
    account: '6230',
    confidence: 'high',
    vatTreatment: 'reverse_charge'
  },

  // Advertising Platforms
  {
    keywords: ['facebook', 'meta', 'instagram ads', 'fb ads'],
    account: '5910',
    confidence: 'high',
    vatTreatment: 'reverse_charge'  // Meta Ireland
  },
  {
    keywords: ['google ads', 'adwords'],
    account: '5910',
    confidence: 'high',
    vatTreatment: 'reverse_charge'  // Google Ireland
  },
  {
    keywords: ['tiktok ads', 'tiktok for business'],
    account: '5910',
    confidence: 'high',
    vatTreatment: 'reverse_charge'
  },

  // Transport
  {
    keywords: ['uber', 'bolt', 'taxi'],
    account: '5820',
    confidence: 'medium'  // Could be private
  },
  {
    keywords: ['sj', 'mtrx', 'sj biljett'],
    account: '5800',
    confidence: 'high'
  },
  {
    keywords: ['sas', 'norwegian', 'ryanair', 'flygbiljett'],
    account: '5800',
    confidence: 'medium'  // Could be private trip
  },

  // Always Private
  {
    keywords: ['systembolaget'],
    account: '2013',
    confidence: 'high'
  },
  {
    keywords: ['apotek', 'apoteket', 'apotea'],
    account: '2013',
    confidence: 'high'
  },
  {
    keywords: ['ica', 'coop', 'willys', 'hemköp', 'lidl'],
    account: '2013',
    confidence: 'medium'  // Usually private groceries
  }
]
```

---

## Amount-Based Routing (Asset vs Expense)

```typescript
// lib/accounting/asset-routing.ts

const PRISBASBELOPP_2025 = 58800
const HALF_PBB = PRISBASBELOPP_2025 / 2  // 29,400 kr

interface AssetDecision {
  shouldCapitalize: boolean
  account: string
  depreciationYears?: number
  depreciationRate?: number
}

function routeEquipmentPurchase(
  amountExVat: number,
  mccCode: string
): AssetDecision {
  const isEquipmentMCC = ['5732', '5946', '5045'].includes(mccCode)
  
  if (!isEquipmentMCC) {
    return { shouldCapitalize: false, account: '5410' }
  }

  if (amountExVat > HALF_PBB) {
    return {
      shouldCapitalize: true,
      account: '1210',
      depreciationYears: 5,
      depreciationRate: 0.20
    }
  }

  return {
    shouldCapitalize: false,
    account: '5410'
  }
}

// Update HALF_PBB annually - Skatteverket publishes in November
```

---

## Reverse Charge VAT Handling

When purchasing services from foreign (usually EU) companies, Swedish businesses must self-report VAT.

### Detection Logic

```typescript
// lib/accounting/reverse-charge.ts

interface ReverseChargeResult {
  applies: boolean
  reason: string
  bookings: Array<{
    account: string
    debit?: number
    credit?: number
    description: string
  }>
}

const EU_DIGITAL_SERVICES_VENDORS = [
  { name: 'meta', country: 'IE', keywords: ['facebook', 'meta', 'instagram'] },
  { name: 'google', country: 'IE', keywords: ['google', 'youtube', 'adwords'] },
  { name: 'adobe', country: 'IE', keywords: ['adobe'] },
  { name: 'microsoft', country: 'IE', keywords: ['microsoft', 'office 365', 'azure'] },
  { name: 'amazon', country: 'LU', keywords: ['aws', 'amazon web services'] },
  { name: 'canva', country: 'AU', keywords: ['canva'] },  // Non-EU, different treatment
]

function handleForeignPurchase(
  amount: number,
  vendorName: string,
  vendorCountry: string,
  expenseAccount: string
): ReverseChargeResult {
  const isEU = isEUCountry(vendorCountry)
  const vatRate = 0.25
  const vatAmount = amount * vatRate

  if (isEU && vendorCountry !== 'SE') {
    // EU purchase - reverse charge applies
    return {
      applies: true,
      reason: `Omvänd skattskyldighet - inköp från ${vendorCountry}`,
      bookings: [
        { account: expenseAccount, debit: amount, description: 'Kostnad' },
        { account: '2645', debit: vatAmount, description: 'Beräknad ing. moms utl. förvärv' },
        { account: '2614', credit: vatAmount, description: 'Utg. moms utl. förvärv' },
        { account: '1930', credit: amount, description: 'Utbetalning' }
      ]
    }
  }

  if (!isEU) {
    // Non-EU purchase - no reverse charge, just expense
    return {
      applies: false,
      reason: 'Import från land utanför EU',
      bookings: [
        { account: expenseAccount, debit: amount, description: 'Kostnad' },
        { account: '1930', credit: amount, description: 'Utbetalning' }
      ]
    }
  }

  // Swedish domestic
  return {
    applies: false,
    reason: 'Inrikes inköp',
    bookings: []  // Normal VAT handling
  }
}
```

### Momsdeklaration Mapping

| Scenario | Ruta | Description |
|----------|------|-------------|
| Domestic purchase 25% VAT | 48 (utgående), deduct in 48 | Normal |
| EU service purchase (reverse charge) | 21 (purchase amount), 48 (calculated VAT) | Self-report |
| Non-EU service purchase | No VAT reporting | Just expense |

---

## Revenue Account Selection

```typescript
// lib/accounting/revenue-routing.ts

interface RevenueRouting {
  account: string
  vatRate: number
  momsRuta: number
  requiresPeriodiskSammanstallning: boolean
}

function routeRevenue(
  customerCountry: string,
  customerType: 'business' | 'consumer',
  hasValidVatNumber: boolean
): RevenueRouting {
  // Swedish customer
  if (customerCountry === 'SE') {
    return {
      account: '3001',  // Försäljning 25%
      vatRate: 25,
      momsRuta: 5,
      requiresPeriodiskSammanstallning: false
    }
  }

  // EU business with VAT number
  if (isEUCountry(customerCountry) && customerType === 'business' && hasValidVatNumber) {
    return {
      account: '3044',  // Försäljning tjänst EU
      vatRate: 0,
      momsRuta: 39,
      requiresPeriodiskSammanstallning: true  // Quarterly report required!
    }
  }

  // EU consumer (OSS rules may apply if >10k EUR/year)
  if (isEUCountry(customerCountry) && customerType === 'consumer') {
    return {
      account: '3001',  // Or OSS-specific account
      vatRate: 25,  // Swedish VAT until OSS threshold
      momsRuta: 5,
      requiresPeriodiskSammanstallning: false
    }
  }

  // Non-EU (USA, etc.) - Export
  return {
    account: '3045',  // Försäljning tjänst Export
    vatRate: 0,
    momsRuta: 40,
    requiresPeriodiskSammanstallning: false
  }
}
```

---

## Conservative Bias Principle

The system must be designed with a **conservative bias** - prefer rejecting deductions over accepting questionable ones.

### Rationale
- Burden of proof lies with taxpayer (IL 9 kap. 2 §)
- Skattetillägg (tax surcharge) is 40% of avoided tax
- Better to warn user than cause audit problems

### Implementation

```typescript
// lib/accounting/risk-assessment.ts

interface RiskAssessment {
  riskLevel: 'low' | 'medium' | 'high' | 'very_high'
  suggestedAccount: string
  requiresConfirmation: boolean
  warningMessage?: string
  legalBasis?: string
}

function assessTransactionRisk(
  mcc: string,
  amount: number,
  description: string
): RiskAssessment {
  const mapping = getMCCMapping(mcc)
  
  if (mapping.riskLevel === 'very_high') {
    return {
      riskLevel: 'very_high',
      suggestedAccount: '2013',  // Default to private (eget uttag)
      requiresConfirmation: true,
      warningMessage: mapping.autoRejectReason,
      legalBasis: 'IL 9 kap. 2 § - Privata levnadskostnader'
    }
  }

  if (mapping.riskLevel === 'high') {
    return {
      riskLevel: 'high',
      suggestedAccount: mapping.primaryAccount,
      requiresConfirmation: true,
      warningMessage: `Denna typ av utgift kräver dokumentation. ${mapping.logic}`
    }
  }

  // Low/medium risk - auto-categorize but allow override
  return {
    riskLevel: mapping.riskLevel,
    suggestedAccount: mapping.primaryAccount,
    requiresConfirmation: false
  }
}
```

---

## Private Use Split

For items with mixed business/private use:

```typescript
// lib/accounting/split-usage.ts

interface SplitTransaction {
  businessPortion: {
    account: string
    amount: number
  }
  privatePortion: {
    account: string  // Always 2013
    amount: number
  }
}

function splitMixedUse(
  totalAmount: number,
  businessPercentage: number,
  expenseAccount: string
): SplitTransaction {
  const businessAmount = totalAmount * (businessPercentage / 100)
  const privateAmount = totalAmount - businessAmount

  return {
    businessPortion: {
      account: expenseAccount,
      amount: Math.round(businessAmount * 100) / 100
    },
    privatePortion: {
      account: '2013',
      amount: Math.round(privateAmount * 100) / 100
    }
  }
}

// UI should ask: "Används denna uteslutande i företaget?"
// If no → prompt for percentage split
```

---

## Travel Allowance (Traktamente)

For business trips, the owner can claim tax-free travel allowance at Skatteverket's rates.

```typescript
// lib/accounting/traktamente.ts

// 2024 rates - update annually
const TRAKTAMENTE_RATES = {
  sweden: {
    fullDay: 260,      // Hel dag
    halfDay: 130,      // Halv dag
    night: 130         // Nattraktamente
  },
  // Foreign rates vary by country - see Skatteverket's list
  foreign: {
    USA: { fullDay: 620, reduced: 434 },
    UK: { fullDay: 550, reduced: 385 },
    Germany: { fullDay: 420, reduced: 294 },
    // ... etc
  }
}

interface TraktamenteCalculation {
  amount: number
  bookings: Array<{
    account: string
    debit?: number
    credit?: number
  }>
}

function calculateTraktamente(
  destination: 'sweden' | string,
  fullDays: number,
  halfDays: number,
  nights: number
): TraktamenteCalculation {
  const rates = destination === 'sweden' 
    ? TRAKTAMENTE_RATES.sweden 
    : TRAKTAMENTE_RATES.foreign[destination] || TRAKTAMENTE_RATES.sweden

  const amount = 
    (fullDays * rates.fullDay) +
    (halfDays * (rates.halfDay || rates.fullDay / 2)) +
    (nights * (rates.night || 0))

  return {
    amount,
    bookings: [
      { account: '5841', debit: amount },   // Traktamente, avdragsgillt
      { account: '2018', credit: amount }   // Egen insättning (skuld till ägare)
    ]
  }
}
```

---

## Non-Cash Transactions (Barter/Gifts)

Influencers receive products that must be accounted for even without bank transaction.

```typescript
// lib/accounting/non-cash.ts

interface BarterTransaction {
  productValue: number
  hasMotprestation: boolean  // Required post/exposure?
  usedInBusiness: boolean
  bookings: Array<{
    account: string
    debit?: number
    credit?: number
    description: string
  }>
}

function bookBarterTransaction(
  productValue: number,
  hasMotprestation: boolean,
  usedInBusiness: boolean
): BarterTransaction['bookings'] {
  if (!hasMotprestation && productValue < 450) {
    // Tax-free promotional gift
    return []  // No booking required
  }

  if (hasMotprestation) {
    // Taxable barter - must recognize as income
    const bookings = [
      { account: '3001', credit: productValue, description: 'Förmån/Byteshandel' },
      { account: '1510', debit: productValue, description: 'Fordran (kvittad mot produkt)' }
    ]

    if (usedInBusiness) {
      // Can also expense it
      bookings.push(
        { account: '5490', debit: productValue, description: 'Rekvisita' },
        { account: '1510', credit: productValue, description: 'Kvittning fordran' }
      )
    } else {
      // Private use - eget uttag
      bookings.push(
        { account: '2013', debit: productValue, description: 'Eget uttag (förmån)' },
        { account: '1510', credit: productValue, description: 'Kvittning fordran' }
      )
    }

    return bookings
  }

  // Gift without motprestation but valuable - still taxable
  return [
    { account: '3001', credit: productValue, description: 'Skattepliktig gåva' },
    { account: '2013', debit: productValue, description: 'Eget uttag (gåva)' }
  ]
}
```

---

## System Configuration

```typescript
// lib/accounting/config.ts

export const ACCOUNTING_CONFIG = {
  // Update annually
  prisbasbelopp: 58800,  // 2025
  halfPrisbasbelopp: 29400,
  
  // VAT rates
  vatRates: {
    standard: 25,
    reduced: 12,  // Food, hotels
    low: 6,       // Transport, books
  },

  // Depreciation defaults
  depreciation: {
    equipment: { years: 5, rate: 0.20 },
    computers: { years: 3, rate: 0.33 },
    vehicles: { years: 5, rate: 0.20 },
  },

  // Risk thresholds
  riskSettings: {
    autoRejectVeryHigh: true,
    requireConfirmationHigh: true,
    allowOverrideMedium: true,
  }
}
```

---

## Integration Points

This guide integrates with:

1. **Transaction categorization UI** (05-UI-SPECIFICATION.md) - Swipe interface uses MCC mapping
2. **Tax calculator** (06-IMPLEMENTATION-GUIDE.md) - Uses account classifications for tax estimation
3. **Invoice VAT rules** (04-API-SPECIFICATION.md) - Revenue account selection aligns with momsdeklaration
4. **Expense warnings** (06-IMPLEMENTATION-GUIDE.md) - Risk levels drive warning display

---

## Annual Maintenance

Update each January:
1. Prisbasbelopp (from Skatteverket, published November)
2. Traktamente rates (Skatteverket)
3. Any BAS account changes (BAS-kontogruppen)
4. Tax rates if changed by Riksdag
