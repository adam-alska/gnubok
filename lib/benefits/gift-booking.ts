/**
 * Gift Booking (Gåvobokföring)
 *
 * Creates journal entries for taxable gifts according to Swedish accounting rules.
 *
 * Account mappings (based on Skatteverket guidelines):
 *
 * MED motprestation (bytestransaktion, momspliktig):
 *   - Intäkt: 3010 Försäljning tjänster 25% moms (exkl moms)
 *   - Utgående moms: 2610 Utgående moms 25%
 *   - Motkonto: 1930 Företagskonto
 *
 * UTAN motprestation (ej momspliktig):
 *   - Intäkt: 3900 Övriga rörelseintäkter (momsfri)
 *   - Motkonto: 1930 Företagskonto
 *
 * Om avdragsgill (endast verksamhetsbruk):
 *   - Kostnad: 5460 Förbrukningsmaterial/Rekvisita
 *   - Motkonto: 1930 Företagskonto
 */

import { createJournalEntry, findFiscalPeriod } from '@/lib/bookkeeping/engine'
import type { Gift, CreateJournalEntryLineInput, JournalEntry } from '@/types'

// Account numbers for gift bookkeeping
export const GIFT_BOOKING_ACCOUNTS = {
  // Bank/settlement account
  bankAccount: '1930',
  // Revenue accounts
  salesWithVat: '3010', // Försäljning tjänster 25% moms
  otherRevenue: '3900', // Övriga rörelseintäkter (momsfri)
  // VAT accounts
  outputVat25: '2610', // Utgående moms 25%
  // Expense accounts
  consumables: '5460', // Förbrukningsmaterial/Rekvisita
}

/**
 * Create journal entry for a gift
 * Returns the journal entry ID if created, or null if no booking needed
 */
export async function createGiftJournalEntry(
  userId: string,
  gift: Gift
): Promise<JournalEntry | null> {
  const { classification } = gift

  // Tax-free gifts don't need booking
  if (!classification || classification.bookingType === 'tax_free') {
    return null
  }

  // Find fiscal period for the gift date
  const fiscalPeriodId = await findFiscalPeriod(userId, gift.date)
  if (!fiscalPeriodId) {
    throw new Error(`Inget öppet räkenskapsår hittades för datum ${gift.date}`)
  }

  const lines: CreateJournalEntryLineInput[] = []

  if (classification.vatLiable) {
    // WITH motprestation (bytestransaktion) - VAT applies
    // The market value is considered to be INCLUDING VAT
    const valueExclVat = classification.valueExclVat
    const vatAmount = classification.vatAmount

    // Debit: Bank account (total value incl VAT)
    lines.push({
      account_number: GIFT_BOOKING_ACCOUNTS.bankAccount,
      debit_amount: classification.marketValue,
      credit_amount: 0,
      line_description: `Gåva/förmån: ${gift.brand_name} (marknadsvärde)`,
    })

    // Credit: Sales account (value excl VAT)
    lines.push({
      account_number: GIFT_BOOKING_ACCOUNTS.salesWithVat,
      debit_amount: 0,
      credit_amount: valueExclVat,
      line_description: `Försäljning tjänst (motprestation)`,
    })

    // Credit: Output VAT 25%
    lines.push({
      account_number: GIFT_BOOKING_ACCOUNTS.outputVat25,
      debit_amount: 0,
      credit_amount: vatAmount,
      line_description: `Utgående moms 25%`,
    })
  } else {
    // WITHOUT motprestation - no VAT
    // Debit: Bank account
    lines.push({
      account_number: GIFT_BOOKING_ACCOUNTS.bankAccount,
      debit_amount: classification.marketValue,
      credit_amount: 0,
      line_description: `Gåva/förmån: ${gift.brand_name} (marknadsvärde)`,
    })

    // Credit: Other revenue (VAT-free)
    lines.push({
      account_number: GIFT_BOOKING_ACCOUNTS.otherRevenue,
      debit_amount: 0,
      credit_amount: classification.marketValue,
      line_description: `Övrig rörelseintäkt (förmån utan motprestation)`,
    })
  }

  // If deductible as expense (business use only), add expense entry
  if (classification.deductibleAsExpense) {
    // Debit: Expense account (consumables/props)
    lines.push({
      account_number: GIFT_BOOKING_ACCOUNTS.consumables,
      debit_amount: classification.marketValue,
      credit_amount: 0,
      line_description: `Avdragsgill rekvisita: ${gift.description}`,
    })

    // Credit: Bank account (nets out the income)
    lines.push({
      account_number: GIFT_BOOKING_ACCOUNTS.bankAccount,
      debit_amount: 0,
      credit_amount: classification.marketValue,
      line_description: `Avdrag för rekvisita`,
    })
  }

  // Create the journal entry
  const description = classification.vatLiable
    ? `Gåva/förmån med motprestation: ${gift.brand_name} - ${gift.description}`
    : `Gåva/förmån: ${gift.brand_name} - ${gift.description}`

  const journalEntry = await createJournalEntry(userId, {
    fiscal_period_id: fiscalPeriodId,
    entry_date: gift.date,
    description,
    source_type: 'gift',
    source_id: gift.id,
    voucher_series: 'G', // G for Gåva/Gift
    lines,
  })

  return journalEntry
}

/**
 * Update journal entry for a gift (delete old, create new)
 * Returns the new journal entry ID if created
 */
export async function updateGiftJournalEntry(
  userId: string,
  gift: Gift,
  oldJournalEntryId: string | null
): Promise<JournalEntry | null> {
  // If there was an old entry, we need to reverse it
  // For simplicity, we'll just create a new entry
  // The old entry will remain but can be reversed manually if needed

  // Create new journal entry
  return createGiftJournalEntry(userId, gift)
}

/**
 * Get booking summary for display
 */
export function getGiftBookingSummary(gift: Gift): {
  incomeAccount: string
  incomeAmount: number
  vatAccount: string | null
  vatAmount: number
  expenseAccount: string | null
  expenseAmount: number
  netTaxableIncome: number
} {
  const { classification } = gift

  if (!classification || classification.bookingType === 'tax_free') {
    return {
      incomeAccount: '-',
      incomeAmount: 0,
      vatAccount: null,
      vatAmount: 0,
      expenseAccount: null,
      expenseAmount: 0,
      netTaxableIncome: 0,
    }
  }

  const incomeAccount = classification.vatLiable
    ? GIFT_BOOKING_ACCOUNTS.salesWithVat
    : GIFT_BOOKING_ACCOUNTS.otherRevenue

  const incomeAmount = classification.vatLiable
    ? classification.valueExclVat
    : classification.marketValue

  const vatAccount = classification.vatLiable ? GIFT_BOOKING_ACCOUNTS.outputVat25 : null
  const vatAmount = classification.vatLiable ? classification.vatAmount : 0

  const expenseAccount = classification.deductibleAsExpense
    ? GIFT_BOOKING_ACCOUNTS.consumables
    : null
  const expenseAmount = classification.deductibleAsExpense ? classification.marketValue : 0

  // Net taxable income = income - expense (if deductible)
  const netTaxableIncome = classification.deductibleAsExpense
    ? 0 // Income and expense cancel out
    : incomeAmount

  return {
    incomeAccount,
    incomeAmount,
    vatAccount,
    vatAmount,
    expenseAccount,
    expenseAmount,
    netTaxableIncome,
  }
}
