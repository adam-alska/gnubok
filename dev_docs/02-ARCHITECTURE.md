# Technical Architecture Document

## Stack Overview

```
Frontend:     Next.js (App Router) + React + TypeScript
Styling:      Tailwind CSS + shadcn/ui
Backend:      Next.js API Routes + Supabase Edge Functions
Database:     Supabase (PostgreSQL)
Auth:         Supabase Auth (magic link + Google OAuth)
Storage:      Supabase Storage (invoice PDFs)
Banking:      Enable Banking (PSD2 AISP)
PDF Gen:      @react-pdf/renderer or Puppeteer
Hosting:      Vercel
Currency:     Riksbanken API for exchange rates
```

## Project Structure

```
/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── callback/page.tsx
│   ├── (onboarding)/
│   │   └── onboarding/
│   │       ├── page.tsx             # Wizard container
│   │       ├── step-1/page.tsx      # Entity type
│   │       ├── step-2/page.tsx      # Company details
│   │       ├── step-3/page.tsx      # Tax registration
│   │       ├── step-4/page.tsx      # Preliminary tax
│   │       ├── step-5/page.tsx      # Bank details for invoices
│   │       └── step-6/page.tsx      # Connect bank (Enable Banking)
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx                 # Main dashboard
│   │   ├── transactions/
│   │   │   └── page.tsx             # Swipe categorization
│   │   ├── invoices/
│   │   │   ├── page.tsx             # Invoice list
│   │   │   ├── new/page.tsx         # Create invoice
│   │   │   ├── [id]/page.tsx        # Invoice detail
│   │   │   └── [id]/credit/page.tsx # Create credit note
│   │   ├── customers/
│   │   │   └── page.tsx             # Customer management
│   │   └── settings/
│   │       └── page.tsx             # Company profile
│   └── api/
│       ├── banking/
│       │   ├── connect/route.ts     # Initiate Enable Banking connection
│       │   ├── callback/route.ts    # PSD2 callback
│       │   └── sync/route.ts        # Fetch transactions
│       ├── invoices/
│       │   ├── route.ts             # CRUD
│       │   ├── [id]/pdf/route.ts    # Generate PDF
│       │   └── [id]/credit/route.ts # Create credit note
│       ├── currency/
│       │   └── rates/route.ts       # Riksbanken exchange rates
│       └── webhooks/
│           └── banking/route.ts     # Transaction webhooks
├── components/
│   ├── ui/                          # shadcn components
│   ├── onboarding/
│   │   ├── WizardProgress.tsx
│   │   ├── EntityTypeSelector.tsx
│   │   └── BankConnectButton.tsx
│   ├── dashboard/
│   │   ├── BalanceCard.tsx
│   │   ├── TaxBreakdown.tsx
│   │   ├── FskattWarning.tsx
│   │   └── RevenueChart.tsx
│   ├── transactions/
│   │   ├── SwipeCard.tsx
│   │   └── TransactionList.tsx
│   └── invoices/
│       ├── InvoiceForm.tsx
│       ├── InvoicePreview.tsx
│       ├── CurrencySelector.tsx
│       └── CustomerSelect.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts                # Browser client
│   │   ├── server.ts                # Server client
│   │   └── admin.ts                 # Service role client
│   ├── banking/
│   │   └── enable-banking.ts        # Enable Banking API wrapper
│   ├── currency/
│   │   └── riksbanken.ts            # Exchange rate fetching
│   ├── tax/
│   │   ├── calculator.ts            # Swedish tax calculations
│   │   ├── expense-warnings.ts      # Non-deductible expense alerts
│   │   ├── schablonavdrag.ts        # Standard deductions
│   │   └── fskatt-warning.ts        # Preliminary tax comparison
│   ├── invoice/
│   │   ├── vat-rules.ts             # VAT logic
│   │   └── pdf-generator.ts
│   └── utils/
│       └── currency.ts
├── types/
│   └── index.ts                     # TypeScript interfaces
└── supabase/
    ├── migrations/                  # Database migrations
    └── seed.sql                     # Test data
```

## Authentication Flow

1. User lands on `/login`
2. Enters email → Supabase sends magic link
3. User clicks link → redirected to `/callback`
4. Callback exchanges code for session
5. **Onboarding check:** Query `company_settings` for user
   - If no settings exist → redirect to `/onboarding`
   - If settings exist but `onboarding_complete = false` → redirect to `/onboarding`
   - If settings complete → redirect to `/` (dashboard)

Alternative: Google OAuth for faster onboarding (still requires completing wizard).

## Onboarding Flow

```
1. User completes auth
2. Middleware checks company_settings.onboarding_complete
3. If incomplete → force redirect to /onboarding
4. Wizard steps (cannot skip):
   a. Entity type selection
   b. Company details (name, org.nr, address)
   c. Tax registration (F-skatt, VAT, momsperiod)
   d. Preliminary tax amount (optional but encouraged)
   e. Bank details for invoices
   f. Connect bank via Enable Banking (required)
5. On completion → set onboarding_complete = true
6. Redirect to dashboard
```

**Middleware Logic:**
```typescript
// middleware.ts - simplified
const publicRoutes = ['/login', '/auth/callback']
const onboardingRoutes = ['/onboarding']

if (!user) {
  // Not logged in → login page
  return redirect('/login')
}

const settings = await getCompanySettings(user.id)

if (!settings?.onboarding_complete) {
  // Onboarding incomplete → force wizard
  if (!onboardingRoutes.some(r => path.startsWith(r))) {
    return redirect('/onboarding')
  }
}

// Onboarding complete → allow access
```

## Bank Connection Flow

### PSD2 Provider: Enable Banking

Using Enable Banking as the AISP provider.

**Why Enable Banking:**
- Good coverage of Swedish banks (Nordea, SEB, Handelsbanken, Swedbank, etc.)
- Reasonable pricing for startups
- TSP model: they hold the license, you process data
- REST API with good documentation

**Consent Lifecycle:**
- PSD2 RTS allows 90-180 day consent periods (bank dependent)
- System must track consent expiry per bank connection
- Proactive notification: "Din bankkoppling till Nordea löper ut om 7 dagar"

**Multiple Accounts:**
- Users can connect multiple bank accounts (business + savings)
- Each connection tracked separately with own consent expiry
- Dashboard aggregates across all connected accounts

```
1. User clicks "Koppla bank"
2. Frontend calls POST /api/banking/connect
3. Backend creates Enable Banking session, returns redirect URL
4. User selects bank, authenticates with BankID (SCA requirement)
5. Enable Banking redirects to /api/banking/callback
6. Backend stores connection metadata (consent expiry, account info)
7. Initial transaction fetch (90 days history typical)
8. User redirected to /transactions
9. Webhook receives new transactions in real-time
10. At consent expiry - 7 days: prompt re-consent flow
```

### Non-Custodial Design (Critical)

The app must NEVER hold user funds. This avoids:
- Lagen om redovisningsmedel (1944:181)
- Klientmedelskonto requirements
- Full betalningsinstitut licensing

For future "tax savings" feature:
- Use PISP to instruct user's bank to transfer to user's OWN savings account
- App orchestrates, never touches money
- User maintains full control and ownership

## Currency Conversion

### Riksbanken Integration

For multi-currency invoicing, convert foreign amounts to SEK for bokföring.

```typescript
// lib/currency/riksbanken.ts

interface ExchangeRate {
  currency: string
  rate: number
  date: string
}

const RIKSBANKEN_API = 'https://api.riksbank.se/swea/v1/CrossRates'

export async function getExchangeRate(
  currency: 'EUR' | 'USD' | 'GBP',
  date: string // YYYY-MM-DD
): Promise<number> {
  // Riksbanken publishes daily rates
  // Use booking date for invoice conversion
  const response = await fetch(
    `${RIKSBANKEN_API}/${currency}/SEK/${date}`
  )
  const data = await response.json()
  return data.value
}

// Invoice creation: store both original and SEK amounts
interface InvoiceAmounts {
  originalCurrency: string
  originalTotal: number
  exchangeRate: number
  exchangeRateDate: string
  sekTotal: number  // This is what goes in bokföring
}
```

**Bokföringslagen requirement:** Foreign currency transactions must be converted to SEK. The exchange rate on the invoice date (fakturadatum) is typically used.

## Tax Calculation Logic

Swedish sole proprietor (enskild näringsidkare) tax components:

```typescript
interface TaxBreakdown {
  grossIncome: number;          // Total invoiced + received
  deductibleExpenses: number;   // Categorized business expenses
  netIncome: number;            // grossIncome - deductibleExpenses
  
  // Egenavgifter (self-employment contributions) ~28.97%
  egenavgifter: number;
  
  // Preliminary income tax (kommunalskatt ~32% avg)
  incomeTax: number;
  
  // VAT collected (if registered)
  vatCollected: number;
  vatDeductible: number;
  vatPayable: number;
  
  // Total locked
  totalLocked: number;
  
  // Available to spend
  disponibelt: number;
}
```

**Important**: These are estimates. Display clear disclaimer.

## VAT Rules Engine

```typescript
type VatScenario = 
  | 'swedish_customer'           // 25% VAT
  | 'eu_business_valid_vat'      // 0% + reverse charge text
  | 'eu_consumer'                // 25% VAT (or destination country rate for digital services)
  | 'non_eu'                     // 0% VAT, export

interface VatDecision {
  rate: number;
  reverseCharge: boolean;
  invoiceText: string | null;    // Legal text to include
}
```

Validation: EU VAT numbers validated via VIES API.

## Security Considerations

- Row Level Security (RLS) on all tables
- User can only access own data
- Banking tokens encrypted at rest (Supabase Vault or env vars)
- Invoice PDFs in private bucket, signed URLs for access
- No PII in logs
- Rate limiting on API routes

## Environment Variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Banking (Tink example)
TINK_CLIENT_ID=
TINK_CLIENT_SECRET=
TINK_REDIRECT_URI=

# App
NEXT_PUBLIC_APP_URL=https://app.yourdomain.se

# PDF
PDF_STORAGE_BUCKET=invoices
```

## Deployment

Vercel configuration:

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

Database migrations run via Supabase CLI or dashboard.
