# API Specification

## Authentication

All API routes require authentication via Supabase session cookie.

```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )
}

// Usage in route
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // ... route logic
}
```

---

## Endpoints

### Company Settings

#### GET /api/settings

Returns current user's company settings.

**Response 200:**
```json
{
  "id": "uuid",
  "company_name": "Anna Andersson Content AB",
  "org_number": "123456-7890",
  "vat_number": "SE1234567890",
  "vat_registered": true,
  "address_line1": "Storgatan 1",
  "city": "Stockholm",
  "postal_code": "11122",
  "payment_terms_days": 30,
  "next_invoice_number": 15
}
```

#### PUT /api/settings

Updates company settings.

**Request:**
```json
{
  "company_name": "Anna Andersson Content AB",
  "municipal_tax_rate": 31.5,
  "payment_terms_days": 14
}
```

---

### Transactions

#### GET /api/transactions

List transactions with optional filters.

**Query params:**
- `category`: filter by category
- `from`: start date (YYYY-MM-DD)
- `to`: end date
- `uncategorized`: boolean, only uncategorized
- `limit`: default 50
- `offset`: pagination

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "booking_date": "2024-01-15",
      "amount": -1500.00,
      "currency": "SEK",
      "description": "ADOBE SYSTEMS",
      "counterparty_name": "Adobe",
      "category": "uncategorized",
      "expense_type": null
    }
  ],
  "total": 142,
  "uncategorized_count": 23
}
```

#### PATCH /api/transactions/:id

Categorize a transaction.

**Request:**
```json
{
  "category": "business_expense",
  "expense_type": "software",
  "business_percentage": 100,
  "notes": "Creative Cloud subscription"
}
```

#### POST /api/transactions/bulk-categorize

Categorize multiple transactions at once.

**Request:**
```json
{
  "transaction_ids": ["uuid1", "uuid2"],
  "category": "private"
}
```

---

### Banking

#### POST /api/banking/connect

Initiates PSD2 bank connection flow.

**Request:**
```json
{
  "provider": "tink"
}
```

**Response 200:**
```json
{
  "redirect_url": "https://link.tink.com/..."
}
```

#### GET /api/banking/callback

OAuth callback from banking provider. Handles token exchange.

**Query params:** Provider-specific (code, state, etc.)

**Redirects to:** `/transactions?connected=true`

#### POST /api/banking/sync

Manually trigger transaction sync. Also called by cron.

**Response 200:**
```json
{
  "synced": 12,
  "new_transactions": 3
}
```

---

### Customers

#### GET /api/customers

List all customers.

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Influencer Agency AB",
      "customer_type": "swedish_business",
      "org_number": "556677-8899",
      "country": "SE",
      "invoice_count": 5
    }
  ]
}
```

#### POST /api/customers

Create new customer.

**Request:**
```json
{
  "name": "Google Ireland Ltd",
  "customer_type": "eu_business",
  "vat_number": "IE6388047V",
  "address_line1": "Gordon House",
  "city": "Dublin",
  "country": "IE",
  "email": "payments@google.com"
}
```

**Response 201:** Created customer object

#### GET /api/customers/:id

Get single customer with invoice history.

#### PUT /api/customers/:id

Update customer.

#### DELETE /api/customers/:id

Soft delete (only if no invoices linked).

---

### VAT Validation

#### POST /api/vat/validate

Validate EU VAT number via VIES (VAT Information Exchange System).

**Critical for Reverse Charge:** Swedish law requires validated VAT number before applying 0% rate on EU B2B sales. Without validation, you must charge 25% Swedish VAT.

**Request:**
```json
{
  "vat_number": "IE6388047V"
}
```

**Response 200:**
```json
{
  "valid": true,
  "country_code": "IE",
  "vat_number": "6388047V",
  "name": "GOOGLE IRELAND LIMITED",
  "address": "GORDON HOUSE, BARROW STREET, DUBLIN 4",
  "validated_at": "2024-01-15T10:30:00Z"
}
```

**Response 200 (Invalid):**
```json
{
  "valid": false,
  "country_code": "IE",
  "vat_number": "INVALID123",
  "error": "VAT number not found in VIES database"
}
```

**Implementation Notes:**
- Use EU VIES SOAP service or REST wrapper
- Cache validation for 24 hours (VAT numbers rarely change)
- Store `validated_at` timestamp on customer record
- Re-validate periodically for long-term customers

---

### Foreign Purchase Handling (Fiktiv Moms)

#### POST /api/transactions/:id/foreign-purchase

Mark a transaction as foreign service purchase requiring fiktiv moms.

When influencers buy services from abroad (Adobe CC, Facebook Ads, AWS), they must self-report VAT.

**Request:**
```json
{
  "supplier_country": "US",
  "service_type": "digital_service",
  "vat_rate": 25
}
```

**Response 200:**
```json
{
  "transaction_id": "uuid",
  "fiktiv_moms_amount": 375.00,
  "bookings": [
    { "account": "2645", "debit": 375.00, "description": "Beräknad ingående moms utländskt förvärv" },
    { "account": "2614", "credit": 375.00, "description": "Utgående moms utländskt förvärv" }
  ],
  "moms_ruta_21": 1500.00,
  "moms_ruta_48": 375.00
}
```

**Momsdeklaration Impact:**
- Ruta 21: Purchase amount (before VAT)
- Ruta 48: Self-reported output VAT
- Net effect is zero if input VAT is deductible, but both must be declared
```

---

### Invoices

#### GET /api/invoices

List invoices with filters.

**Query params:**
- `status`: draft, sent, paid, overdue
- `customer_id`: filter by customer
- `from`, `to`: date range

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "invoice_number": "INV-2024-015",
      "customer": {
        "id": "uuid",
        "name": "Agency AB"
      },
      "invoice_date": "2024-01-15",
      "due_date": "2024-02-14",
      "total": 25000.00,
      "currency": "SEK",
      "status": "sent"
    }
  ]
}
```

#### POST /api/invoices

Create new invoice.

**Request:**
```json
{
  "customer_id": "uuid",
  "invoice_date": "2024-01-15",
  "due_date": "2024-02-14",
  "reference": "PO-12345",
  "items": [
    {
      "description": "Instagram kampanj November",
      "quantity": 1,
      "unit": "st",
      "unit_price": 20000.00
    }
  ],
  "customer_notes": "Tack för samarbetet!"
}
```

The API automatically determines VAT treatment based on customer type:

```typescript
// lib/invoice/vat-rules.ts

interface VatDecision {
  rate: number
  reverseCharge: boolean
  invoiceText: string | null
  momsRuta: number  // Which ruta in momsdeklaration
}

function determineVatTreatment(customer: Customer, settings: CompanySettings): VatDecision {
  // User not VAT registered - no VAT on any invoice
  if (!settings.vat_registered) {
    return { 
      rate: 0, 
      reverseCharge: false, 
      invoiceText: 'Säljaren är inte momsregistrerad',
      momsRuta: 0  // Not applicable
    }
  }
  
  switch (customer.customer_type) {
    case 'swedish_business':
    case 'individual':
      return { 
        rate: 25, 
        reverseCharge: false, 
        invoiceText: null,
        momsRuta: 5  // Ruta 05: Momspliktig försäljning
      }
    
    case 'eu_business':
      if (customer.vat_number_validated) {
        return {
          rate: 0,
          reverseCharge: true,
          invoiceText: 'Omvänd skattskyldighet / Reverse charge - Article 196 Council Directive 2006/112/EC',
          momsRuta: 39  // Ruta 39: Tjänsteförsäljning EU
        }
      }
      // EU business without valid VAT = charge Swedish VAT
      return { 
        rate: 25, 
        reverseCharge: false, 
        invoiceText: null,
        momsRuta: 5
      }
    
    case 'non_eu_business':
      return {
        rate: 0,
        reverseCharge: false,
        invoiceText: 'Export av tjänst - moms utgår ej',
        momsRuta: 40  // Ruta 40: Export
      }
  }
}
```

**Momsdeklaration Ruta Reference:**
| Ruta | Description | When Used |
|------|-------------|-----------|
| 05 | Momspliktig försäljning | Swedish domestic sales |
| 39 | Tjänsteförsäljning EU | EU B2B with reverse charge |
| 40 | Export | Non-EU sales |
| 21 | Inköp av tjänster från EU | Foreign service purchases (input) |
| 48 | Utgående moms på inköp | Fiktiv moms on foreign purchases |

**EU Sales Reporting:**
Transactions with `momsRuta: 39` must be aggregated into Periodisk Sammanställning (quarterly report to Skatteverket), separate from regular momsdeklaration.

**Response 201:** Created invoice with calculated totals

#### GET /api/invoices/:id

Get full invoice details including items.

#### PUT /api/invoices/:id

Update draft invoice. Cannot modify sent/paid invoices.

#### POST /api/invoices/:id/send

Mark invoice as sent and optionally email to customer.

**Request:**
```json
{
  "send_email": true,
  "email_to": "invoice@client.com",
  "email_message": "Hej! Här kommer fakturan för vårt samarbete."
}
```

**Email Implementation:** Uses Supabase built-in email via Edge Functions.

**Response 200:**
```json
{
  "id": "uuid",
  "status": "sent",
  "sent_at": "2024-01-15T10:30:00Z",
  "email_sent": true
}
```

**Note:** Invoice PDF attached to email. Payment method shown: bank transfer only (Bankgiro/IBAN). Future: third-party payment links (Stripe, Klarna).

#### POST /api/invoices/:id/mark-paid

Mark invoice as paid.

**Request:**
```json
{
  "paid_at": "2024-02-10",
  "paid_amount": 25000.00,
  "linked_transaction_id": "uuid"
}
```

#### GET /api/invoices/:id/pdf

Generate and return invoice PDF.

**Query params:**
- `regenerate`: force regenerate cached PDF

**Response:** PDF file or redirect to signed storage URL

---

### Salary Payments (Aktiebolag only)

#### GET /api/salary

List salary payments for current fiscal year.

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "payment_date": "2024-01-25",
      "pay_period_start": "2024-01-01",
      "pay_period_end": "2024-01-31",
      "gross_salary": 50000.00,
      "employer_contributions": 15710.00,
      "withheld_tax": 15000.00,
      "net_salary": 35000.00,
      "total_cost": 65710.00,
      "agi_reported": false
    }
  ],
  "ytd_totals": {
    "gross_salary": 50000.00,
    "employer_contributions": 15710.00,
    "withheld_tax": 15000.00,
    "total_cost": 65710.00
  }
}
```

#### POST /api/salary

Create salary payment record.

**Request:**
```json
{
  "pay_period_start": "2024-01-01",
  "pay_period_end": "2024-01-31",
  "gross_salary": 50000.00,
  "tax_table": 33
}
```

**Automatic calculations:**
- `employer_contributions`: gross × 31.42%
- `withheld_tax`: from Swedish tax tables based on gross + table number
- `net_salary`: gross - withheld_tax
- `total_cost`: gross + employer_contributions

**Response 201:** Created salary payment with all calculated fields.

#### POST /api/salary/:id/mark-agi-reported

Mark salary payment as reported in AGI-deklaration.

**Response 200:**
```json
{
  "id": "uuid",
  "agi_reported": true,
  "agi_reported_at": "2024-02-12T14:00:00Z"
}
```

---

### Dashboard

#### GET /api/dashboard/summary

Get aggregated financial overview.

**Response 200:**
```json
{
  "period": {
    "year": 2024,
    "month": 1
  },
  "revenue": {
    "ytd": 450000.00,
    "this_month": 75000.00
  },
  "expenses": {
    "ytd": 85000.00,
    "this_month": 12000.00
  },
  "net_income": {
    "ytd": 365000.00
  },
  "tax_estimate": {
    "egenavgifter": 105745.00,
    "income_tax": 116800.00,
    "vat_payable": 91250.00,
    "total_locked": 313795.00
  },
  "disponibelt": 136205.00,
  "vat_threshold": {
    "limit": 80000,
    "current": 450000.00,
    "registered": true
  },
  "pending": {
    "uncategorized_transactions": 23,
    "unpaid_invoices": 2,
    "unpaid_amount": 45000.00
  }
}
```

#### GET /api/dashboard/chart

Monthly revenue/expense data for charts.

**Query params:**
- `months`: number of months (default 12)

**Response 200:**
```json
{
  "data": [
    {
      "month": "2024-01",
      "revenue": 75000,
      "expenses": 12000,
      "net": 63000
    }
  ]
}
```

---

## Error Responses

All endpoints return errors in consistent format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid VAT number format",
    "details": {
      "field": "vat_number",
      "value": "invalid"
    }
  }
}
```

**Common status codes:**
- 400: Validation error
- 401: Not authenticated
- 403: Forbidden (RLS violation)
- 404: Resource not found
- 409: Conflict (duplicate invoice number)
- 500: Internal error
