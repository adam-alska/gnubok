import { describe, it, expect } from 'vitest'
import {
  matchSupplier,
  normalizeOrgNumber,
  normalizeVatNumber,
  normalizeBankgiro,
  calculateNameSimilarity,
  normalizeCompanyName,
  levenshteinDistance,
} from '../supplier-matcher'
import { makeSupplier } from '@/tests/helpers'
import type { InvoiceExtractionResult } from '../../types'

function makeExtraction(overrides: Partial<InvoiceExtractionResult['supplier']> = {}): InvoiceExtractionResult {
  return {
    supplier: {
      name: null,
      orgNumber: null,
      vatNumber: null,
      address: null,
      bankgiro: null,
      plusgiro: null,
      ...overrides,
    },
    invoice: {
      invoiceNumber: null,
      invoiceDate: null,
      dueDate: null,
      paymentReference: null,
      currency: 'SEK',
    },
    lineItems: [],
    totals: { subtotal: null, vatAmount: null, total: null },
    vatBreakdown: [],
    confidence: 0.9,
  }
}

describe('Supplier Matcher', () => {
  describe('matchSupplier', () => {
    it('returns null for empty supplier list', () => {
      const result = matchSupplier(
        makeExtraction({ name: 'Test AB' }),
        []
      )
      expect(result).toBeNull()
    })

    it('matches by exact org number (pass 1)', () => {
      const suppliers = [
        makeSupplier({ id: 's1', name: 'Supplier A', org_number: '5599887766' }),
        makeSupplier({ id: 's2', name: 'Supplier B', org_number: '1122334455' }),
      ]

      const result = matchSupplier(
        makeExtraction({ orgNumber: '559988-7766' }),
        suppliers
      )

      expect(result).not.toBeNull()
      expect(result!.supplierId).toBe('s1')
      expect(result!.matchMethod).toBe('org_number')
      expect(result!.confidence).toBe(0.98)
    })

    it('matches by org number with different formatting', () => {
      const suppliers = [
        makeSupplier({ id: 's1', org_number: '556123-4567' }),
      ]

      const result = matchSupplier(
        makeExtraction({ orgNumber: '5561234567' }),
        suppliers
      )

      expect(result).not.toBeNull()
      expect(result!.matchMethod).toBe('org_number')
    })

    it('matches by VAT number (pass 2)', () => {
      const suppliers = [
        makeSupplier({ id: 's1', vat_number: 'SE556123456701' }),
      ]

      const result = matchSupplier(
        makeExtraction({ vatNumber: 'SE 5561 2345 6701' }),
        suppliers
      )

      expect(result).not.toBeNull()
      expect(result!.matchMethod).toBe('vat_number')
      expect(result!.confidence).toBe(0.95)
    })

    it('matches by bankgiro (pass 3)', () => {
      const suppliers = [
        makeSupplier({ id: 's1', bankgiro: '123-4567' }),
      ]

      const result = matchSupplier(
        makeExtraction({ bankgiro: '1234567' }),
        suppliers
      )

      expect(result).not.toBeNull()
      expect(result!.matchMethod).toBe('bankgiro')
      expect(result!.confidence).toBe(0.92)
    })

    it('matches by plusgiro', () => {
      const suppliers = [
        makeSupplier({ id: 's1', plusgiro: '123456-7' }),
      ]

      const result = matchSupplier(
        makeExtraction({ plusgiro: '1234567' }),
        suppliers
      )

      expect(result).not.toBeNull()
      expect(result!.matchMethod).toBe('bankgiro')
    })

    it('matches by fuzzy name (pass 4)', () => {
      const suppliers = [
        makeSupplier({ id: 's1', name: 'Kontorsbolaget AB' }),
        makeSupplier({ id: 's2', name: 'Byggmaterial i Stockholm' }),
      ]

      const result = matchSupplier(
        makeExtraction({ name: 'Kontorsbolaget' }),
        suppliers
      )

      expect(result).not.toBeNull()
      expect(result!.supplierId).toBe('s1')
      expect(result!.matchMethod).toBe('fuzzy_name')
    })

    it('returns null for low-confidence fuzzy name match', () => {
      const suppliers = [
        makeSupplier({ id: 's1', name: 'Completely Different Name AB' }),
      ]

      const result = matchSupplier(
        makeExtraction({ name: 'XYZ Corp' }),
        suppliers
      )

      expect(result).toBeNull()
    })

    it('prefers org number match over name match', () => {
      const suppliers = [
        makeSupplier({ id: 's1', name: 'Kontorsbolaget AB', org_number: '5599887766' }),
      ]

      const result = matchSupplier(
        makeExtraction({ name: 'Kontorsbolaget', orgNumber: '559988-7766' }),
        suppliers
      )

      expect(result!.matchMethod).toBe('org_number')
    })
  })

  describe('normalizeOrgNumber', () => {
    it('strips non-digits', () => {
      expect(normalizeOrgNumber('556123-4567')).toBe('5561234567')
      expect(normalizeOrgNumber('556123 4567')).toBe('5561234567')
    })
  })

  describe('normalizeVatNumber', () => {
    it('uppercases and removes spaces', () => {
      expect(normalizeVatNumber('se 5561234567 01')).toBe('SE556123456701')
    })
  })

  describe('normalizeBankgiro', () => {
    it('strips non-digits', () => {
      expect(normalizeBankgiro('123-4567')).toBe('1234567')
    })
  })

  describe('normalizeCompanyName', () => {
    it('strips AB suffix', () => {
      expect(normalizeCompanyName('Kontorsbolaget AB')).toBe('kontorsbolaget')
    })

    it('strips HB suffix', () => {
      expect(normalizeCompanyName('Bröderna Svensson HB')).toBe('bröderna svensson')
    })

    it('strips Aktiebolag', () => {
      expect(normalizeCompanyName('Test Aktiebolag')).toBe('test')
    })

    it('strips Enskild firma', () => {
      expect(normalizeCompanyName('Test Enskild firma')).toBe('test')
    })

    it('normalizes whitespace', () => {
      expect(normalizeCompanyName('  Multiple   Spaces  ')).toBe('multiple spaces')
    })
  })

  describe('calculateNameSimilarity', () => {
    it('returns 1 for identical names', () => {
      expect(calculateNameSimilarity('Test AB', 'Test AB')).toBe(1)
    })

    it('returns high score when one contains the other', () => {
      // After normalization 'AB' is stripped, so they become identical → 1.0
      expect(calculateNameSimilarity('Kontorsbolaget', 'Kontorsbolaget AB')).toBe(1)
      // With an actual substring relationship (not suffix stripping):
      expect(calculateNameSimilarity('Kontor', 'Kontorsbolaget')).toBe(0.9)
    })

    it('returns 0 for empty strings', () => {
      expect(calculateNameSimilarity('', 'Test')).toBe(0)
      expect(calculateNameSimilarity('Test', '')).toBe(0)
    })
  })

  describe('levenshteinDistance', () => {
    it('returns 0 for identical strings', () => {
      expect(levenshteinDistance('test', 'test')).toBe(0)
    })

    it('calculates correct distance', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3)
    })

    it('handles empty strings', () => {
      expect(levenshteinDistance('', 'abc')).toBe(3)
      expect(levenshteinDistance('abc', '')).toBe(3)
    })
  })
})
