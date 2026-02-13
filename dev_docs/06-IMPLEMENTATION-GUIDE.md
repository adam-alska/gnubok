# Implementation Guide

## Phase 1: Project Setup

### 1.1 Initialize Next.js Project

```bash
npx create-next-app@latest influencer-biz --typescript --tailwind --eslint --app --src-dir=false
cd influencer-biz
```

### 1.2 Install Dependencies

```bash
# UI
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-select
npm install class-variance-authority clsx tailwind-merge lucide-react
npm install framer-motion @use-gesture/react

# Supabase
npm install @supabase/supabase-js @supabase/ssr

# Forms & Validation
npm install react-hook-form @hookform/resolvers zod

# Charts
npm install recharts

# PDF
npm install @react-pdf/renderer

# Date handling
npm install date-fns

# Dev
npm install -D @types/node
```

### 1.3 Initialize shadcn/ui

```bash
npx shadcn@latest init
npx shadcn@latest add button card input select dialog sheet toast badge
```

### 1.4 Setup Supabase

```bash
npm install -g supabase
supabase init
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

Create `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
```

---

## Phase 2: Authentication

### 2.1 Supabase Client Setup

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

```typescript
// lib/supabase/server.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

### 2.2 Auth Middleware

```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Redirect unauthenticated users to login
  if (!user && !request.nextUrl.pathname.startsWith('/login') && !request.nextUrl.pathname.startsWith('/auth')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

### 2.3 Login Page

```typescript
// app/(auth)/login/page.tsx
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const supabase = createClient()

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Kolla din inbox för inloggningslänk!')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow">
        <h1 className="text-2xl font-bold mb-6">Logga in</h1>
        
        <form onSubmit={handleMagicLink} className="space-y-4">
          <Input
            type="email"
            placeholder="din@email.se"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Skickar...' : 'Skicka inloggningslänk'}
          </Button>
        </form>

        {message && (
          <p className="mt-4 text-sm text-center text-gray-600">{message}</p>
        )}
      </div>
    </div>
  )
}
```

---

## Phase 3: Core Types

```typescript
// types/index.ts

export type TransactionCategory = 
  | 'uncategorized'
  | 'business_income'
  | 'business_expense'
  | 'private'
  | 'tax_payment'
  | 'vat_payment'
  | 'transfer'

export type ExpenseType =
  | 'equipment'
  | 'software'
  | 'travel'
  | 'meals'
  | 'office'
  | 'marketing'
  | 'professional_services'
  | 'other'

export type CustomerType =
  | 'individual'
  | 'swedish_business'
  | 'eu_business'
  | 'non_eu_business'

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'paid'
  | 'overdue'
  | 'cancelled'

export type VatTreatment =
  | 'standard'
  | 'reverse_charge'
  | 'export'
  | 'exempt'

export interface Profile {
  id: string
  email: string
  full_name: string | null
}

export interface CompanySettings {
  id: string
  user_id: string
  company_name: string
  org_number: string | null
  vat_number: string | null
  f_skatt_registered: boolean
  vat_registered: boolean
  address_line1: string | null
  city: string | null
  postal_code: string | null
  municipal_tax_rate: number
  payment_terms_days: number
  next_invoice_number: number
  bank_name: string | null
  clearing_number: string | null
  account_number: string | null
}

export interface Transaction {
  id: string
  user_id: string
  booking_date: string
  amount: number
  currency: string
  description: string | null
  counterparty_name: string | null
  category: TransactionCategory
  expense_type: ExpenseType | null
  notes: string | null
}

export interface Customer {
  id: string
  user_id: string
  customer_type: CustomerType
  name: string
  email: string | null
  org_number: string | null
  vat_number: string | null
  vat_number_validated: boolean
  address_line1: string | null
  city: string | null
  postal_code: string | null
  country: string
}

export interface Invoice {
  id: string
  user_id: string
  customer_id: string
  invoice_number: string
  invoice_date: string
  due_date: string
  subtotal: number
  vat_amount: number
  total: number
  currency: string
  vat_treatment: VatTreatment
  vat_rate: number
  reverse_charge_text: string | null
  status: InvoiceStatus
  customer?: Customer
  items?: InvoiceItem[]
}

export interface InvoiceItem {
  id: string
  invoice_id: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  line_total: number
}

export interface TaxBreakdown {
  grossIncome: number
  deductibleExpenses: number
  netIncome: number
  egenavgifter: number
  incomeTax: number
  vatCollected: number
  vatDeductible: number
  vatPayable: number
  totalLocked: number
  disponibelt: number
}
```

---

## Phase 4: Tax Calculator

```typescript
// lib/tax/calculator.ts

import type { TaxBreakdown, CompanySettings, Transaction } from '@/types'

// Current rates (should come from tax_rates table)
const RATES = {
  egenavgifter: 0.2897,           // 28.97% for enskild firma
  arbetsgivaravgifter: 0.3142,    // 31.42% for AB
  bolagsskatt: 0.206,             // 20.6% corporate tax
  defaultMunicipalTax: 0.32       // ~32% average
}

const MAX_PERIODISERINGSFOND_RATE = 0.30

export function calculateTaxBreakdown(
  transactions: Transaction[],
  settings: CompanySettings,
  salaryPayments?: SalaryPayment[],  // For AB
  options?: { usePeriodiseringsfond?: boolean }
): TaxBreakdown {
  const grossIncome = transactions
    .filter(t => t.category === 'business_income' && t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0)

  const deductibleExpenses = transactions
    .filter(t => t.category === 'business_expense' && t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  // Branch based on entity type
  if (settings.entity_type === 'aktiebolag') {
    return calculateABTax(grossIncome, deductibleExpenses, salaryPayments || [], settings, options)
  } else {
    return calculateEnskildFirmaTax(grossIncome, deductibleExpenses, settings, options)
  }
}

function calculateEnskildFirmaTax(
  grossIncome: number,
  deductibleExpenses: number,
  settings: CompanySettings,
  options?: { usePeriodiseringsfond?: boolean }
): TaxBreakdown {
  let netIncome = grossIncome - deductibleExpenses

  // Optional periodiseringsfond
  let periodiseringsfondAvsattning = 0
  if (options?.usePeriodiseringsfond && netIncome > 0) {
    periodiseringsfondAvsattning = netIncome * MAX_PERIODISERINGSFOND_RATE
    netIncome -= periodiseringsfondAvsattning
  }

  // Egenavgifter on net income
  const egenavgifter = netIncome > 0 ? netIncome * RATES.egenavgifter : 0

  // Taxable income after egenavgifter deduction
  const taxableIncome = netIncome - egenavgifter

  // Income tax
  const taxRate = (settings.municipal_tax_rate || 32) / 100
  const incomeTax = taxableIncome > 0 ? taxableIncome * taxRate : 0

  // VAT (simplified)
  const { vatCollected, vatDeductible, vatPayable } = calculateVAT(grossIncome, deductibleExpenses, settings)

  const totalLocked = egenavgifter + incomeTax + Math.max(0, vatPayable)
  const disponibelt = Math.max(0, grossIncome - deductibleExpenses - totalLocked)

  return {
    entityType: 'enskild_firma',
    grossIncome,
    deductibleExpenses,
    netIncome: netIncome + periodiseringsfondAvsattning,
    periodiseringsfondAvsattning,
    egenavgifter: Math.round(egenavgifter),
    incomeTax: Math.round(incomeTax),
    vatCollected: Math.round(vatCollected),
    vatDeductible: Math.round(vatDeductible),
    vatPayable: Math.round(vatPayable),
    totalLocked: Math.round(totalLocked),
    disponibelt: Math.round(disponibelt),
  }
}

function calculateABTax(
  grossIncome: number,
  deductibleExpenses: number,
  salaryPayments: SalaryPayment[],
  settings: CompanySettings,
  options?: { usePeriodiseringsfond?: boolean }
): TaxBreakdown {
  // Sum salary costs (these are deductible for the company)
  const totalSalaryCost = salaryPayments.reduce((sum, s) => sum + s.total_cost, 0)
  const totalWithheldTax = salaryPayments.reduce((sum, s) => sum + s.withheld_tax, 0)
  const totalArbetsgivaravgifter = salaryPayments.reduce((sum, s) => sum + s.employer_contributions, 0)

  // Company profit = income - expenses - salary costs
  let companyProfit = grossIncome - deductibleExpenses - totalSalaryCost

  // Optional periodiseringsfond for AB
  let periodiseringsfondAvsattning = 0
  if (options?.usePeriodiseringsfond && companyProfit > 0) {
    // AB can defer 25% (not 30%) - different rule
    periodiseringsfondAvsattning = companyProfit * 0.25
    companyProfit -= periodiseringsfondAvsattning
  }

  // Bolagsskatt on remaining profit
  const bolagsskatt = companyProfit > 0 ? companyProfit * RATES.bolagsskatt : 0

  // VAT
  const { vatCollected, vatDeductible, vatPayable } = calculateVAT(grossIncome, deductibleExpenses, settings)

  // Total locked = bolagsskatt + withheld employee tax + arbetsgivaravgifter + VAT
  const totalLocked = bolagsskatt + totalWithheldTax + totalArbetsgivaravgifter + Math.max(0, vatPayable)

  const disponibelt = Math.max(0, grossIncome - deductibleExpenses - totalLocked)

  return {
    entityType: 'aktiebolag',
    grossIncome,
    deductibleExpenses,
    netIncome: companyProfit + periodiseringsfondAvsattning,
    periodiseringsfondAvsattning,
    // AB-specific fields
    bolagsskatt: Math.round(bolagsskatt),
    salaryCosts: {
      totalGross: salaryPayments.reduce((sum, s) => sum + s.gross_salary, 0),
      totalArbetsgivaravgifter: Math.round(totalArbetsgivaravgifter),
      totalWithheldTax: Math.round(totalWithheldTax),
      totalCost: Math.round(totalSalaryCost)
    },
    vatCollected: Math.round(vatCollected),
    vatDeductible: Math.round(vatDeductible),
    vatPayable: Math.round(vatPayable),
    totalLocked: Math.round(totalLocked),
    disponibelt: Math.round(disponibelt),
  }
}

function calculateVAT(grossIncome: number, expenses: number, settings: CompanySettings) {
  if (!settings.vat_registered) {
    return { vatCollected: 0, vatDeductible: 0, vatPayable: 0 }
  }
  
  // Simplified - real implementation tracks per invoice
  const vatCollected = grossIncome * 0.25
  const vatDeductible = expenses * 0.25
  const vatPayable = vatCollected - vatDeductible
  
  return { vatCollected, vatDeductible, vatPayable }
}
```

---

## Phase 4b: Expense Category Warnings

Swedish tax law is strict about lifestyle expense deductions. The system must warn users.

```typescript
// lib/tax/expense-warnings.ts

interface ExpenseWarning {
  category: string
  severity: 'info' | 'warning' | 'danger'
  message: string
  legalBasis?: string
}

const EXPENSE_WARNINGS: Record<string, ExpenseWarning> = {
  clothing: {
    category: 'Kläder',
    severity: 'danger',
    message: 'Kläder är normalt endast avdragsgilla om de är skyddskläder eller särskilda scenkläder som inte lämpar sig för privat bruk. Kammarrätten har i flera domar nekat avdrag för kläder köpta för videoinspelningar.',
    legalBasis: 'Kammarrätten, praxis om privata levnadskostnader'
  },
  cosmetics: {
    category: 'Smink & Skönhet',
    severity: 'danger', 
    message: 'Smink och skönhetsbehandlingar räknas som privata levnadskostnader även om de används i videoproduktion. Avdrag nekas regelmässigt.',
    legalBasis: 'Skatteverkets ställningstagande'
  },
  gym: {
    category: 'Gym & Träning',
    severity: 'danger',
    message: 'Gymkort och träningskostnader är privata levnadskostnader och ej avdragsgilla, även för fitness-influencers.',
    legalBasis: 'IL 9 kap. 2 §'
  },
  travel_mixed: {
    category: 'Resa (Blandad)',
    severity: 'warning',
    message: 'Resor med inslag av privat karaktär kräver strikt fördelning. Endast den del som är direkt kopplad till intäktsgenererande arbete är avdragsgill.',
    legalBasis: 'Skatteverkets vägledning'
  },
  home_office: {
    category: 'Hemmakontor',
    severity: 'info',
    message: 'Avdrag för arbetsrum i bostaden medges endast om rummet är avskilt och uteslutande används för näringsverksamhet. Schablonavdrag: 2000 kr/år eller faktiska merkostnader.',
    legalBasis: 'Skatteverkets allmänna råd'
  }
}

export function getExpenseWarning(expenseType: string): ExpenseWarning | null {
  return EXPENSE_WARNINGS[expenseType] || null
}
```

---

## Phase 4c: Schablonavdrag System

**Optimal approach:** Default to schablonavdrag (simpler, safer), but allow user to switch to faktiska kostnader if they want to track actual expenses.

```typescript
// lib/tax/schablonavdrag.ts

interface Schablonavdrag {
  type: string
  amount: number
  unit: 'year' | 'km' | 'day' | 'percent'
  description: string
  requiresDocumentation: boolean
}

const SCHABLONAVDRAG: Record<string, Schablonavdrag> = {
  home_office: {
    type: 'hemmakontor',
    amount: 2000,
    unit: 'year',
    description: 'Fast schablonavdrag för arbetsrum i bostad',
    requiresDocumentation: false  // No receipts needed for schablon
  },
  car_business: {
    type: 'bilkostnader',
    amount: 18.50,
    unit: 'km',
    description: 'Schablon för tjänstekörning med egen bil',
    requiresDocumentation: true  // Need mileage log
  },
  car_parking: {
    type: 'parkering',
    amount: 0,  // Actual cost
    unit: 'day',
    description: 'Faktisk kostnad (inget schablon)',
    requiresDocumentation: true
  }
}

interface DeductionChoice {
  useSchablon: boolean
  schablonAmount?: number
  actualAmount?: number
  finalDeduction: number
}

export function calculateDeduction(
  type: string,
  quantity: number,  // km, days, etc.
  actualCost?: number
): DeductionChoice {
  const schablon = SCHABLONAVDRAG[type]
  
  if (!schablon) {
    // No schablon exists, must use actual
    return {
      useSchablon: false,
      actualAmount: actualCost || 0,
      finalDeduction: actualCost || 0
    }
  }

  const schablonTotal = schablon.amount * quantity

  // If user provided actual cost, compare and suggest better option
  if (actualCost !== undefined) {
    const useSchablon = schablonTotal >= actualCost
    return {
      useSchablon,
      schablonAmount: schablonTotal,
      actualAmount: actualCost,
      finalDeduction: Math.max(schablonTotal, actualCost)
    }
  }

  // Default to schablon
  return {
    useSchablon: true,
    schablonAmount: schablonTotal,
    finalDeduction: schablonTotal
  }
}
```

**UI Recommendation:** Show schablon as default with toggle "Använd faktiska kostnader istället" that reveals actual amount input. Display comparison when both are entered.

---

## Phase 4d: F-skatt Warning System

**Optimal approach:** Compare user's preliminary tax (debiterad preliminärskatt) against calculated tax liability. Warn if underpaying (risk of restskatt) or significantly overpaying (unnecessary cash flow impact).

```typescript
// lib/tax/fskatt-warning.ts

interface FskattComparison {
  monthlyPreliminaryTax: number
  yearlyPreliminaryTax: number
  estimatedYearlyTax: number
  difference: number
  status: 'ok' | 'underpaying' | 'overpaying'
  severity: 'info' | 'warning' | 'danger'
  message: string
}

const WARNING_THRESHOLD_PERCENT = 0.15  // 15% difference triggers warning
const DANGER_THRESHOLD_PERCENT = 0.30   // 30% difference is serious

export function compareFskatt(
  monthlyPreliminaryTax: number,
  estimatedYearlyTax: number,
  monthsRemaining: number = 12
): FskattComparison {
  const yearlyPreliminaryTax = monthlyPreliminaryTax * 12
  const difference = estimatedYearlyTax - yearlyPreliminaryTax
  const percentDiff = Math.abs(difference) / estimatedYearlyTax

  if (difference > 0 && percentDiff > DANGER_THRESHOLD_PERCENT) {
    return {
      monthlyPreliminaryTax,
      yearlyPreliminaryTax,
      estimatedYearlyTax,
      difference,
      status: 'underpaying',
      severity: 'danger',
      message: `Du riskerar restskatt på ca ${formatSEK(difference)}. Överväg att höja din F-skatt eller sätta undan ${formatSEK(difference / monthsRemaining)} extra per månad.`
    }
  }

  if (difference > 0 && percentDiff > WARNING_THRESHOLD_PERCENT) {
    return {
      monthlyPreliminaryTax,
      yearlyPreliminaryTax,
      estimatedYearlyTax,
      difference,
      status: 'underpaying',
      severity: 'warning',
      message: `Din beräknade skatt är ${formatSEK(difference)} högre än din preliminärskatt. Håll koll på detta.`
    }
  }

  if (difference < 0 && percentDiff > WARNING_THRESHOLD_PERCENT) {
    return {
      monthlyPreliminaryTax,
      yearlyPreliminaryTax,
      estimatedYearlyTax,
      difference,
      status: 'overpaying',
      severity: 'info',
      message: `Du betalar troligen för mycket i preliminärskatt (ca ${formatSEK(Math.abs(difference))} för mycket). Du kan sänka din F-skatt hos Skatteverket.`
    }
  }

  return {
    monthlyPreliminaryTax,
    yearlyPreliminaryTax,
    estimatedYearlyTax,
    difference,
    status: 'ok',
    severity: 'info',
    message: 'Din preliminärskatt verkar stämma bra med beräknad skatt.'
  }
}
```

**UI Placement:** Show F-skatt comparison in the tax breakdown panel on dashboard. Use color-coded alert (green/yellow/red) based on severity.

---

## Phase 5: VAT Rules Engine

```typescript
// lib/invoice/vat-rules.ts

import type { Customer, CompanySettings, VatTreatment } from '@/types'

export interface VatDecision {
  rate: number
  treatment: VatTreatment
  reverseCharge: boolean
  invoiceText: string | null
  momsRuta: number | null  // Which ruta in momsdeklaration
  requiresPeriodiskSammanstallning: boolean  // Quarterly EU report
}

export function determineVatTreatment(
  customer: Customer,
  settings: CompanySettings
): VatDecision {
  // User not VAT registered - no VAT on any invoice
  if (!settings.vat_registered) {
    return {
      rate: 0,
      treatment: 'exempt',
      reverseCharge: false,
      invoiceText: 'Säljaren är inte momsregistrerad',
      momsRuta: null,
      requiresPeriodiskSammanstallning: false
    }
  }

  switch (customer.customer_type) {
    case 'individual':
    case 'swedish_business':
      return {
        rate: 25,
        treatment: 'standard',
        reverseCharge: false,
        invoiceText: null,
        momsRuta: 5,  // Ruta 05: Momspliktig försäljning
        requiresPeriodiskSammanstallning: false
      }

    case 'eu_business':
      if (customer.vat_number_validated) {
        return {
          rate: 0,
          treatment: 'reverse_charge',
          reverseCharge: true,
          invoiceText: 'Omvänd skattskyldighet / Reverse charge - Article 196 Council Directive 2006/112/EC',
          momsRuta: 39,  // Ruta 39: Tjänsteförsäljning EU
          requiresPeriodiskSammanstallning: true  // Must report quarterly
        }
      }
      // EU business without validated VAT number = charge Swedish VAT
      // VIES validation is REQUIRED before applying reverse charge
      return {
        rate: 25,
        treatment: 'standard',
        reverseCharge: false,
        invoiceText: 'VAT-nummer ej validerat - svensk moms tillämpas',
        momsRuta: 5,
        requiresPeriodiskSammanstallning: false
      }

    case 'non_eu_business':
      return {
        rate: 0,
        treatment: 'export',
        reverseCharge: false,
        invoiceText: 'Export av tjänst - moms utgår ej',
        momsRuta: 40,  // Ruta 40: Export
        requiresPeriodiskSammanstallning: false
      }

    default:
      return {
        rate: 25,
        treatment: 'standard',
        reverseCharge: false,
        invoiceText: null,
        momsRuta: 5,
        requiresPeriodiskSammanstallning: false
      }
  }
}

// VIES validation wrapper
export async function validateVatNumber(vatNumber: string): Promise<{
  valid: boolean
  name?: string
  address?: string
  error?: string
}> {
  // Strip country code if included
  const countryCode = vatNumber.substring(0, 2).toUpperCase()
  const number = vatNumber.substring(2)
  
  // Call VIES SOAP service or use a REST wrapper
  // Example: https://ec.europa.eu/taxation_customs/vies/
  try {
    const response = await fetch(`/api/vat/validate`, {
      method: 'POST',
      body: JSON.stringify({ vat_number: vatNumber })
    })
    return response.json()
  } catch (error) {
    return { valid: false, error: 'VIES service unavailable' }
  }
}
```

### Momsdeklaration Ruta Reference

| Ruta | Swedish Name | When Used |
|------|--------------|-----------|
| 05 | Momspliktig försäljning | Swedish domestic sales with VAT |
| 39 | Varor och tjänster till EU | EU B2B with reverse charge |
| 40 | Omsättning vid export | Non-EU (export) sales |
| 21 | Inköp av tjänster från EU | Service purchases from EU (fiktiv moms input) |
| 48 | Utgående moms på inköp | Output VAT on foreign purchases |

### Fiktiv Moms for Foreign Purchases

```typescript
// lib/tax/fiktiv-moms.ts

interface FiktivMomsResult {
  purchaseAmount: number
  vatAmount: number
  bookings: Array<{
    account: string
    debit?: number
    credit?: number
  }>
}

export function calculateFiktivMoms(
  amount: number,
  supplierCountry: string,
  vatRate: number = 25
): FiktivMomsResult {
  const vatAmount = amount * (vatRate / 100)
  
  return {
    purchaseAmount: amount,
    vatAmount,
    bookings: [
      // Debit: Ingående moms utländskt förvärv
      { account: '2645', debit: vatAmount },
      // Credit: Utgående moms utländskt förvärv  
      { account: '2614', credit: vatAmount }
    ]
  }
}
```

---

## Phase 6: Key Components

### 6.1 Balance Card

```typescript
// components/dashboard/BalanceCard.tsx
'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { TaxBreakdown } from '@/types'

interface BalanceCardProps {
  breakdown: TaxBreakdown
  totalBalance: number
}

export function BalanceCard({ breakdown, totalBalance }: BalanceCardProps) {
  const [expanded, setExpanded] = useState(false)

  const lockedPercentage = totalBalance > 0 
    ? (breakdown.totalLocked / totalBalance) * 100 
    : 0

  return (
    <Card className="bg-gradient-to-br from-primary-50 to-white">
      <CardContent className="pt-6">
        <p className="text-sm text-gray-500 uppercase tracking-wide">
          Disponibelt att spendera
        </p>
        
        <p className="text-4xl font-bold text-gray-900 mt-2">
          {formatSEK(breakdown.disponibelt)}
        </p>

        <div className="mt-6">
          <p className="text-sm text-gray-500 mb-2">
            Total: {formatSEK(totalBalance)}
          </p>
          
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary-500 transition-all duration-500"
              style={{ width: `${100 - lockedPercentage}%` }}
            />
          </div>
          
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Disponibelt {(100 - lockedPercentage).toFixed(0)}%</span>
            <span>Låst för skatt {lockedPercentage.toFixed(0)}%</span>
          </div>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-sm text-primary-600 mt-4 hover:text-primary-700"
        >
          {expanded ? 'Dölj' : 'Visa'} skatteberäkning
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {expanded && (
          <div className="mt-4 pt-4 border-t space-y-2 text-sm">
            <Row label="Intäkter" value={breakdown.grossIncome} />
            <Row label="- Avdragsgilla kostnader" value={-breakdown.deductibleExpenses} />
            <Row label="= Resultat" value={breakdown.netIncome} bold />
            <div className="h-2" />
            <Row label="Egenavgifter (28,97%)" value={-breakdown.egenavgifter} />
            <Row label="Inkomstskatt" value={-breakdown.incomeTax} />
            {breakdown.vatPayable > 0 && (
              <Row label="Moms att betala" value={-breakdown.vatPayable} />
            )}
            <Row label="= Låst för skatt" value={breakdown.totalLocked} bold />
            
            <p className="text-xs text-gray-400 mt-4">
              ⓘ Detta är en uppskattning. Faktisk skatt kan variera.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold' : ''}`}>
      <span>{label}</span>
      <span className={value < 0 ? 'text-red-600' : ''}>
        {formatSEK(value)}
      </span>
    </div>
  )
}

function formatSEK(amount: number): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
```

### 6.2 Swipe Card

```typescript
// components/transactions/SwipeCard.tsx
'use client'

import { useState } from 'react'
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion'
import { Card } from '@/components/ui/card'
import type { Transaction, TransactionCategory } from '@/types'

interface SwipeCardProps {
  transaction: Transaction
  onCategorize: (id: string, category: TransactionCategory) => void
  onSkip: () => void
}

export function SwipeCard({ transaction, onCategorize, onSkip }: SwipeCardProps) {
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-200, 200], [-15, 15])
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0.5, 1, 1, 1, 0.5])
  
  const businessOpacity = useTransform(x, [0, 100], [0, 1])
  const privateOpacity = useTransform(x, [-100, 0], [1, 0])

  const handleDragEnd = (_: any, info: PanInfo) => {
    const threshold = 100

    if (info.offset.x > threshold) {
      onCategorize(transaction.id, 'business_expense')
    } else if (info.offset.x < -threshold) {
      onCategorize(transaction.id, 'private')
    }
  }

  return (
    <div className="relative">
      {/* Background indicators */}
      <motion.div 
        className="absolute inset-0 bg-green-100 rounded-lg flex items-center justify-end pr-8"
        style={{ opacity: businessOpacity }}
      >
        <span className="text-green-700 font-medium">Företag →</span>
      </motion.div>
      
      <motion.div 
        className="absolute inset-0 bg-gray-100 rounded-lg flex items-center pl-8"
        style={{ opacity: privateOpacity }}
      >
        <span className="text-gray-700 font-medium">← Privat</span>
      </motion.div>

      {/* Swipeable card */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        onDragEnd={handleDragEnd}
        style={{ x, rotate, opacity }}
        className="cursor-grab active:cursor-grabbing"
      >
        <Card className="p-6 bg-white shadow-lg">
          <p className="text-xl font-semibold text-gray-900">
            {transaction.counterparty_name || transaction.description}
          </p>
          
          <p className={`text-2xl font-bold mt-2 ${
            transaction.amount < 0 ? 'text-red-600' : 'text-green-600'
          }`}>
            {formatSEK(transaction.amount)}
          </p>
          
          <p className="text-sm text-gray-500 mt-2">
            {new Date(transaction.booking_date).toLocaleDateString('sv-SE')}
          </p>
        </Card>
      </motion.div>

      <button
        onClick={onSkip}
        className="mt-4 text-sm text-gray-500 hover:text-gray-700"
      >
        Osäker? Hoppa över
      </button>
    </div>
  )
}

function formatSEK(amount: number): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
  }).format(amount)
}
```

---

## Phase 7: Deployment

### 7.1 Vercel Setup

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/banking/sync",
      "schedule": "0 6 * * *"
    }
  ]
}
```

### 7.2 Environment Variables in Vercel

Set via Vercel dashboard or CLI:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- Banking provider credentials

### 7.3 Deploy Commands

```bash
# Push database migrations
supabase db push

# Deploy to Vercel
vercel --prod
```

---

## MVP Launch Checklist

- [ ] Auth flow working (magic link)
- [ ] Profile + company settings CRUD
- [ ] Manual transaction entry (before bank integration)
- [ ] Transaction categorization (list view first, then swipe)
- [ ] Tax calculation display
- [ ] Customer CRUD
- [ ] Invoice creation with VAT logic
- [ ] PDF generation
- [ ] Invoice list with status
- [ ] Basic dashboard with balance card
- [ ] Mobile responsive
- [ ] Error handling + loading states
- [ ] Legal disclaimer on tax estimates
