# Product Requirements Document: Influencer Business-in-a-Box MVP

## Executive Summary

A financial management system for Swedish influencers and content creators operating as sole proprietors (enskild firma). The core value proposition: eliminate tax anxiety and administrative burden through automated compliance.

## Target User

- Swedish content creators operating as:
  - Enskild näringsidkare (sole proprietor)
  - Aktiebolag (limited company)
- Income from multiple sources: brand deals, affiliate
- Revenue range: 50k-2M SEK/year
- Pain: Fear of Skatteverket, hatred of admin, confusion about VAT on international payments

## Entity Type Differences

| Aspect | Enskild Firma | Aktiebolag |
|--------|---------------|------------|
| Tax on profit | Egenavgifter (28.97%) + kommunalskatt (~32%) | Bolagsskatt (20.6%) |
| Owner payment | Eget uttag (withdrawal) | Lön + utdelning |
| Annual filing | NE-bilaga | Årsredovisning + INK2 |
| VAT | Same rules | Same rules |
| Personal liability | Yes | No (limited) |

MVP focuses on shared features (invoicing, VAT, transactions). Entity-specific tax calculations adapt based on company_settings.entity_type.

## MVP Scope

### In Scope (Phase 1)

1. **Real-time Tax Dashboard** ("Disponibelt Saldo")
   - Show available balance after estimated tax, employer contributions (egenavgifter), and VAT
   - Visual "locked" vs "spendable" money display
   - Adapt calculations based on entity type (enskild firma vs AB)
   - Compare against user's debiterad preliminärskatt (F-skatt level) to warn about under/overpayment

2. **Bank Integration via Enable Banking (PSD2)**
   - Connect multiple bank accounts
   - Real-time transaction sync
   - Consent renewal handling (90-180 days)

3. **Transaction Categorization**
   - Swipe interface: Business / Private / Unsure
   - Expense categories with schablonavdrag suggestions
   - Smart defaults: hemmakontor 2000 kr/year, bil 18.50 kr/mil

4. **Invoice Generation**
   - Create professional PDF invoices
   - Multi-currency support (SEK, EUR, USD)
   - Auto-convert foreign currency to SEK using Riksbanken daily rates
   - Automatic VAT logic:
     - Swedish customer: 25% VAT
     - EU business (with VAT number): Reverse charge
     - Non-EU: No VAT
   - Customizable starting invoice number
   - Credit notes (kreditfaktura) for corrections

5. **Income Overview**
   - Aggregate invoiced revenue + platform payouts
   - Track against VAT registration threshold (80k SEK)
   - Selectable momsperiod (monthly/quarterly)

### Out of Scope (Future Phases)

- Receipt photo capture and matching
- Benefits/gifts tracking (förmånshantering)
- NE-bilaga / Årsredovisning auto-generation
- Automated payment reminders
- Quotes/proforma invoices
- English UI

## User Stories

### Onboarding (Required before feature access)
- As a new user, I complete a guided setup wizard before accessing the app
- As a user, I select my entity type (enskild firma or aktiebolag)
- As a user, I enter my company details (name, org.nr, address)
- As a user, I confirm my F-skatt registration status
- As a user, I set my VAT registration status and momsperiod
- As a user, I enter my preliminary tax (debiterad F-skatt) amount
- As a user, I add my bank details for invoice payments
- As a user, I connect at least one bank account via Enable Banking
- As a user, I cannot skip required fields - all must be completed

### Dashboard
- As a user, I see my total balance, locked tax amount, and spendable amount immediately on login
- As a user, I see a warning when approaching VAT registration threshold

### Transactions
- As a user, I connect my bank account securely
- As a user, I categorize transactions by swiping
- As a user, I can edit categorization later
- As a user, I see uncategorized transaction count as a badge

### Invoicing
- As a user, I create an invoice in under 60 seconds
- As a user, the system auto-detects if reverse charge applies
- As a user, I download PDF or copy link to hosted invoice
- As a user, I see invoice status: draft, sent, paid, overdue

### Settings
- As a user, I enter my company details once (org.nr, F-skatt, address)
- As a user, I save customer profiles for repeat invoicing

## Success Metrics

- Time to first invoice: <5 minutes from signup
- Transaction categorization rate: >80% within 7 days
- User retention at 30 days: >40%

## Constraints

- Must comply with Swedish Bokföringslagen
- Bank integration must use licensed PSD2 provider (TSP model via Tink/Nordigen)
- Invoice PDF must contain all legally required fields
- All financial calculations are estimates, not tax advice (disclaimer required)
- 7-year retention of all räkenskapsinformation per Bokföringslagen
- Non-custodial design: app never holds user funds
- GDPR compliant with EU/EES data residency

## Regulatory Notes for MVP

### PSD2 Strategy
Use Technical Service Provider (TSP) model. Nordigen offers free AISP tier. Avoids 125k EUR capital requirement and FI licensing process.

### Non-Custodial Principle
Critical: System must never hold client funds. For tax savings feature, use PISP to move funds to user's own separate bank account, not an app-controlled wallet. This avoids Lagen om redovisningsmedel requirements.

### Data Retention
- Bokföringslagen requires 7-year retention of verifikationer
- GDPR "right to be forgotten" does not override this legal obligation
- Technical lock must prevent deletion of accounting records even on account closure
- Non-accounting data (support chats, preferences) can be deleted on request

### Digital Archiving (July 2024 Law)
Receipt photos must be stored in immutable format (PDF/A or locked JPEG). Paper originals no longer required if digital capture is tamper-proof.
