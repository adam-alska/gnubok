import type { BookingTemplateCategory, BookingTemplateLibraryLine } from '@/types'
import type { FormLine } from '@/components/bookkeeping/JournalEntryForm'

/**
 * Category labels in Swedish for UI display.
 */
export const TEMPLATE_CATEGORY_LABELS: Record<BookingTemplateCategory, string> = {
  eu_trade: 'EU-handel',
  tax_account: 'Skattekonto',
  private_transfer: 'Egna transaktioner',
  salary: 'Lön',
  representation: 'Representation',
  year_end: 'Bokslut',
  vat: 'Moms',
  financial: 'Bank & finans',
  other: 'Övrigt',
}

/**
 * Convert a template's line pattern + total amount into form lines
 * ready for the JournalEntryForm.
 *
 * The algorithm:
 *   1. VAT lines: amount = totalAmount × vat_rate / (1 + vat_rate)
 *   2. Settlement lines: amount = totalAmount (the full payment)
 *   3. Business lines: amount = totalAmount × ratio (cost/revenue net of VAT handled separately)
 *
 * For simple two-line templates (no VAT), the ratio is typically 1.0
 * on both sides and totalAmount is used directly.
 */
export function applyTemplate(
  lines: BookingTemplateLibraryLine[],
  totalAmount: number,
): FormLine[] {
  const result: FormLine[] = []

  for (const line of lines) {
    let amount = 0

    if (line.type === 'vat' && line.vat_rate) {
      // VAT calculated on the total inclusive amount
      amount = Math.round(totalAmount * line.vat_rate / (1 + line.vat_rate) * 100) / 100
    } else if (line.type === 'settlement') {
      amount = Math.round(totalAmount * (line.ratio ?? 1) * 100) / 100
    } else {
      // Business lines — use ratio (default 1.0)
      amount = Math.round(totalAmount * (line.ratio ?? 1) * 100) / 100
    }

    result.push({
      account_number: line.account,
      debit_amount: line.side === 'debit' ? amount.toFixed(2) : '',
      credit_amount: line.side === 'credit' ? amount.toFixed(2) : '',
      line_description: line.label,
    })
  }

  return result
}

/**
 * Scope label for displaying where a template comes from.
 */
export function getTemplateScope(template: {
  is_system: boolean
  team_id: string | null
  company_id: string | null
}): 'system' | 'team' | 'company' {
  if (template.is_system) return 'system'
  if (template.team_id) return 'team'
  return 'company'
}

export const SCOPE_LABELS: Record<ReturnType<typeof getTemplateScope>, string> = {
  system: 'Standard',
  team: 'Team',
  company: 'Företag',
}
