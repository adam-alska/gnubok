import { describe, it, expect } from 'vitest'
import {
  getCategoryAccountMapping,
  getExpenseAccountForCategory,
  getDefaultAccountForCategory,
  getDefaultVatTreatmentForCategory,
} from '../category-mapping'

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
    expect(getExpenseAccountForCategory('expense_bank_fees')).toBe('6570')
  })
})

describe('getDefaultAccountForCategory', () => {
  it('returns expense account for expense categories', () => {
    expect(getDefaultAccountForCategory('expense_equipment')).toBe('5410')
    expect(getDefaultAccountForCategory('expense_software')).toBe('5420')
    expect(getDefaultAccountForCategory('expense_travel')).toBe('5800')
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
