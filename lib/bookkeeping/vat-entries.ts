import type { CreateJournalEntryLineInput, VatTreatment } from '@/types'

/**
 * Generate VAT journal entry lines based on VAT treatment
 *
 * Swedish VAT scenarios:
 * - Domestic 25%: Credit 2611 (utgående moms)
 * - Domestic 12%: Credit 2621
 * - Domestic 6%: Credit 2631
 * - Input VAT deduction: Debit 2641 (ingående moms)
 * - EU reverse charge (fiktiv moms): Debit 2645, Credit 2614 (offsetting)
 * - Export (non-EU): No VAT lines
 */

interface VatEntryConfig {
  vatTreatment: VatTreatment
  baseAmount: number // Amount before VAT
  direction: 'sales' | 'purchase'
}

/**
 * Get VAT rate from treatment
 */
export function getVatRate(treatment: VatTreatment): number {
  switch (treatment) {
    case 'standard_25':
      return 0.25
    case 'reduced_12':
      return 0.12
    case 'reduced_6':
      return 0.06
    case 'reverse_charge':
    case 'export':
    case 'exempt':
      return 0
    default:
      return 0.25
  }
}

/**
 * Generate output VAT lines for sales invoices
 * Debit 1510 Kundfordringar [total incl VAT]
 * Credit 30xx Försäljning [subtotal]
 * Credit 26xx Utgående moms [vat_amount]
 */
export function generateSalesVatLines(config: VatEntryConfig): CreateJournalEntryLineInput[] {
  const lines: CreateJournalEntryLineInput[] = []
  const vatRate = getVatRate(config.vatTreatment)

  if (vatRate === 0) return lines

  const vatAmount = Math.round(config.baseAmount * vatRate * 100) / 100

  // Determine the output VAT account
  let vatAccount: string
  switch (config.vatTreatment) {
    case 'standard_25':
      vatAccount = '2611' // Utgående moms försäljning 25%
      break
    case 'reduced_12':
      vatAccount = '2621' // Utgående moms försäljning 12%
      break
    case 'reduced_6':
      vatAccount = '2631' // Utgående moms försäljning 6%
      break
    default:
      return lines
  }

  lines.push({
    account_number: vatAccount,
    debit_amount: 0,
    credit_amount: vatAmount,
    line_description: `Utgående moms ${vatRate * 100}%`,
  })

  return lines
}

/**
 * Generate EU reverse charge lines (fiktiv moms)
 * For purchases from EU: Debit 2645 + Credit 2614 (offsetting entries)
 */
export function generateReverseChargeLines(
  baseAmount: number,
  vatRate: number = 0.25
): CreateJournalEntryLineInput[] {
  const vatAmount = Math.round(baseAmount * vatRate * 100) / 100

  // Determine accounts based on rate
  let outputAccount: string
  switch (vatRate) {
    case 0.25:
      outputAccount = '2614' // Utgående moms omvänd skattskyldighet 25%
      break
    case 0.12:
      outputAccount = '2624' // Utgående moms omvänd skattskyldighet 12%
      break
    case 0.06:
      outputAccount = '2634' // Utgående moms omvänd skattskyldighet 6%
      break
    default:
      outputAccount = '2614'
  }

  return [
    {
      account_number: '2645', // Beräknad ingående moms förvärv utlandet
      debit_amount: vatAmount,
      credit_amount: 0,
      line_description: `Fiktiv ingående moms ${vatRate * 100}% (omvänd skattskyldighet)`,
    },
    {
      account_number: outputAccount,
      debit_amount: 0,
      credit_amount: vatAmount,
      line_description: `Fiktiv utgående moms ${vatRate * 100}% (omvänd skattskyldighet)`,
    },
  ]
}

/**
 * Generate input VAT deduction line for domestic purchases
 * Debit 2641 Ingående moms
 */
export function generateInputVatLine(
  totalAmount: number,
  vatRate: number = 0.25
): CreateJournalEntryLineInput | null {
  if (vatRate === 0) return null

  // Extract VAT from total amount (VAT-inclusive)
  const vatAmount = Math.round((totalAmount * vatRate) / (1 + vatRate) * 100) / 100

  return {
    account_number: '2641', // Debiterad ingående moms
    debit_amount: vatAmount,
    credit_amount: 0,
    line_description: `Ingående moms ${vatRate * 100}%`,
  }
}

/**
 * Calculate the net amount (excl VAT) from a total amount
 */
export function extractNetAmount(totalAmount: number, vatRate: number): number {
  if (vatRate === 0) return totalAmount
  return Math.round((totalAmount / (1 + vatRate)) * 100) / 100
}

/**
 * Calculate VAT amount from a total amount (VAT-inclusive)
 */
export function extractVatAmount(totalAmount: number, vatRate: number): number {
  if (vatRate === 0) return 0
  return Math.round((totalAmount - totalAmount / (1 + vatRate)) * 100) / 100
}
