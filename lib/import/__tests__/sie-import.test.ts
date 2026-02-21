import { describe, it, expect } from 'vitest'
import { generateImportPreview } from '../sie-import'
import type { ParsedSIEFile, AccountMapping } from '../types'

// --- Helpers ---

function makeParsedFile(overrides?: Partial<ParsedSIEFile>): ParsedSIEFile {
  return {
    header: {
      sieType: 4,
      program: 'TestProg',
      programVersion: '1.0',
      generatedDate: new Date(2024, 0, 1),
      format: 'PC8',
      companyName: 'Test AB',
      orgNumber: '5566778899',
      address: null,
      fiscalYears: [{ yearIndex: 0, start: new Date(2024, 0, 1), end: new Date(2024, 11, 31) }],
      currency: 'SEK',
    },
    accounts: [
      { number: '1510', name: 'Kundfordringar' },
      { number: '1930', name: 'Företagskonto' },
      { number: '2440', name: 'Leverantörsskulder' },
    ],
    openingBalances: [
      { yearIndex: 0, account: '1510', amount: 50000 },
      { yearIndex: 0, account: '1930', amount: 100000 },
      { yearIndex: 0, account: '2440', amount: -150000 },
    ],
    closingBalances: [],
    resultBalances: [],
    vouchers: [
      {
        series: 'A',
        number: 1,
        date: new Date(2024, 0, 15),
        description: 'Faktura 1001',
        lines: [
          { account: '1510', amount: 12500 },
          { account: '3001', amount: -10000 },
          { account: '2611', amount: -2500 },
        ],
      },
    ],
    issues: [],
    stats: {
      totalAccounts: 3,
      totalVouchers: 1,
      totalTransactionLines: 3,
      fiscalYearStart: new Date(2024, 0, 1),
      fiscalYearEnd: new Date(2024, 11, 31),
    },
    ...overrides,
  }
}

function makeMapping(source: string, target: string, confidence: number = 1.0): AccountMapping {
  return {
    sourceAccount: source,
    sourceName: `Account ${source}`,
    targetAccount: target,
    targetName: `Target ${target}`,
    confidence,
    matchType: target ? 'exact' : 'manual',
    isOverride: false,
  }
}

// --- Tests ---

describe('generateImportPreview', () => {
  describe('trial balance from IB', () => {
    it('calculates debit totals from positive IB amounts', () => {
      const parsed = makeParsedFile()
      const mappings = [
        makeMapping('1510', '1510'),
        makeMapping('1930', '1930'),
        makeMapping('2440', '2440'),
      ]
      const preview = generateImportPreview(parsed, mappings)

      // Positive amounts: 50000 + 100000 = 150000
      expect(preview.trialBalance.totalDebit).toBe(150000)
    })

    it('calculates credit totals from negative IB amounts', () => {
      const parsed = makeParsedFile()
      const mappings = [
        makeMapping('1510', '1510'),
        makeMapping('1930', '1930'),
        makeMapping('2440', '2440'),
      ]
      const preview = generateImportPreview(parsed, mappings)

      // Negative amounts: |-150000| = 150000
      expect(preview.trialBalance.totalCredit).toBe(150000)
    })

    it('detects balanced trial balance', () => {
      const parsed = makeParsedFile()
      const mappings = [makeMapping('1510', '1510')]
      const preview = generateImportPreview(parsed, mappings)

      // 150000 debit = 150000 credit
      expect(preview.trialBalance.isBalanced).toBe(true)
    })

    it('detects unbalanced trial balance', () => {
      const parsed = makeParsedFile({
        openingBalances: [
          { yearIndex: 0, account: '1510', amount: 50000 },
          { yearIndex: 0, account: '1930', amount: 100000 },
          // Missing credit side — only 150000 debit, 0 credit
        ],
      })
      const mappings = [makeMapping('1510', '1510')]
      const preview = generateImportPreview(parsed, mappings)

      expect(preview.trialBalance.isBalanced).toBe(false)
    })

    it('handles zero opening balances', () => {
      const parsed = makeParsedFile({ openingBalances: [] })
      const mappings: AccountMapping[] = []
      const preview = generateImportPreview(parsed, mappings)

      expect(preview.trialBalance.totalDebit).toBe(0)
      expect(preview.trialBalance.totalCredit).toBe(0)
      expect(preview.trialBalance.isBalanced).toBe(true)
    })
  })

  describe('company info passthrough', () => {
    it('passes company name', () => {
      const parsed = makeParsedFile()
      const preview = generateImportPreview(parsed, [])
      expect(preview.companyName).toBe('Test AB')
    })

    it('passes org number', () => {
      const parsed = makeParsedFile()
      const preview = generateImportPreview(parsed, [])
      expect(preview.orgNumber).toBe('5566778899')
    })

    it('handles null company info', () => {
      const parsed = makeParsedFile({
        header: {
          ...makeParsedFile().header,
          companyName: null,
          orgNumber: null,
        },
      })
      const preview = generateImportPreview(parsed, [])
      expect(preview.companyName).toBeNull()
      expect(preview.orgNumber).toBeNull()
    })
  })

  describe('mapping status', () => {
    it('reflects mapper output counts', () => {
      const parsed = makeParsedFile()
      const mappings = [
        makeMapping('1510', '1510'),     // mapped
        makeMapping('1930', '1930'),     // mapped
        makeMapping('2440', '', 0),       // unmapped
      ]
      const preview = generateImportPreview(parsed, mappings)

      expect(preview.mappingStatus.total).toBe(3)
      expect(preview.mappingStatus.mapped).toBe(2)
      expect(preview.mappingStatus.unmapped).toBe(1)
    })

    it('reports low confidence mappings', () => {
      const mappings = [
        makeMapping('1510', '1510', 1.0),
        makeMapping('3400', '3001', 0.3), // low confidence
      ]
      const parsed = makeParsedFile()
      const preview = generateImportPreview(parsed, mappings)

      expect(preview.mappingStatus.lowConfidence).toBe(1)
    })
  })

  describe('statistics', () => {
    it('passes account count', () => {
      const parsed = makeParsedFile()
      const preview = generateImportPreview(parsed, [])
      expect(preview.accountCount).toBe(3)
    })

    it('passes voucher count', () => {
      const parsed = makeParsedFile()
      const preview = generateImportPreview(parsed, [])
      expect(preview.voucherCount).toBe(1)
    })

    it('passes transaction line count', () => {
      const parsed = makeParsedFile()
      const preview = generateImportPreview(parsed, [])
      expect(preview.transactionLineCount).toBe(3)
    })
  })

  describe('issues passthrough', () => {
    it('passes parse issues to preview', () => {
      const parsed = makeParsedFile({
        issues: [
          { severity: 'warning', line: 5, message: 'Unknown tag: #FOO', tag: 'FOO' },
          { severity: 'error', line: 10, message: 'Invalid voucher', tag: 'VER' },
        ],
      })
      const preview = generateImportPreview(parsed, [])

      expect(preview.issues).toHaveLength(2)
      expect(preview.issues[0].severity).toBe('warning')
      expect(preview.issues[1].severity).toBe('error')
    })
  })
})
