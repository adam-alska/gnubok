import { describe, it, expect } from 'vitest'
import { generateSRUFile, sruFileToString, validateSRUFile, getSRUFilename } from '../sru-generator'
import type { INK2Declaration } from '../types'

function makeDeclaration(overrides?: Partial<INK2Declaration>): INK2Declaration {
  return {
    fiscalYear: {
      id: 'period-1',
      name: 'Räkenskapsår 2025',
      start: '2025-01-01',
      end: '2025-12-31',
      isClosed: true,
    },
    rutor: {
      '7201': 0, '7202': 50000, '7203': 0,
      '7210': 10000, '7211': 25000, '7212': 100000,
      '7220': 50000, '7221': 20000, '7222': 15000,
      '7230': 30000, '7231': 70000,
      '7310': 500000, '7320': 200000, '7330': 100000,
      '7340': 80000, '7350': 10000, '7360': 5000,
      '7370': -3000, '7380': 0,
    },
    breakdown: {} as INK2Declaration['breakdown'],
    totals: {
      totalAssets: 185000,
      totalEquityLiabilities: 185000,
      operatingResult: 105000,
      resultAfterFinancial: 102000,
    },
    companyInfo: {
      companyName: 'Test AB',
      orgNumber: '556677-8899',
    },
    warnings: [],
    ...overrides,
  }
}

describe('INK2 SRU Generator', () => {
  describe('generateSRUFile', () => {
    it('produces valid SRU file structure', () => {
      const declaration = makeDeclaration()
      const sruFile = generateSRUFile(declaration)
      const validation = validateSRUFile(sruFile)
      expect(validation.isValid).toBe(true)
      expect(validation.errors).toEqual([])
    })

    it('uses #BLANKETT INK2', () => {
      const declaration = makeDeclaration()
      const sruFile = generateSRUFile(declaration)
      const blankettRecord = sruFile.records.find(r => r.fieldCode === 'BLANKETT')
      expect(blankettRecord?.value).toBe('INK2')
    })

    it('includes only non-zero field values', () => {
      const declaration = makeDeclaration()
      const sruFile = generateSRUFile(declaration)
      const uppgiftRecords = sruFile.records.filter(r => r.fieldCode === 'UPPGIFT')

      // 7000 (fiscal year) + non-zero rutor
      // Zero rutor: 7201, 7203, 7380 = 3 zero fields
      // Non-zero: 16 fields
      // Total UPPGIFT records: 1 (fiscal year) + 16 (non-zero values)
      expect(uppgiftRecords).toHaveLength(17)

      // Verify zero fields are excluded
      const fieldCodes = uppgiftRecords.map(r => String(r.value).split(' ')[0])
      expect(fieldCodes).not.toContain('7201')
      expect(fieldCodes).not.toContain('7203')
      expect(fieldCodes).not.toContain('7380')
    })

    it('includes fiscal year as field 7000', () => {
      const declaration = makeDeclaration()
      const sruFile = generateSRUFile(declaration)
      const fiscalYearRecord = sruFile.records.find(
        r => r.fieldCode === 'UPPGIFT' && String(r.value).startsWith('7000')
      )
      expect(fiscalYearRecord).toBeDefined()
      expect(fiscalYearRecord?.value).toBe('7000 20250101-20251231')
    })

    it('handles negative values (financial items)', () => {
      const declaration = makeDeclaration()
      const sruFile = generateSRUFile(declaration)
      const financialRecord = sruFile.records.find(
        r => r.fieldCode === 'UPPGIFT' && String(r.value).startsWith('7370')
      )
      expect(financialRecord?.value).toBe('7370 -3000')
    })

    it('strips dashes from org number', () => {
      const declaration = makeDeclaration()
      const sruFile = generateSRUFile(declaration)
      const identityRecord = sruFile.records.find(r => r.fieldCode === 'IDENTITET')
      expect(identityRecord?.value).toBe('5566778899')
    })
  })

  describe('sruFileToString', () => {
    it('formats records as #FIELD value lines', () => {
      const declaration = makeDeclaration()
      const sruFile = generateSRUFile(declaration)
      const content = sruFileToString(sruFile)

      expect(content).toContain('#BLANKETT INK2')
      expect(content).toContain('#IDENTITET 5566778899')
      expect(content).toContain('#BLANKETTSLUT')
    })

    it('uses CRLF line endings', () => {
      const declaration = makeDeclaration()
      const sruFile = generateSRUFile(declaration)
      const content = sruFileToString(sruFile)
      expect(content).toContain('\r\n')
    })

    it('ends with newline', () => {
      const declaration = makeDeclaration()
      const sruFile = generateSRUFile(declaration)
      const content = sruFileToString(sruFile)
      expect(content.endsWith('\r\n')).toBe(true)
    })
  })

  describe('getSRUFilename', () => {
    it('returns correct filename format', () => {
      const declaration = makeDeclaration()
      expect(getSRUFilename(declaration)).toBe('INK2_5566778899_2025.sru')
    })

    it('handles missing org number', () => {
      const declaration = makeDeclaration({
        companyInfo: { companyName: 'Test AB', orgNumber: null },
      })
      expect(getSRUFilename(declaration)).toBe('INK2_unknown_2025.sru')
    })
  })

  describe('validateSRUFile', () => {
    it('validates a correct SRU file', () => {
      const declaration = makeDeclaration()
      const sruFile = generateSRUFile(declaration)
      const result = validateSRUFile(sruFile)
      expect(result.isValid).toBe(true)
    })

    it('detects missing PRODUKT header', () => {
      const result = validateSRUFile({
        records: [
          { fieldCode: 'BLANKETT', value: 'INK2' },
          { fieldCode: 'BLANKETTSLUT', value: '' },
        ],
        generatedAt: new Date().toISOString(),
      })
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Missing PRODUKT header')
    })

    it('detects wrong blankett type', () => {
      const result = validateSRUFile({
        records: [
          { fieldCode: 'PRODUKT', value: 'KONTROLLUPPGIFTER' },
          { fieldCode: 'BLANKETT', value: 'NE' },
          { fieldCode: 'BLANKETTSLUT', value: '' },
        ],
        generatedAt: new Date().toISOString(),
      })
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Expected BLANKETT INK2, got NE')
    })
  })
})
