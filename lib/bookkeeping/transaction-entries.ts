import { createJournalEntry, findFiscalPeriod } from './engine'
import { generateInputVatLine, generateReverseChargeLines, extractNetAmount, extractVatAmount } from './vat-entries'
import type {
  CreateJournalEntryInput,
  CreateJournalEntryLineInput,
  JournalEntry,
  MappingResult,
  Transaction,
} from '@/types'

/**
 * Create a journal entry from a bank transaction using mapping engine result
 *
 * Standard expense pattern (domestic purchase with 25% VAT):
 *   Debit  5xxx/6xxx Expense account  [net amount]
 *   Debit  2641 Ingående moms         [VAT amount]
 *   Credit 1930 Företagskonto          [total]
 *
 * Standard expense pattern (no VAT deduction):
 *   Debit  5xxx/6xxx Expense account  [total]
 *   Credit 1930 Företagskonto          [total]
 *
 * Private expense pattern:
 *   Debit  2013 Eget uttag            [total]
 *   Credit 1930 Företagskonto          [total]
 *
 * EU reverse charge purchase pattern:
 *   Debit  5xxx/6xxx Expense account  [total]
 *   Debit  2645 Beräknad ingående moms [fiktiv VAT]
 *   Credit 2614 Utgående moms omvänd   [fiktiv VAT]
 *   Credit 1930 Företagskonto          [total]
 *
 * Income pattern:
 *   Debit  1930 Företagskonto          [total]
 *   Credit 3xxx Revenue account        [total]
 */
export async function createTransactionJournalEntry(
  userId: string,
  transaction: Transaction,
  mappingResult: MappingResult
): Promise<JournalEntry | null> {
  const fiscalPeriodId = await findFiscalPeriod(userId, transaction.date)
  if (!fiscalPeriodId) {
    console.warn('No open fiscal period found for transaction date:', transaction.date)
    return null
  }

  const absAmount = Math.abs(transaction.amount)
  const isExpense = transaction.amount < 0
  const lines: CreateJournalEntryLineInput[] = []

  if (mappingResult.default_private) {
    // Private expense
    lines.push(
      {
        account_number: '2013', // Övriga egna uttag
        debit_amount: absAmount,
        credit_amount: 0,
        line_description: `Privat: ${transaction.description}`,
      },
      {
        account_number: '1930', // Företagskonto
        debit_amount: 0,
        credit_amount: absAmount,
        line_description: transaction.description,
      }
    )
  } else if (isExpense) {
    // Business expense
    const debitAccount = mappingResult.debit_account
    const creditAccount = mappingResult.credit_account || '1930'

    if (mappingResult.vat_lines.length > 0) {
      // Has VAT handling (reverse charge or input VAT)
      for (const vatLine of mappingResult.vat_lines) {
        lines.push({
          account_number: vatLine.account_number,
          debit_amount: vatLine.debit_amount,
          credit_amount: vatLine.credit_amount,
          line_description: vatLine.description,
        })
      }

      // Expense account gets the net amount (total minus VAT if applicable)
      const vatDebit = mappingResult.vat_lines
        .filter((l) => l.debit_amount > 0 && l.account_number === '2641')
        .reduce((sum, l) => sum + l.debit_amount, 0)
      // Round to 2 decimal places to avoid floating point issues
      const netAmount = Math.round((absAmount - vatDebit) * 100) / 100

      lines.push({
        account_number: debitAccount,
        debit_amount: netAmount,
        credit_amount: 0,
        line_description: transaction.description,
      })
    } else {
      // No VAT handling - debit full amount to expense account
      lines.push({
        account_number: debitAccount,
        debit_amount: absAmount,
        credit_amount: 0,
        line_description: transaction.description,
      })
    }

    // Credit bank account
    lines.push({
      account_number: creditAccount,
      debit_amount: 0,
      credit_amount: absAmount,
      line_description: transaction.description,
    })
  } else {
    // Income
    const debitAccount = mappingResult.debit_account || '1930'
    const creditAccount = mappingResult.credit_account

    lines.push(
      {
        account_number: debitAccount,
        debit_amount: absAmount,
        credit_amount: 0,
        line_description: transaction.description,
      },
      {
        account_number: creditAccount,
        debit_amount: 0,
        credit_amount: absAmount,
        line_description: transaction.description,
      }
    )
  }

  const input: CreateJournalEntryInput = {
    fiscal_period_id: fiscalPeriodId,
    entry_date: transaction.date,
    description: transaction.description,
    source_type: 'bank_transaction',
    source_id: transaction.id,
    lines,
  }

  return createJournalEntry(userId, input)
}

/**
 * Create a standard domestic expense entry with input VAT deduction
 */
export function buildDomesticExpenseLines(
  amount: number,
  expenseAccount: string,
  description: string,
  vatRate: number = 0.25
): CreateJournalEntryLineInput[] {
  const absAmount = Math.abs(amount)
  const lines: CreateJournalEntryLineInput[] = []

  if (vatRate > 0) {
    const vatAmount = extractVatAmount(absAmount, vatRate)
    const netAmount = extractNetAmount(absAmount, vatRate)

    lines.push(
      {
        account_number: expenseAccount,
        debit_amount: netAmount,
        credit_amount: 0,
        line_description: description,
      },
      {
        account_number: '2641', // Ingående moms
        debit_amount: vatAmount,
        credit_amount: 0,
        line_description: `Ingående moms ${vatRate * 100}%`,
      },
      {
        account_number: '1930', // Företagskonto
        debit_amount: 0,
        credit_amount: absAmount,
        line_description: description,
      }
    )
  } else {
    lines.push(
      {
        account_number: expenseAccount,
        debit_amount: absAmount,
        credit_amount: 0,
        line_description: description,
      },
      {
        account_number: '1930',
        debit_amount: 0,
        credit_amount: absAmount,
        line_description: description,
      }
    )
  }

  return lines
}
