---
name: swedish-bookkeeping
description: "Swedish double-entry bookkeeping domain knowledge for gnubok: BAS account codes, VAT treatments, journal entry patterns, entity type differences (enskild firma vs aktiebolag), and legal constraints (BFL/BFN). Use when creating journal entry generators, modifying bookkeeping logic, adding VAT handling, working with reports, or any accounting-related code. Prevents illegal accounting operations and ensures correct account/VAT mappings."
---

# Swedish Bookkeeping Reference

## Critical Rules (Legally Enforced)

1. **Committed entries are immutable** — never edit, use storno reversal
2. **Every entry must balance** — `sum(debits) === sum(credits)`, both `> 0`
3. **Monetary math**: `Math.round(x * 100) / 100` — NEVER `toFixed()`
4. **Account numbers are strings** — `'1930'`, never `1930`
5. **Always use engine** — `createJournalEntry()` from `lib/bookkeeping/engine.ts`, never direct DB inserts
6. **Voucher numbers** — assigned by DB RPC `next_voucher_number`, never manually

## Entry Generator Skeleton

```typescript
export async function createXxxEntry(userId: string, entity: Entity): Promise<JournalEntry | null> {
  const fiscalPeriodId = await findFiscalPeriod(userId, entity.date)
  if (!fiscalPeriodId) {
    console.warn('No open fiscal period for date:', entity.date)
    return null  // Caller handles null
  }

  const lines: CreateJournalEntryLineInput[] = [
    { account_number: '1930', debit_amount: amount, credit_amount: 0, line_description: '...' },
    { account_number: '3001', debit_amount: 0, credit_amount: amount, line_description: '...' },
  ]

  return createJournalEntry(userId, {
    fiscal_period_id: fiscalPeriodId,
    entry_date: entity.date,
    description: 'Swedish description here',
    source_type: 'xxx',  // Must exist in DB CHECK constraint
    source_id: entity.id,
    lines,
  })
}
```

## VAT Treatments & Accounts

| Treatment | Rate | Output VAT Account | Revenue Account |
|-----------|------|--------------------|-----------------|
| `standard_25` | 25% | `2611` | `3001` |
| `reduced_12` | 12% | `2621` | `3002` |
| `reduced_6` | 6% | `2631` | `3003` |
| `reverse_charge` | 0% | — | `3308` (EU service) |
| `export` | 0% | — | `3305` |
| `exempt` | 0% | — | `3004` (AB) / `3100` (EF) |

Input VAT (purchases): `2641` (Debiterad ingående moms)

## EU Reverse Charge (Fiktiv Moms)

Creates offsetting entries that net to zero:
```
Debit  2645  Beräknad ingående moms     [vat_amount]
Credit 2614  Utgående moms omvänd skattsk. [vat_amount]
```

## VAT From Gross Amount

```typescript
const vatAmount = Math.round((grossAmount * vatRate / (1 + vatRate)) * 100) / 100
const netAmount = Math.round((grossAmount / (1 + vatRate)) * 100) / 100
```

## Key Account Quick Reference

For full BAS chart, see `references/bas-accounts.md`.

| Account | Name | Usage |
|---------|------|-------|
| `1510` | Kundfordringar | Accounts receivable |
| `1930` | Företagskonto | Bank account |
| `2013` | Övriga egna uttag | Private withdrawals (EF) |
| `2440` | Leverantörsskulder | Accounts payable |
| `2893` | Skuld till aktieägare | Shareholder loan (AB) |

## Entity Type Differences

| Context | Enskild Firma | Aktiebolag |
|---------|--------------|------------|
| Private transactions | `2013` | `2893` |
| Exempt revenue | `3100` | `3004` |
| Education expense | `6991` | `7610` |

## Common Journal Entry Patterns

**Sales invoice (accrual)**:
```
Debit  1510  [total]     Kundfordringar
Credit 30xx  [subtotal]  Försäljning
Credit 26xx  [vat]       Utgående moms
```

**Invoice payment**:
```
Debit  1930  [total]  Företagskonto
Credit 1510  [total]  Kundfordringar
```

**Supplier invoice registration**:
```
Debit  4xxx/5xxx/6xxx  [net]  Expense account
Debit  2641            [vat]  Ingående moms
Credit 2440            [total] Leverantörsskulder
```

**Supplier invoice payment**:
```
Debit  2440  [total]  Leverantörsskulder
Credit 1930  [total]  Företagskonto
```

## Swedish Description Conventions

- `Faktura {invoice_number}` — sales invoice
- `Betalning faktura {invoice_number}` — payment
- `Kreditfaktura {invoice_number}` — credit note
- `Lev.faktura {supplier_invoice_number} (ankomst {arrival_number})` — supplier invoice
- `Makulering: {original_description}` — storno reversal

The `ankomstnummer` (arrival number) is a BFL requirement on supplier invoices.

## Momsdeklaration Boxes (Rutor)

| Ruta | Description | Maps from |
|------|-------------|-----------|
| 05 | Utgående moms 25% | Account 2611 |
| 06 | Utgående moms 12% | Account 2621 |
| 07 | Utgående moms 6% | Account 2631 |
| 10 | Underlag 25% | Revenue at 25% |
| 11 | Underlag 12% | Revenue at 12% |
| 12 | Underlag 6% | Revenue at 6% |
| 39 | EU tjänsteförsäljning | Account 3308 |
| 40 | Export | Account 3305 |
| 48 | Ingående moms | Account 2641 |
| 49 | Moms att betala/återfå | Sum 05+06+07 - 48 |

## EU VAT Rule

EU business customers MUST have a validated VAT number to qualify for reverse charge. Without validation, charge standard 25% Swedish VAT.

## source_type Values

Adding a new generator with a new source_type requires a DB migration to expand the CHECK constraint. Current values: `manual`, `bank_transaction`, `invoice_created`, `invoice_paid`, `invoice_cash_payment`, `credit_note`, `salary_payment`, `opening_balance`, `year_end`, `storno`, `correction`, `import`, `system`, `supplier_invoice_registered`, `supplier_invoice_paid`, `supplier_invoice_cash_payment`, `supplier_credit_note`.
