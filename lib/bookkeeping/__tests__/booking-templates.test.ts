import { describe, it, expect } from 'vitest'
import { makeTransaction } from '@/tests/helpers'
import {
  BOOKING_TEMPLATES,
  getTemplateById,
  getTemplatesByGroup,
  getTemplatesByMcc,
  getTemplateGroups,
  searchTemplates,
  findMatchingTemplates,
  buildMappingResultFromTemplate,
  type BookingTemplate,
} from '../booking-templates'

// ============================================================
// Template Data Integrity
// ============================================================

describe('BOOKING_TEMPLATES data integrity', () => {
  it('has exactly 48 templates', () => {
    expect(BOOKING_TEMPLATES).toHaveLength(48)
  })

  it('all template IDs are unique', () => {
    const ids = BOOKING_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all templates have valid required fields', () => {
    for (const t of BOOKING_TEMPLATES) {
      expect(t.id).toBeTruthy()
      expect(t.name_sv).toBeTruthy()
      expect(t.name_en).toBeTruthy()
      expect(t.group).toBeTruthy()
      expect(['expense', 'income', 'transfer']).toContain(t.direction)
      expect(['all', 'enskild_firma', 'aktiebolag']).toContain(t.entity_applicability)
      expect(t.debit_account).toMatch(/^\d{4}$/)
      expect(t.credit_account).toMatch(/^\d{4}$/)
      expect(['full', 'non_deductible', 'conditional']).toContain(t.deductibility)
      expect(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']).toContain(t.risk_level)
      expect(typeof t.requires_review).toBe('boolean')
      expect(t.impact_score).toBeGreaterThanOrEqual(1)
      expect(t.impact_score).toBeLessThanOrEqual(10)
      expect(t.auto_match_confidence).toBeGreaterThanOrEqual(0.5)
      expect(t.auto_match_confidence).toBeLessThanOrEqual(1.0)
      expect(typeof t.default_private).toBe('boolean')
      expect(t.fallback_category).toBeTruthy()
      expect(t.description_sv).toBeTruthy()
      expect(Array.isArray(t.mcc_codes)).toBe(true)
      expect(Array.isArray(t.keywords)).toBe(true)
      expect(t.keywords.length).toBeGreaterThan(0)
    }
  })

  it('all AB-specific override accounts are valid 4-digit strings', () => {
    for (const t of BOOKING_TEMPLATES) {
      if (t.debit_account_ab) {
        expect(t.debit_account_ab).toMatch(/^\d{4}$/)
      }
      if (t.credit_account_ab) {
        expect(t.credit_account_ab).toMatch(/^\d{4}$/)
      }
    }
  })

  it('vat_rate is consistent with vat_treatment', () => {
    for (const t of BOOKING_TEMPLATES) {
      if (t.vat_treatment === 'standard_25') {
        expect(t.vat_rate).toBe(0.25)
      } else if (t.vat_treatment === 'reduced_12') {
        expect(t.vat_rate).toBe(0.12)
      } else if (t.vat_treatment === 'reduced_6') {
        expect(t.vat_rate).toBe(0.06)
      } else if (t.vat_treatment === 'reverse_charge' || t.vat_treatment === 'export' || t.vat_treatment === 'exempt' || t.vat_treatment === null) {
        expect(t.vat_rate).toBe(0)
      }
    }
  })
})

// ============================================================
// Lookup Functions
// ============================================================

describe('getTemplateById', () => {
  it('returns correct template for known ID', () => {
    const t = getTemplateById('it_saas_subscription')
    expect(t).toBeDefined()
    expect(t!.name_sv).toBe('Programvara / SaaS')
    expect(t!.debit_account).toBe('5420')
  })

  it('returns undefined for unknown ID', () => {
    expect(getTemplateById('nonexistent')).toBeUndefined()
  })
})

describe('getTemplatesByGroup', () => {
  it('returns templates for the premises group', () => {
    const templates = getTemplatesByGroup('premises')
    expect(templates.length).toBeGreaterThan(0)
    for (const t of templates) {
      expect(t.group).toBe('premises')
    }
  })

  it('returns empty array for non-existent group', () => {
    expect(getTemplatesByGroup('nonexistent' as never)).toEqual([])
  })
})

describe('getTemplatesByMcc', () => {
  it('returns templates for MCC 5541 (fuel)', () => {
    const templates = getTemplatesByMcc(5541)
    expect(templates.length).toBeGreaterThan(0)
    expect(templates.some((t) => t.id === 'vehicle_fuel')).toBe(true)
  })

  it('returns empty array for unknown MCC', () => {
    expect(getTemplatesByMcc(9999)).toEqual([])
  })
})

describe('getTemplateGroups', () => {
  it('returns all 17 groups', () => {
    const groups = getTemplateGroups()
    expect(groups).toHaveLength(17)
    for (const g of groups) {
      expect(g.group).toBeTruthy()
      expect(g.label_sv).toBeTruthy()
      expect(g.label_en).toBeTruthy()
      expect(Array.isArray(g.templates)).toBe(true)
    }
  })

  it('every template is in exactly one group', () => {
    const groups = getTemplateGroups()
    const allTemplates = groups.flatMap((g) => g.templates)
    expect(allTemplates).toHaveLength(48)
  })
})

// ============================================================
// Search
// ============================================================

describe('searchTemplates', () => {
  it('finds templates by Swedish name', () => {
    const results = searchTemplates('lokalhyra')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((t) => t.id === 'premises_rent')).toBe(true)
  })

  it('finds templates by English name', () => {
    const results = searchTemplates('software')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((t) => t.id === 'it_saas_subscription')).toBe(true)
  })

  it('finds templates by keywords', () => {
    const results = searchTemplates('spotify')
    expect(results.length).toBeGreaterThan(0)
  })

  it('returns empty for empty query', () => {
    expect(searchTemplates('')).toEqual([])
  })

  it('filters by entity type', () => {
    const results = searchTemplates('pension', 'enskild_firma')
    // Should include EF-specific and 'all', but not AB-only
    for (const t of results) {
      expect(t.entity_applicability).not.toBe('aktiebolag')
    }
  })

  it('supports multi-token search', () => {
    const results = searchTemplates('annonsering marknadsföring')
    expect(results.some((t) => t.id === 'marketing_online_ads')).toBe(true)
  })
})

// ============================================================
// findMatchingTemplates
// ============================================================

describe('findMatchingTemplates', () => {
  it('matches by MCC code with high confidence', () => {
    const tx = makeTransaction({
      amount: -500,
      mcc_code: 5541,
      description: 'Gas station',
      merchant_name: 'OKQ8',
    })
    const matches = findMatchingTemplates(tx)
    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0].template.id).toBe('vehicle_fuel')
    expect(matches[0].confidence).toBeGreaterThan(0.3)
  })

  it('matches by keywords in description', () => {
    const tx = makeTransaction({
      amount: -299,
      description: 'Google Ads campaign',
      merchant_name: 'Google',
    })
    const matches = findMatchingTemplates(tx)
    expect(matches.some((m) => m.template.id === 'marketing_online_ads')).toBe(true)
  })

  it('returns empty for a transaction with no signals', () => {
    const tx = makeTransaction({
      amount: -100,
      description: 'XYZ123ABC',
      mcc_code: null,
      merchant_name: null,
    })
    const matches = findMatchingTemplates(tx)
    expect(matches).toEqual([])
  })

  it('filters by entity type', () => {
    const tx = makeTransaction({
      amount: -5000,
      description: 'Löneutbetalning',
    })
    const matches = findMatchingTemplates(tx, 'enskild_firma')
    // Personnel salary is AB-only, should not appear
    for (const m of matches) {
      expect(m.template.entity_applicability).not.toBe('aktiebolag')
    }
  })

  it('does not match expense templates for positive amounts', () => {
    const tx = makeTransaction({
      amount: 1000,
      description: 'Bensin okq8',
      mcc_code: 5541,
    })
    const matches = findMatchingTemplates(tx)
    // vehicle_fuel is an expense template, should not match positive amount
    expect(matches.every((m) => m.template.direction !== 'expense')).toBe(true)
  })

  it('returns max 10 results', () => {
    const tx = makeTransaction({
      amount: -100,
      description: 'software subscription cloud hosting domain',
      mcc_code: 5817,
    })
    const matches = findMatchingTemplates(tx)
    expect(matches.length).toBeLessThanOrEqual(10)
  })

  it('results are sorted by confidence descending', () => {
    const tx = makeTransaction({
      amount: -999,
      description: 'Google cloud hosting',
      mcc_code: 4816,
    })
    const matches = findMatchingTemplates(tx)
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1].confidence).toBeGreaterThanOrEqual(matches[i].confidence)
    }
  })
})

// ============================================================
// buildMappingResultFromTemplate
// ============================================================

describe('buildMappingResultFromTemplate', () => {
  const getTemplate = (id: string): BookingTemplate => {
    const t = getTemplateById(id)
    if (!t) throw new Error(`Template not found: ${id}`)
    return t
  }

  it('produces valid MappingResult for expense with 25% VAT', () => {
    const template = getTemplate('it_saas_subscription')
    const tx = makeTransaction({ amount: -1250 })
    const result = buildMappingResultFromTemplate(template, tx, 'enskild_firma')

    expect(result.debit_account).toBe('5420')
    expect(result.credit_account).toBe('1930')
    expect(result.template_id).toBe('it_saas_subscription')
    expect(result.rule).toBeNull()
    expect(result.confidence).toBe(1.0)
    expect(result.vat_lines).toHaveLength(1)
    expect(result.vat_lines[0].account_number).toBe('2641')
    expect(result.vat_lines[0].debit_amount).toBe(250) // 1250 * 0.25 / 1.25 = 250
  })

  it('produces valid MappingResult for expense with 12% VAT', () => {
    const template = getTemplate('travel_hotel')
    const tx = makeTransaction({ amount: -1120 })
    const result = buildMappingResultFromTemplate(template, tx, 'enskild_firma')

    expect(result.debit_account).toBe('5820')
    expect(result.vat_lines).toHaveLength(1)
    expect(result.vat_lines[0].account_number).toBe('2641')
    expect(result.vat_lines[0].debit_amount).toBe(120) // 1120 * 0.12 / 1.12 = 120
  })

  it('produces valid MappingResult for expense with 6% VAT', () => {
    const template = getTemplate('travel_transport')
    const tx = makeTransaction({ amount: -530 })
    const result = buildMappingResultFromTemplate(template, tx, 'enskild_firma')

    expect(result.vat_lines).toHaveLength(1)
    expect(result.vat_lines[0].account_number).toBe('2641')
    expect(result.vat_lines[0].debit_amount).toBe(30) // 530 * 0.06 / 1.06 = 30
  })

  it('produces reverse charge lines for EU purchases', () => {
    const template = getTemplate('it_saas_eu')
    const tx = makeTransaction({ amount: -1000 })
    const result = buildMappingResultFromTemplate(template, tx, 'enskild_firma')

    expect(result.vat_lines).toHaveLength(2)
    // Fiktiv ingående moms
    expect(result.vat_lines[0].account_number).toBe('2645')
    expect(result.vat_lines[0].debit_amount).toBe(250)
    // Fiktiv utgående moms
    expect(result.vat_lines[1].account_number).toBe('2614')
    expect(result.vat_lines[1].credit_amount).toBe(250)
  })

  it('produces no VAT lines for exempt expenses', () => {
    const template = getTemplate('premises_rent')
    const tx = makeTransaction({ amount: -10000 })
    const result = buildMappingResultFromTemplate(template, tx, 'enskild_firma')

    expect(result.vat_lines).toHaveLength(0)
  })

  it('produces no VAT lines for non-deductible templates', () => {
    const template = getTemplate('private_withdrawal_ef')
    const tx = makeTransaction({ amount: -5000 })
    const result = buildMappingResultFromTemplate(template, tx, 'enskild_firma')

    expect(result.vat_lines).toHaveLength(0)
    expect(result.default_private).toBe(true)
  })

  it('produces output VAT lines for income with 25% VAT', () => {
    const template = getTemplate('revenue_standard_25')
    const tx = makeTransaction({ amount: 12500 })
    const result = buildMappingResultFromTemplate(template, tx, 'enskild_firma')

    expect(result.debit_account).toBe('1930')
    expect(result.credit_account).toBe('3001')
    expect(result.vat_lines).toHaveLength(1)
    expect(result.vat_lines[0].account_number).toBe('2611')
    expect(result.vat_lines[0].credit_amount).toBe(2500) // 12500 * 0.25 / 1.25 = 2500
  })

  it('produces output VAT lines for income with 12% VAT', () => {
    const template = getTemplate('revenue_reduced_12')
    const tx = makeTransaction({ amount: 1120 })
    const result = buildMappingResultFromTemplate(template, tx, 'enskild_firma')

    expect(result.vat_lines).toHaveLength(1)
    expect(result.vat_lines[0].account_number).toBe('2621')
    expect(result.vat_lines[0].credit_amount).toBe(120)
  })

  it('resolves AB-specific accounts for aktiebolag', () => {
    const template = getTemplate('education_course')
    const tx = makeTransaction({ amount: -5000 })

    const efResult = buildMappingResultFromTemplate(template, tx, 'enskild_firma')
    expect(efResult.debit_account).toBe('6991')

    const abResult = buildMappingResultFromTemplate(template, tx, 'aktiebolag')
    expect(abResult.debit_account).toBe('7610')
  })

  it('resolves AB-specific private account', () => {
    const template = getTemplate('private_expense')
    const tx = makeTransaction({ amount: -300 })

    const efResult = buildMappingResultFromTemplate(template, tx, 'enskild_firma')
    expect(efResult.debit_account).toBe('2013')

    const abResult = buildMappingResultFromTemplate(template, tx, 'aktiebolag')
    expect(abResult.debit_account).toBe('2893')
  })

  it('includes template_id in the MappingResult', () => {
    const template = getTemplate('bank_fees')
    const tx = makeTransaction({ amount: -49 })
    const result = buildMappingResultFromTemplate(template, tx, 'enskild_firma')

    expect(result.template_id).toBe('bank_fees')
    expect(result.rule).toBeNull()
  })

  it('sets description with template name and transaction description', () => {
    const template = getTemplate('vehicle_fuel')
    const tx = makeTransaction({ amount: -800, description: 'OKQ8 tankstation' })
    const result = buildMappingResultFromTemplate(template, tx, 'enskild_firma')

    expect(result.description).toBe('Drivmedel & Laddning: OKQ8 tankstation')
  })
})
