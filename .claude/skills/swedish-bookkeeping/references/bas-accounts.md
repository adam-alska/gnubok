# BAS Account Quick Reference — erp-base

Accounts used in codebase. Search `dev_docs/BASKONTOPLAN.md` for full chart.

## Class 1 — Assets

| Account | Name | Usage |
|---------|------|-------|
| `1510` | Kundfordringar | Accounts receivable (sales invoices) |
| `1930` | Företagskonto/checkkonto | Primary bank account |

## Class 2 — Equity, Liabilities & VAT

| Account | Name | Usage |
|---------|------|-------|
| `2013` | Övriga egna uttag | Private withdrawals (enskild firma only) |
| `2440` | Leverantörsskulder | Accounts payable |
| `2611` | Utg. moms 25% | Output VAT standard rate |
| `2614` | Utg. moms omvänd skattskyldighet | Reverse charge output |
| `2621` | Utg. moms 12% | Output VAT reduced |
| `2631` | Utg. moms 6% | Output VAT reduced |
| `2641` | Debiterad ingående moms | Input VAT (deductible) |
| `2645` | Beräknad ingående moms utlandet | Calculated input VAT (EU reverse charge) |
| `2893` | Skuld till aktieägare | Shareholder loan (aktiebolag only) |

## Class 3 — Revenue

| Account | Name | Usage |
|---------|------|-------|
| `3001` | Försäljning 25% | Revenue at standard VAT |
| `3002` | Försäljning 12% | Revenue at reduced 12% |
| `3003` | Försäljning 6% | Revenue at reduced 6% |
| `3004` | Försäljning momsfri (AB) | Exempt revenue, aktiebolag |
| `3100` | Försäljning momsfri (EF) | Exempt revenue, enskild firma |
| `3305` | Försäljning tjänst export | Non-EU export |
| `3308` | Försäljning tjänst EU | EU service (reverse charge) |
| `3900` | Övriga rörelseintäkter | Other operating income |
| `3960` | Valutakursvinster | FX gains |

## Class 4-6 — Expenses

| Account | Name | Category mapping |
|---------|------|-----------------|
| `5010` | Lokalhyra | `expense_office` |
| `5410` | Förbrukningsinventarier | `expense_equipment` |
| `5420` | Programvaror | `expense_software` |
| `5800` | Resekostnader | `expense_travel` |
| `5910` | Annonsering | `expense_marketing` |
| `6530` | Redovisningstjänster | `expense_professional_services` |
| `6570` | Bankavgifter | `expense_bank_fees` / `expense_card_fees` |
| `6900` | Övriga kostnader | Default fallback for uncategorized |
| `6991` | Övriga avdragsgilla kostnader | `expense_other` / `expense_education` (EF) |

## Class 7 — Personnel & FX

| Account | Name | Usage |
|---------|------|-------|
| `7510` | Arbetsgivaravgifter | Employer contributions 31.42% |
| `7610` | Utbildning | Education (aktiebolag only) |
| `7960` | Valutakursförluster | FX losses / `expense_currency_exchange` |

## VAT-Exempt Expense Categories

These categories never get input VAT deduction (`2641`):
- `expense_bank_fees`
- `expense_card_fees`
- `expense_currency_exchange`

## Capitalization Threshold

Equipment above 29,400 SEK uses `capitalized_debit_account` instead of normal expense. Half-year rule for 2024.
