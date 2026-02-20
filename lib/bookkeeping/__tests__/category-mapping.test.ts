import { describe, it, expect } from 'vitest'
import { getCategoryAccountMapping, getExpenseAccountForCategory } from '../category-mapping'

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
