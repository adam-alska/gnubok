# Influencer Business-in-a-Box MVP

## Quick Context for AI Builders

Financial management SaaS for Swedish influencers/content creators. Supports both enskild firma (sole proprietor) and aktiebolag (limited company). Core problem: tax anxiety and admin overload. Core solution: automated compliance and simplified invoicing.

## Tech Stack

- **Framework**: Next.js 14 (App Router) + TypeScript
- **UI**: Tailwind CSS + shadcn/ui + Framer Motion
- **Database**: Supabase (PostgreSQL with RLS)
- **Auth**: Supabase Auth (magic link)
- **Hosting**: Vercel
- **PDF**: @react-pdf/renderer
- **Banking**: Enable Banking (PSD2 AISP)
- **Currency**: Riksbanken API for exchange rates

## Documentation Index

| Doc | Purpose |
|-----|---------|
| [01-PRD.md](./docs/01-PRD.md) | Product requirements, user stories, success metrics |
| [02-ARCHITECTURE.md](./docs/02-ARCHITECTURE.md) | Technical architecture, PSD2 strategy, security |
| [03-DATABASE-SCHEMA.md](./docs/03-DATABASE-SCHEMA.md) | Full Supabase schema with RLS policies |
| [04-API-SPECIFICATION.md](./docs/04-API-SPECIFICATION.md) | All API endpoints, VAT rules, momsdeklaration rutor |
| [05-UI-SPECIFICATION.md](./docs/05-UI-SPECIFICATION.md) | Wireframes, component specs, design system |
| [06-IMPLEMENTATION-GUIDE.md](./docs/06-IMPLEMENTATION-GUIDE.md) | Step-by-step build guide with code examples |
| [07-FUTURE-FEATURES.md](./docs/07-FUTURE-FEATURES.md) | Phase 2+ features: benefits tracking, NE-bilaga, Skatteverket APIs |
| [08-BAS-ACCOUNTING-GUIDE.md](./docs/08-BAS-ACCOUNTING-GUIDE.md) | BAS account mapping, MCC codes, auto-categorization rules |

## MVP Feature Scope

### Included in MVP

1. **Entity Support**: Both enskild firma and aktiebolag with appropriate tax logic
2. **Bank Integration**: Enable Banking (PSD2) with multiple account support
3. **Tax Dashboard**: "Disponibelt saldo" with F-skatt comparison warning
4. **Transaction Categorization**: Swipe UI with schablonavdrag suggestions
5. **Multi-currency Invoicing**: SEK, EUR, USD with Riksbanken auto-conversion
6. **VAT Automation**: Swedish (25%), EU reverse charge (0%), Export (0%)
7. **Credit Notes**: Kreditfaktura support for invoice corrections
8. **Expense Warnings**: Alert on non-deductible lifestyle costs
9. **Configurable Settings**: Momsperiod (monthly/quarterly), custom invoice numbering

### Deferred to Later

- Receipt photo capture and matching
- Benefits/gifts tracking (förmånshantering)
- NE-bilaga / Årsredovisning auto-generation
- Automated payment reminders
- Quotes/proforma invoices
- English UI

## Entity Type Tax Differences

| Aspect | Enskild Firma | Aktiebolag |
|--------|---------------|------------|
| Profit tax | Egenavgifter (28.97%) + kommunalskatt (~32%) | Bolagsskatt (20.6%) |
| Owner payment | Eget uttag | Lön + utdelning |
| Annual filing | NE-bilaga | Årsredovisning + INK2 |

## Key Swedish Tax & Legal Concepts

| Term | English | Rate/Rule |
|------|---------|-----------|
| Enskild firma | Sole proprietorship | Personal liability, NE-bilaga |
| Aktiebolag (AB) | Limited company | 20.6% bolagsskatt, årsredovisning |
| Egenavgifter | Self-employment contributions | 28.97% (enskild firma only) |
| Arbetsgivaravgifter | Employer contributions | 31.42% (AB paying salary) |
| Bolagsskatt | Corporate tax | 20.6% on AB profit |
| Kommunalskatt | Municipal income tax | ~30-35% varies |
| F-skatt | Business tax registration | Required for invoicing |
| Debiterad preliminärskatt | Preliminary tax set | Monthly F-skatt payment amount |
| Moms | VAT | 25% standard, threshold 80k SEK |
| Momsperiod | VAT reporting period | Monthly or quarterly |
| Räkenskapsår | Fiscal year | Calendar or brutet (broken) |
| Brutet räkenskapsår | Non-calendar fiscal year | e.g., July 1 - June 30 |
| Omvänd skattskyldighet | Reverse charge | EU B2B: buyer reports VAT |
| Kreditfaktura | Credit note | Corrects/cancels issued invoice |
| Schablonavdrag | Standard deduction | Fixed amounts (hemmakontor 2000 kr/år) |
| AGI-deklaration | Employer declaration | Monthly report for AB salaries |
| SIE-fil | Standard Import Export | Accounting data exchange format |

## Entity Type Tax Differences

| Aspect | Enskild Firma | Aktiebolag |
|--------|---------------|------------|
| Profit tax | Egenavgifter (28.97%) + kommunalskatt (~32%) | Bolagsskatt (20.6%) |
| Owner payment | Eget uttag | Lön + utdelning |
| Salary costs | N/A | Arbetsgivaravgifter (31.42%) |
| Annual filing | NE-bilaga | Årsredovisning + INK2 |
| Periodiseringsfond | Max 30% | Max 25% |

**MVP Note:** For AB, system tracks salary payments and calculates arbetsgivaravgifter. Lön/utdelning optimization (3:12-reglerna) deferred to future phase.

## MVP Technical Notes

| Aspect | Implementation |
|--------|----------------|
| Banking | Enable Banking (PSD2 AISP) |
| Email | Supabase built-in |
| Payment on invoices | Bank transfer only (future: third-party) |
| Partial payments | Not supported (paid/unpaid binary) |
| Fiscal year | Calendar + brutet räkenskapsår |
| Multi-user | Single user per account |
| UI Language | Swedish only |
| Data import | SIE file (future feature) |

## Momsdeklaration Ruta Quick Reference

| Ruta | When Used |
|------|-----------|
| 05 | Swedish domestic sales with 25% VAT |
| 39 | EU B2B services (reverse charge) |
| 40 | Export to non-EU |
| 21 | Service purchases from EU (input) |
| 48 | Self-assessed output VAT on foreign purchases |

## Critical Implementation Notes

1. **All tax figures are estimates** - display disclaimer prominently
2. **VIES validation required** for EU reverse charge - without it, charge 25% VAT
3. **Non-custodial design** - app NEVER holds user funds
4. **Multi-currency**: Store original + SEK converted amounts, use Riksbanken rate on invoice date
5. **Invoice numbers**: Allow custom starting number (user may have history elsewhere)
6. **Credit notes**: Must reference original invoice, use negative amounts
7. **Expense warnings** - clothing, cosmetics, gym are NOT deductible per Kammarrätten rulings
8. **7-year retention** - Bokföringslagen requires, GDPR does not override for accounting records
9. **RLS on all tables** - users must only access own data
10. **Swedish UI only** for MVP

## Schablonavdrag Defaults

| Type | Amount | Notes |
|------|--------|-------|
| Hemmakontor | 2 000 kr/år | If dedicated room |
| Bilkostnader | 18.50 kr/mil | Business travel |
| Telefon | Actual or % split | Based on business use |

## Quick Start for Builder AI

1. Read docs in order: PRD → Architecture → Schema → API → UI → Implementation → Future
2. Start with auth + middleware (including onboarding redirect logic)
3. Build onboarding wizard (6 steps, all required except preliminary tax)
4. Implement Enable Banking integration in onboarding step 6
5. Build dashboard with tax calculations (adapt for entity type)
6. Add invoice creation with multi-currency + VIES validation
7. Implement credit note flow
8. Polish UI (Swedish language)

## File Structure

```
/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (onboarding)/onboarding/     # Wizard steps 1-6
│   ├── (dashboard)/
│   │   ├── page.tsx                 # Dashboard
│   │   ├── transactions/page.tsx
│   │   ├── invoices/
│   │   │   ├── page.tsx
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/credit/page.tsx # Credit notes
│   │   ├── customers/page.tsx
│   │   └── settings/page.tsx
│   └── api/...
├── components/
│   ├── ui/                          # shadcn components
│   ├── onboarding/                  # Wizard components
│   ├── dashboard/
│   ├── transactions/
│   └── invoices/
├── lib/
│   ├── supabase/
│   ├── banking/enable-banking.ts
│   ├── currency/riksbanken.ts
│   ├── tax/
│   │   ├── calculator.ts
│   │   ├── expense-warnings.ts
│   │   ├── schablonavdrag.ts
│   │   └── fskatt-warning.ts
│   └── invoice/vat-rules.ts
├── types/index.ts
└── supabase/migrations/
```