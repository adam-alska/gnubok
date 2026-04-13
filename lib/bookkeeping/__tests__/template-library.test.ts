import { describe, it, expect } from 'vitest'
import { applyTemplate, getTemplateScope, TEMPLATE_CATEGORY_LABELS } from '../template-library'
import type { BookingTemplateLibraryLine } from '@/types'

describe('applyTemplate', () => {
  it('creates simple two-line debit/credit entries', () => {
    const lines: BookingTemplateLibraryLine[] = [
      { account: '1630', label: 'Skattekonto', side: 'debit', type: 'business', ratio: 1.0 },
      { account: '1930', label: 'Företagskonto', side: 'credit', type: 'settlement', ratio: 1.0 },
    ]
    const result = applyTemplate(lines, 10000)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      account_number: '1630',
      debit_amount: '10000.00',
      credit_amount: '',
      line_description: 'Skattekonto',
    })
    expect(result[1]).toEqual({
      account_number: '1930',
      debit_amount: '',
      credit_amount: '10000.00',
      line_description: 'Företagskonto',
    })
  })

  it('calculates VAT correctly for reverse charge (EU purchase)', () => {
    const lines: BookingTemplateLibraryLine[] = [
      { account: '4010', label: 'Varuinköp', side: 'debit', type: 'business', ratio: 1.0 },
      { account: '2614', label: 'Utgående moms', side: 'credit', type: 'vat', vat_rate: 0.25 },
      { account: '2645', label: 'Ingående moms', side: 'debit', type: 'vat', vat_rate: 0.25 },
      { account: '1930', label: 'Företagskonto', side: 'credit', type: 'settlement', ratio: 1.0 },
    ]
    // Total payment is 10000 SEK (no VAT on the payment itself for reverse charge)
    const result = applyTemplate(lines, 10000)
    expect(result).toHaveLength(4)
    // Business line = 10000 * 1.0
    expect(result[0].debit_amount).toBe('10000.00')
    // VAT = 10000 * 0.25 / (1 + 0.25) = 2000
    expect(result[1].credit_amount).toBe('2000.00')
    expect(result[2].debit_amount).toBe('2000.00')
    // Settlement = 10000
    expect(result[3].credit_amount).toBe('10000.00')
  })

  it('handles representation with 25% input VAT', () => {
    const lines: BookingTemplateLibraryLine[] = [
      { account: '6072', label: 'Representation', side: 'debit', type: 'business', ratio: 1.0 },
      { account: '2641', label: 'Ingående moms', side: 'debit', type: 'vat', vat_rate: 0.25 },
      { account: '1930', label: 'Företagskonto', side: 'credit', type: 'settlement', ratio: 1.0 },
    ]
    // Total paid = 1250 (1000 + 250 VAT)
    const result = applyTemplate(lines, 1250)
    expect(result).toHaveLength(3)
    // Business = 1250 (the representation cost at full ratio)
    expect(result[0].debit_amount).toBe('1250.00')
    // VAT = 1250 * 0.25 / 1.25 = 250
    expect(result[1].debit_amount).toBe('250.00')
    // Settlement = 1250
    expect(result[2].credit_amount).toBe('1250.00')
  })

  it('rounds monetary values to 2 decimal places', () => {
    const lines: BookingTemplateLibraryLine[] = [
      { account: '4010', label: 'Varuinköp', side: 'debit', type: 'business', ratio: 1.0 },
      { account: '2641', label: 'Ingående moms', side: 'debit', type: 'vat', vat_rate: 0.25 },
      { account: '1930', label: 'Bank', side: 'credit', type: 'settlement', ratio: 1.0 },
    ]
    // 333.33 should produce clean rounding
    const result = applyTemplate(lines, 333.33)
    expect(result[0].debit_amount).toBe('333.33')
    // 333.33 * 0.25 / 1.25 = 66.666 → 66.67
    expect(result[1].debit_amount).toBe('66.67')
    expect(result[2].credit_amount).toBe('333.33')
  })
})

describe('getTemplateScope', () => {
  it('identifies system templates', () => {
    expect(getTemplateScope({ is_system: true, team_id: null, company_id: null })).toBe('system')
  })

  it('identifies team templates', () => {
    expect(getTemplateScope({ is_system: false, team_id: 'team-1', company_id: null })).toBe('team')
  })

  it('identifies company templates', () => {
    expect(getTemplateScope({ is_system: false, team_id: null, company_id: 'comp-1' })).toBe('company')
  })
})

describe('TEMPLATE_CATEGORY_LABELS', () => {
  it('has labels for all categories', () => {
    expect(Object.keys(TEMPLATE_CATEGORY_LABELS)).toHaveLength(9)
    expect(TEMPLATE_CATEGORY_LABELS.eu_trade).toBe('EU-handel')
    expect(TEMPLATE_CATEGORY_LABELS.tax_account).toBe('Skattekonto')
  })
})
