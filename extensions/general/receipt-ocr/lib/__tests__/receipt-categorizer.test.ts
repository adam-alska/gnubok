import { describe, it, expect } from 'vitest'
import {
  mapSuggestedCategory,
  getBASAccount,
  categorizeLineItem,
  processLineItems,
  calculateReceiptSplit,
  getDefaultClassification,
} from '../receipt-categorizer'
import type { ExtractedLineItem } from '@/types'

describe('mapSuggestedCategory', () => {
  it('maps AI categories to TransactionCategory', () => {
    expect(mapSuggestedCategory('equipment')).toBe('expense_equipment')
    expect(mapSuggestedCategory('software')).toBe('expense_software')
    expect(mapSuggestedCategory('travel')).toBe('expense_travel')
    expect(mapSuggestedCategory('office')).toBe('expense_office')
    expect(mapSuggestedCategory('marketing')).toBe('expense_marketing')
    expect(mapSuggestedCategory('professional_services')).toBe('expense_professional_services')
    expect(mapSuggestedCategory('education')).toBe('expense_education')
    expect(mapSuggestedCategory('other')).toBe('expense_other')
  })

  it('returns null for unknown categories', () => {
    expect(mapSuggestedCategory('nonexistent')).toBeNull()
    expect(mapSuggestedCategory(null)).toBeNull()
  })
})

describe('getBASAccount', () => {
  it('returns correct BAS account per category', () => {
    expect(getBASAccount('expense_equipment')).toBe('5410')
    expect(getBASAccount('expense_software')).toBe('5420')
    expect(getBASAccount('expense_travel')).toBe('5800')
    expect(getBASAccount('expense_office')).toBe('5010')
    expect(getBASAccount('expense_marketing')).toBe('5910')
    expect(getBASAccount('expense_professional_services')).toBe('6530')
    expect(getBASAccount('expense_education')).toBe('6991')
    expect(getBASAccount('expense_bank_fees')).toBe('6570')
    expect(getBASAccount('income_services')).toBe('3001')
  })
})

describe('categorizeLineItem', () => {
  it('keyword patterns match Swedish terms — dator → expense_equipment', () => {
    const result = categorizeLineItem('MacBook Pro dator')
    expect(result.category).toBe('expense_equipment')
    expect(result.confidence).toBe(0.7)
  })

  it('matches software patterns', () => {
    const result = categorizeLineItem('Adobe Creative Cloud prenumeration')
    expect(result.category).toBe('expense_software')
  })

  it('matches travel patterns', () => {
    const result = categorizeLineItem('SJ tåg Stockholm-Malmö')
    expect(result.category).toBe('expense_travel')
  })

  it('returns null category for unrecognized descriptions', () => {
    const result = categorizeLineItem('xyzzy foobarbaz')
    expect(result.category).toBeNull()
    expect(result.confidence).toBe(0)
  })
})

describe('processLineItems', () => {
  it('prefers AI suggestion over pattern match', () => {
    const items: ExtractedLineItem[] = [
      {
        description: 'MacBook Pro dator', // pattern → equipment
        quantity: 1,
        unitPrice: 15000,
        lineTotal: 15000,
        vatRate: 25,
        suggestedCategory: 'software', // AI says software
        confidence: 0.9,
      },
    ]

    const result = processLineItems(items)
    expect(result[0].category).toBe('expense_software') // AI wins
    expect(result[0].basAccount).toBe('5420')
  })

  it('falls back to pattern match when no AI suggestion', () => {
    const items: ExtractedLineItem[] = [
      {
        description: 'MacBook Pro dator',
        quantity: 1,
        unitPrice: 15000,
        lineTotal: 15000,
        vatRate: 25,
        suggestedCategory: null,
      },
    ]

    const result = processLineItems(items)
    expect(result[0].category).toBe('expense_equipment') // pattern match
    expect(result[0].basAccount).toBe('5410')
  })
})

describe('calculateReceiptSplit', () => {
  it('correct business/private/unclassified totals', () => {
    const items = [
      { lineTotal: 100, is_business: true as boolean | null },
      { lineTotal: 50, is_business: false as boolean | null },
      { lineTotal: 25, is_business: null as boolean | null },
    ]

    const result = calculateReceiptSplit(items)
    expect(result.businessTotal).toBe(100)
    expect(result.privateTotal).toBe(50)
    expect(result.unclassifiedTotal).toBe(25)
    // 100 / 175 * 100 = 57.142... → 57.1
    expect(result.businessPercentage).toBeCloseTo(57.1, 1)
  })

  it('handles rounding correctly', () => {
    const items = [
      { lineTotal: 33.333, is_business: true as boolean | null },
      { lineTotal: 66.667, is_business: false as boolean | null },
    ]

    const result = calculateReceiptSplit(items)
    expect(result.businessTotal).toBe(33.33)
    expect(result.privateTotal).toBe(66.67)
  })
})

describe('getDefaultClassification', () => {
  it('Systembolaget defaults to private', () => {
    const result = getDefaultClassification(false, true)
    expect(result.defaultIsBusiness).toBe(false)
    expect(result.requiresReview).toBe(true)
    expect(result.warningMessage).toContain('Alkohol')
  })

  it('restaurant requires review', () => {
    const result = getDefaultClassification(true, false)
    expect(result.defaultIsBusiness).toBeNull()
    expect(result.requiresReview).toBe(true)
    expect(result.warningMessage).toContain('Restaurangbesök')
  })

  it('non-restaurant, non-systembolaget has no warning', () => {
    const result = getDefaultClassification(false, false)
    expect(result.defaultIsBusiness).toBeNull()
    expect(result.requiresReview).toBe(false)
    expect(result.warningMessage).toBeNull()
  })
})
