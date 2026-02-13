# Database Schema

## Entity Relationship Diagram

```
users (Supabase Auth)
  │
  ├── profiles (1:1)
  │     └── company_settings (1:1)
  │
  ├── bank_connections (1:N)
  │     └── transactions (1:N)
  │
  ├── customers (1:N)
  │
  └── invoices (1:N)
        └── invoice_items (1:N)
```

## Tables

### profiles

Extends Supabase auth.users.

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);
```

### company_settings

Business/tax information for the company (enskild firma or AB).

```sql
CREATE TYPE entity_type AS ENUM (
  'enskild_firma',
  'aktiebolag'
);

CREATE TYPE moms_period AS ENUM (
  'monthly',
  'quarterly'
);

CREATE TABLE company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Onboarding status
  onboarding_complete BOOLEAN DEFAULT FALSE,
  onboarding_step INTEGER DEFAULT 1,          -- Track progress (1-6)
  
  -- Entity type
  entity_type entity_type NOT NULL DEFAULT 'enskild_firma',
  
  -- Company info
  company_name TEXT NOT NULL,
  org_number TEXT,                    -- Organisationsnummer (required for AB)
  vat_number TEXT,                    -- SE + org_number + 01 (if VAT registered)
  f_skatt_registered BOOLEAN DEFAULT TRUE,
  
  -- Address
  address_line1 TEXT,
  address_line2 TEXT,
  postal_code TEXT,
  city TEXT,
  country TEXT DEFAULT 'SE',
  
  -- Banking
  bank_name TEXT,
  clearing_number TEXT,
  account_number TEXT,
  iban TEXT,
  bic TEXT,
  
  -- Contact
  phone TEXT,
  website TEXT,
  
  -- Tax settings
  municipal_tax_rate DECIMAL(5,2) DEFAULT 32.00,  -- User's kommun (enskild firma)
  preliminary_tax_monthly DECIMAL(12,2),          -- Debiterad F-skatt per month
  vat_registered BOOLEAN DEFAULT FALSE,
  vat_registration_date DATE,
  moms_period moms_period DEFAULT 'quarterly',
  
  -- Fiscal year (räkenskapsår)
  fiscal_year_start_month INTEGER DEFAULT 1,      -- 1 = calendar year, other = brutet räkenskapsår
  -- Example: 7 = July start (July 1 - June 30)
  
  -- Invoice settings
  invoice_prefix TEXT DEFAULT 'INV',
  next_invoice_number INTEGER DEFAULT 1001,       -- Allow unusual starting numbers
  payment_terms_days INTEGER DEFAULT 30,
  default_currency TEXT DEFAULT 'SEK',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id)
);

-- RLS
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own company settings"
  ON company_settings FOR ALL
  USING (auth.uid() = user_id);
```

### bank_connections

PSD2 bank connection records.

```sql
CREATE TABLE bank_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  provider TEXT NOT NULL,             -- 'tink', 'enablebanking'
  provider_connection_id TEXT,        -- External ID
  bank_name TEXT,
  account_name TEXT,
  account_number_masked TEXT,         -- Last 4 digits
  
  status TEXT DEFAULT 'pending',      -- pending, active, expired, error
  consent_expires_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  
  -- Encrypted tokens stored in Supabase Vault or as encrypted column
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own bank connections"
  ON bank_connections FOR ALL
  USING (auth.uid() = user_id);
```

### transactions

Bank transactions imported via PSD2.

```sql
CREATE TYPE transaction_category AS ENUM (
  'uncategorized',
  'business_income',
  'business_expense',
  'private',
  'tax_payment',
  'vat_payment',
  'transfer'
);

CREATE TYPE expense_type AS ENUM (
  'equipment',
  'software',
  'travel',
  'meals',
  'office',
  'marketing',
  'professional_services',
  'other'
);

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bank_connection_id UUID REFERENCES bank_connections(id) ON DELETE SET NULL,
  
  -- Transaction data from bank
  external_id TEXT,                   -- Bank's transaction ID
  booking_date DATE NOT NULL,
  value_date DATE,
  amount DECIMAL(12,2) NOT NULL,      -- Negative = expense, Positive = income
  currency TEXT DEFAULT 'SEK',
  description TEXT,
  counterparty_name TEXT,
  counterparty_account TEXT,
  mcc_code TEXT,                      -- Merchant Category Code from bank
  
  -- Categorization
  category transaction_category DEFAULT 'uncategorized',
  expense_type expense_type,
  business_percentage INTEGER DEFAULT 100,  -- For mixed-use items
  
  -- BAS Accounting
  bas_account TEXT,                   -- e.g., '5410', '2013', '5910'
  bas_account_auto BOOLEAN DEFAULT FALSE,  -- Was this auto-categorized?
  bas_account_confidence TEXT,        -- 'high', 'medium', 'low'
  reverse_charge_applied BOOLEAN DEFAULT FALSE,
  
  -- VAT tracking
  vat_amount DECIMAL(12,2),           -- Calculated or from receipt
  vat_rate DECIMAL(5,2),              -- 25, 12, 6, or 0
  
  -- Metadata
  notes TEXT,
  receipt_url TEXT,                   -- Link to uploaded receipt
  linked_invoice_id UUID,             -- If this is payment for an invoice
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, external_id)
);

-- Indexes
CREATE INDEX idx_transactions_user_date ON transactions(user_id, booking_date DESC);
CREATE INDEX idx_transactions_category ON transactions(user_id, category);

-- RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own transactions"
  ON transactions FOR ALL
  USING (auth.uid() = user_id);
```

### customers

Invoice recipients.

```sql
CREATE TYPE customer_type AS ENUM (
  'individual',
  'swedish_business',
  'eu_business',
  'non_eu_business'
);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  customer_type customer_type NOT NULL,
  
  -- Basic info
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  
  -- Business info
  org_number TEXT,
  vat_number TEXT,                    -- For EU reverse charge validation
  vat_number_validated BOOLEAN DEFAULT FALSE,
  vat_number_validated_at TIMESTAMPTZ,
  
  -- Address
  address_line1 TEXT,
  address_line2 TEXT,
  postal_code TEXT,
  city TEXT,
  country TEXT NOT NULL DEFAULT 'SE',
  
  -- Defaults for invoicing
  default_payment_terms_days INTEGER,
  default_currency TEXT DEFAULT 'SEK',
  
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own customers"
  ON customers FOR ALL
  USING (auth.uid() = user_id);
```

### invoices

```sql
CREATE TYPE invoice_status AS ENUM (
  'draft',
  'sent',
  'viewed',
  'paid',
  'overdue',
  'cancelled'
);

CREATE TYPE invoice_type AS ENUM (
  'invoice',
  'credit_note'
);

CREATE TYPE vat_treatment AS ENUM (
  'standard',           -- Normal VAT rate
  'reverse_charge',     -- EU B2B
  'export',             -- Non-EU
  'exempt'              -- VAT exempt services
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  
  -- Invoice identification
  invoice_number TEXT NOT NULL,
  invoice_type invoice_type NOT NULL DEFAULT 'invoice',
  credited_invoice_id UUID REFERENCES invoices(id),  -- For credit notes: which invoice is credited
  reference TEXT,                     -- Customer's reference/PO number
  
  -- Dates
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  
  -- Original currency (what customer pays)
  currency TEXT NOT NULL DEFAULT 'SEK',
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  vat_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  
  -- SEK conversion (for bokföring)
  exchange_rate DECIMAL(10,6) DEFAULT 1.0,
  exchange_rate_date DATE,
  subtotal_sek DECIMAL(12,2) NOT NULL DEFAULT 0,
  vat_amount_sek DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_sek DECIMAL(12,2) NOT NULL DEFAULT 0,
  
  -- VAT handling
  vat_treatment vat_treatment NOT NULL DEFAULT 'standard',
  vat_rate DECIMAL(5,2) DEFAULT 25.00,
  reverse_charge_text TEXT,           -- Legal text for reverse charge
  moms_ruta INTEGER,                  -- Which ruta in momsdeklaration (5, 39, 40)
  
  -- Status
  status invoice_status DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  paid_amount DECIMAL(12,2),
  paid_currency TEXT,
  
  -- PDF
  pdf_url TEXT,
  pdf_generated_at TIMESTAMPTZ,
  
  -- Additional
  notes TEXT,                         -- Internal notes
  customer_notes TEXT,                -- Visible on invoice
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, invoice_number),
  
  -- Credit notes must reference an original invoice
  CONSTRAINT credit_note_requires_original CHECK (
    (invoice_type = 'credit_note' AND credited_invoice_id IS NOT NULL) OR
    (invoice_type = 'invoice')
  )
);

-- Indexes
CREATE INDEX idx_invoices_user_status ON invoices(user_id, status);
CREATE INDEX idx_invoices_due_date ON invoices(user_id, due_date);
CREATE INDEX idx_invoices_type ON invoices(user_id, invoice_type);

-- RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own invoices"
  ON invoices FOR ALL
  USING (auth.uid() = user_id);
```

### invoice_items

```sql
CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  
  description TEXT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'st',             -- st, timmar, etc.
  unit_price DECIMAL(12,2) NOT NULL,
  
  -- Calculated
  line_total DECIMAL(12,2) NOT NULL,
  
  sort_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own invoice items"
  ON invoice_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_items.invoice_id
      AND invoices.user_id = auth.uid()
    )
  );
```

### salary_payments (Aktiebolag only)

Track owner salary payments for AB entities.

```sql
CREATE TABLE salary_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Payment details
  payment_date DATE NOT NULL,
  pay_period_start DATE NOT NULL,        -- e.g., 2024-01-01
  pay_period_end DATE NOT NULL,          -- e.g., 2024-01-31
  
  -- Amounts
  gross_salary DECIMAL(12,2) NOT NULL,   -- Bruttolön
  employer_contributions DECIMAL(12,2) NOT NULL,  -- Arbetsgivaravgifter (31.42%)
  withheld_tax DECIMAL(12,2) NOT NULL,   -- Preliminärskatteavdrag
  net_salary DECIMAL(12,2) NOT NULL,     -- Nettolön (what's paid out)
  
  -- Total cost to company
  total_cost DECIMAL(12,2) NOT NULL,     -- gross + employer_contributions
  
  -- Reporting status
  agi_reported BOOLEAN DEFAULT FALSE,    -- AGI-deklaration submitted
  agi_reported_at TIMESTAMPTZ,
  
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE salary_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own salary payments"
  ON salary_payments FOR ALL
  USING (auth.uid() = user_id);

-- Index for period queries
CREATE INDEX idx_salary_payments_period ON salary_payments(user_id, pay_period_start);
```

### Constants for AB calculations

```sql
-- Current rates (update annually)
-- Arbetsgivaravgifter: 31.42% (2024)
-- This should be configurable or fetched from a rates table

CREATE TABLE tax_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_type TEXT NOT NULL,               -- 'arbetsgivaravgifter', 'bolagsskatt', etc.
  rate DECIMAL(5,4) NOT NULL,            -- 0.3142 for 31.42%
  valid_from DATE NOT NULL,
  valid_to DATE,                         -- NULL = currently active
  
  UNIQUE(rate_type, valid_from)
);

-- Seed current rates
INSERT INTO tax_rates (rate_type, rate, valid_from) VALUES
  ('arbetsgivaravgifter', 0.3142, '2024-01-01'),
  ('bolagsskatt', 0.206, '2021-01-01'),
  ('egenavgifter', 0.2897, '2024-01-01');
```

### bas_accounts (Reference Table)

Available BAS accounts for transaction categorization.

```sql
CREATE TABLE bas_accounts (
  account_number TEXT PRIMARY KEY,    -- e.g., '5410'
  name_sv TEXT NOT NULL,              -- Swedish name
  name_en TEXT,                       -- English name
  account_class INTEGER NOT NULL,     -- 1-8
  account_group INTEGER NOT NULL,     -- e.g., 54
  
  -- Categorization
  is_expense BOOLEAN DEFAULT FALSE,
  is_income BOOLEAN DEFAULT FALSE,
  is_asset BOOLEAN DEFAULT FALSE,
  is_liability BOOLEAN DEFAULT FALSE,
  
  -- Influencer-specific
  common_for_influencers BOOLEAN DEFAULT FALSE,
  risk_level TEXT,                    -- 'low', 'medium', 'high', 'very_high'
  default_vat_rate DECIMAL(5,2),
  
  -- Usage hints
  description TEXT,
  warning_text TEXT,                  -- Shown when selected
  requires_documentation BOOLEAN DEFAULT FALSE,
  
  active BOOLEAN DEFAULT TRUE
);

-- Seed common influencer accounts
INSERT INTO bas_accounts (account_number, name_sv, name_en, account_class, account_group, is_expense, common_for_influencers, risk_level, description) VALUES
  ('1210', 'Maskiner och inventarier', 'Equipment', 1, 12, FALSE, TRUE, 'low', 'Kameror, datorer över 29 400 kr'),
  ('2013', 'Eget uttag', 'Owner withdrawals', 2, 20, FALSE, TRUE, 'low', 'Privata utgifter betalda med företagskort'),
  ('3001', 'Försäljning 25%', 'Sales 25% VAT', 3, 30, FALSE, TRUE, 'low', 'Svenska samarbeten'),
  ('3044', 'Försäljning tjänst EU', 'EU service sales', 3, 30, FALSE, TRUE, 'low', 'AdSense, EU-affiliates. Kräver periodisk sammanställning'),
  ('3045', 'Försäljning tjänst export', 'Export service sales', 3, 30, FALSE, TRUE, 'low', 'Twitch, YouTube US. Momsfritt'),
  ('5410', 'Förbrukningsinventarier', 'Consumable equipment', 5, 54, TRUE, TRUE, 'low', 'Kameror, datorer under 29 400 kr'),
  ('5420', 'Programvaror', 'Software', 5, 54, TRUE, TRUE, 'low', 'Adobe CC, Epidemic Sound, SaaS'),
  ('5480', 'Arbetskläder', 'Work clothes', 5, 54, TRUE, TRUE, 'very_high', 'Endast skyddskläder/uniformer. EJ civila kläder!'),
  ('5800', 'Resekostnader', 'Travel expenses', 5, 58, TRUE, TRUE, 'medium', 'Tåg, flyg, hyrbil för tjänsteresor'),
  ('5820', 'Taxikostnader', 'Taxi', 5, 58, TRUE, TRUE, 'medium', 'Taxi/Uber för tjänsteresor'),
  ('5910', 'Annonsering', 'Advertising', 5, 59, TRUE, TRUE, 'low', 'Facebook Ads, Google Ads, TikTok'),
  ('6071', 'Representation, avdragsgill', 'Deductible representation', 6, 60, TRUE, TRUE, 'high', 'Max 60 kr/person. Kräver dokumentation'),
  ('6072', 'Representation, ej avdragsgill', 'Non-deductible representation', 6, 60, TRUE, TRUE, 'high', 'Måltider vid representation'),
  ('6230', 'Datakommunikation', 'Data/web hosting', 6, 62, TRUE, TRUE, 'low', 'Webbhotell, domäner, bredband'),
  ('6500', 'Övriga externa tjänster', 'Other services', 6, 65, TRUE, TRUE, 'low', 'Fotografer, klippare med F-skatt');
```

### mcc_mappings (Reference Table)

MCC code to BAS account mappings for auto-categorization.

```sql
CREATE TABLE mcc_mappings (
  mcc_code TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  risk_level TEXT NOT NULL,           -- 'low', 'medium', 'high', 'very_high'
  primary_account TEXT REFERENCES bas_accounts(account_number),
  secondary_account TEXT REFERENCES bas_accounts(account_number),
  requires_user_input BOOLEAN DEFAULT FALSE,
  auto_reject_reason TEXT,            -- If very_high risk, why?
  categorization_logic TEXT,
  active BOOLEAN DEFAULT TRUE
);

-- Seed MCC mappings (subset - see 08-BAS-ACCOUNTING-GUIDE.md for full list)
INSERT INTO mcc_mappings (mcc_code, description, risk_level, primary_account, secondary_account, requires_user_input, auto_reject_reason, categorization_logic) VALUES
  ('7311', 'Advertising Services', 'low', '5910', '5930', FALSE, NULL, 'Standard for Facebook/Google Ads. Triggers EU VAT check.'),
  ('5732', 'Electronics Stores', 'medium', '5410', '1210', FALSE, NULL, 'Amount determines routing. >29,400 kr → 1210.'),
  ('5946', 'Camera & Photo Supply', 'medium', '5410', '1210', FALSE, NULL, 'Same as electronics.'),
  ('5812', 'Eating Places/Restaurants', 'high', '6072', '2013', TRUE, NULL, 'Requires user input: Representation or private?'),
  ('5611', 'Mens Clothing', 'very_high', '2013', '5480', TRUE, 'Clothes usable privately are not deductible (RÅ81 1:29)', 'Default MUST be 2013.'),
  ('5621', 'Womens Ready-to-Wear', 'very_high', '2013', '5480', TRUE, 'Clothes usable privately are not deductible', 'Default MUST be 2013.'),
  ('5977', 'Cosmetic Stores', 'very_high', '2013', '5490', TRUE, 'Cosmetics are private expenses', 'Default private.'),
  ('4111', 'Commuter Transport', 'low', '5800', NULL, FALSE, NULL, 'Train/bus. 6% VAT in Sweden.'),
  ('4722', 'Travel Agencies', 'medium', '5800', '2013', TRUE, NULL, 'Is the trip business-related?'),
  ('7372', 'Computer Programming', 'low', '6230', '5420', FALSE, NULL, 'Web hosting, SaaS.'),
  ('5921', 'Package Stores (Systembolaget)', 'very_high', '2013', NULL, FALSE, 'Alcohol is not deductible', 'Always 2013.'),
  ('7941', 'Sports Clubs/Gyms', 'very_high', '2013', NULL, FALSE, 'Gym is private expense even for fitness influencers', 'Always 2013.');
```

## Functions

### Calculate invoice totals

```sql
CREATE OR REPLACE FUNCTION calculate_invoice_totals()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE invoices
  SET
    subtotal = (
      SELECT COALESCE(SUM(line_total), 0)
      FROM invoice_items
      WHERE invoice_id = NEW.invoice_id
    ),
    vat_amount = (
      SELECT COALESCE(SUM(line_total), 0) * (vat_rate / 100)
      FROM invoice_items
      WHERE invoice_id = NEW.invoice_id
    ),
    total = (
      SELECT COALESCE(SUM(line_total), 0) * (1 + vat_rate / 100)
      FROM invoice_items
      WHERE invoice_id = NEW.invoice_id
    ),
    updated_at = NOW()
  WHERE id = NEW.invoice_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_calculate_invoice_totals
AFTER INSERT OR UPDATE OR DELETE ON invoice_items
FOR EACH ROW
EXECUTE FUNCTION calculate_invoice_totals();
```

### Auto-create profile on signup

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION handle_new_user();
```

## Views

### Dashboard summary

```sql
CREATE VIEW dashboard_summary AS
SELECT
  p.id AS user_id,
  
  -- Revenue YTD
  COALESCE(SUM(
    CASE WHEN t.amount > 0 AND t.category = 'business_income'
    AND t.booking_date >= DATE_TRUNC('year', CURRENT_DATE)
    THEN t.amount ELSE 0 END
  ), 0) AS revenue_ytd,
  
  -- Expenses YTD
  COALESCE(SUM(
    CASE WHEN t.amount < 0 AND t.category = 'business_expense'
    AND t.booking_date >= DATE_TRUNC('year', CURRENT_DATE)
    THEN ABS(t.amount) ELSE 0 END
  ), 0) AS expenses_ytd,
  
  -- Uncategorized count
  COUNT(CASE WHEN t.category = 'uncategorized' THEN 1 END) AS uncategorized_count,
  
  -- Unpaid invoices
  (SELECT COUNT(*) FROM invoices i
   WHERE i.user_id = p.id
   AND i.status IN ('sent', 'overdue')) AS unpaid_invoice_count,
  
  (SELECT COALESCE(SUM(total), 0) FROM invoices i
   WHERE i.user_id = p.id
   AND i.status IN ('sent', 'overdue')) AS unpaid_invoice_total

FROM profiles p
LEFT JOIN transactions t ON t.user_id = p.id
GROUP BY p.id;
```

## Migration File

Save as `supabase/migrations/001_initial_schema.sql`:

```sql
-- Copy all CREATE TABLE, CREATE TYPE, CREATE FUNCTION, CREATE VIEW statements above
-- Run with: supabase db push
```