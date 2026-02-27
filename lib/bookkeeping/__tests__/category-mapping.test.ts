import { describe, it, expect } from 'vitest'
import {
  getCategoryAccountMapping,
  getExpenseAccountForCategory,
  getDefaultAccountForCategory,
  getDefaultVatTreatmentForCategory,
  buildMappingResultFromCategory,
} from '../category-mapping'
import { makeTransaction } from '@/tests/helpers'
import type { TransactionCategory } from '@/types'

describe('getCategoryAccountMapping', () => {
  describe('income_products uses correct account', () => {
    it('maps income_products to 3001 (25% moms)', () => {
      const result = getCategoryAccountMapping('income_products', 1000, true)
      expect(result.creditAccount).toBe('3001')
    })

    it('income_products matches income_services account', () => {
      const products = getCategoryAccountMapping('income_products', 1000, true)
      const services = getCategoryAccountMapping('income_services', 1000, true)
      expect(products.creditAccount).toBe(services.creditAccount)
    })
  })

  describe('expense_office maps to 6110 (Kontorsförbrukning)', () => {
    it('maps expense_office to 6110 (not 5010 Lokalhyra)', () => {
      const result = getCategoryAccountMapping('expense_office', -500, true)
      expect(result.debitAccount).toBe('6110')
    })
  })

  describe('expense_education entity-type-aware', () => {
    it('defaults to 6991 for enskild_firma', () => {
      const result = getCategoryAccountMapping('expense_education', -500, true, 'enskild_firma')
      expect(result.debitAccount).toBe('6991')
    })

    it('uses 7610 for aktiebolag', () => {
      const result = getCategoryAccountMapping('expense_education', -500, true, 'aktiebolag')
      expect(result.debitAccount).toBe('7610')
    })

    it('defaults to 6991 when no entityType provided', () => {
      const result = getCategoryAccountMapping('expense_education', -500, true)
      expect(result.debitAccount).toBe('6991')
    })
  })
})

describe('getExpenseAccountForCategory', () => {
  it('returns null for non-expense categories', () => {
    expect(getExpenseAccountForCategory('income_services')).toBeNull()
  })

  it('returns correct accounts for expense categories', () => {
    expect(getExpenseAccountForCategory('expense_equipment')).toBe('5410')
    expect(getExpenseAccountForCategory('expense_office')).toBe('6110')
    expect(getExpenseAccountForCategory('expense_bank_fees')).toBe('6570')
  })
})

describe('getDefaultAccountForCategory', () => {
  it('returns expense account for expense categories', () => {
    expect(getDefaultAccountForCategory('expense_equipment')).toBe('5410')
    expect(getDefaultAccountForCategory('expense_software')).toBe('5420')
    expect(getDefaultAccountForCategory('expense_travel')).toBe('5800')
    expect(getDefaultAccountForCategory('expense_office')).toBe('6110')
    expect(getDefaultAccountForCategory('expense_bank_fees')).toBe('6570')
  })

  it('returns income account for income categories', () => {
    expect(getDefaultAccountForCategory('income_services')).toBe('3001')
    expect(getDefaultAccountForCategory('income_products')).toBe('3001')
    expect(getDefaultAccountForCategory('income_other')).toBe('3900')
  })

  it('returns private account for enskild firma', () => {
    expect(getDefaultAccountForCategory('private', 'enskild_firma')).toBe('2013')
  })

  it('returns private account for aktiebolag', () => {
    expect(getDefaultAccountForCategory('private', 'aktiebolag')).toBe('2893')
  })

  it('returns entity-specific education account', () => {
    expect(getDefaultAccountForCategory('expense_education', 'enskild_firma')).toBe('6991')
    expect(getDefaultAccountForCategory('expense_education', 'aktiebolag')).toBe('7610')
  })

  it('returns fallback for uncategorized', () => {
    expect(getDefaultAccountForCategory('uncategorized')).toBe('6991')
  })
})

describe('buildMappingResultFromCategory', () => {
  describe('reverse charge handling', () => {
    it('generates fiktiv moms lines for reverse charge expense', () => {
      const tx = makeTransaction({ amount: -1000 })
      const result = buildMappingResultFromCategory('expense_software', tx, true, 'enskild_firma', 'reverse_charge')

      expect(result.vat_lines).toHaveLength(2)

      const debitLine = result.vat_lines.find((l) => l.account_number === '2645')
      expect(debitLine).toBeDefined()
      expect(debitLine!.debit_amount).toBe(250)
      expect(debitLine!.credit_amount).toBe(0)

      const creditLine = result.vat_lines.find((l) => l.account_number === '2614')
      expect(creditLine).toBeDefined()
      expect(creditLine!.debit_amount).toBe(0)
      expect(creditLine!.credit_amount).toBe(250)
    })

    it('does not generate regular input VAT (2641) for reverse charge', () => {
      const tx = makeTransaction({ amount: -1000 })
      const result = buildMappingResultFromCategory('expense_equipment', tx, true, 'enskild_firma', 'reverse_charge')

      const hasRegularVat = result.vat_lines.some((l) => l.account_number === '2641')
      expect(hasRegularVat).toBe(false)
    })

    it('does not generate VAT lines for reverse charge on income', () => {
      const tx = makeTransaction({ amount: 1000 })
      const result = buildMappingResultFromCategory('income_services', tx, true, 'enskild_firma', 'reverse_charge')

      expect(result.vat_lines).toHaveLength(0)
    })

    it('does not generate VAT lines for reverse charge on private transactions', () => {
      const tx = makeTransaction({ amount: -1000 })
      const result = buildMappingResultFromCategory('expense_software', tx, false, 'enskild_firma', 'reverse_charge')

      expect(result.vat_lines).toHaveLength(0)
    })
  })
})

describe('buildMappingResultFromCategory returns non-empty accounts', () => {
  const allCategories: TransactionCategory[] = [
    'income_services',
    'income_products',
    'income_other',
    'expense_equipment',
    'expense_software',
    'expense_travel',
    'expense_office',
    'expense_marketing',
    'expense_professional_services',
    'expense_education',
    'expense_bank_fees',
    'expense_card_fees',
    'expense_currency_exchange',
    'expense_other',
    'private',
    'uncategorized',
  ]

  it.each(allCategories)('returns non-empty debit_account and credit_account for "%s"', (category) => {
    const tx = makeTransaction({ amount: category.startsWith('income') ? 1000 : -1000 })
    const isBusiness = category !== 'private'
    const result = buildMappingResultFromCategory(category, tx, isBusiness)

    expect(result.debit_account).toBeTruthy()
    expect(result.credit_account).toBeTruthy()
  })
})

describe('getDefaultVatTreatmentForCategory', () => {
  it('returns standard_25 for regular expense categories', () => {
    expect(getDefaultVatTreatmentForCategory('expense_equipment')).toBe('standard_25')
    expect(getDefaultVatTreatmentForCategory('expense_software')).toBe('standard_25')
    expect(getDefaultVatTreatmentForCategory('expense_travel')).toBe('standard_25')
  })

  it('returns standard_25 for income categories', () => {
    expect(getDefaultVatTreatmentForCategory('income_services')).toBe('standard_25')
    expect(getDefaultVatTreatmentForCategory('income_products')).toBe('standard_25')
  })

  it('returns null for VAT-exempt categories', () => {
    expect(getDefaultVatTreatmentForCategory('expense_bank_fees')).toBeNull()
    expect(getDefaultVatTreatmentForCategory('expense_card_fees')).toBeNull()
    expect(getDefaultVatTreatmentForCategory('expense_currency_exchange')).toBeNull()
  })

  it('returns null for private transactions', () => {
    expect(getDefaultVatTreatmentForCategory('private')).toBeNull()
  })

  it('returns null for uncategorized', () => {
    expect(getDefaultVatTreatmentForCategory('uncategorized')).toBeNull()
  })
})
