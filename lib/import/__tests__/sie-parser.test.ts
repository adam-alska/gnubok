import { describe, it, expect } from 'vitest'
import { parseSIEFile, validateSIEFile } from '../sie-parser'

// --- SIE content fixtures ---

const MINIMAL_SIE = [
  '#FLAGGA 0',
  '#SIETYP 4',
  '#PROGRAM "TestProg" "1.0"',
  '#FORMAT PC8',
  '#GEN 20240101',
  '#FNAMN "Test AB"',
  '#ORGNR 5566778899',
  '#VALUTA SEK',
  '#RAR 0 20240101 20241231',
  '#KONTO 1510 "Kundfordringar"',
  '#KONTO 1930 "Företagskonto"',
  '#KONTO 3001 "Försäljning varor 25%"',
].join('\n')

const SIE_WITH_BALANCES = [
  '#FLAGGA 0',
  '#SIETYP 4',
  '#FNAMN "Balans AB"',
  '#ORGNR 1234567890',
  '#RAR 0 20240101 20241231',
  '#KONTO 1510 "Kundfordringar"',
  '#KONTO 1930 "Företagskonto"',
  '#KONTO 2440 "Leverantörsskulder"',
  '#IB 0 1510 50000.00',
  '#IB 0 1930 100000.00',
  '#IB 0 2440 -150000.00',
  '#UB 0 1510 75000.00',
  '#UB 0 1930 125000.00',
  '#UB 0 2440 -200000.00',
].join('\n')

const SIE_WITH_VOUCHERS = [
  '#FLAGGA 0',
  '#SIETYP 4',
  '#FNAMN "Voucher AB"',
  '#RAR 0 20240101 20241231',
  '#KONTO 1510 "Kundfordringar"',
  '#KONTO 1930 "Företagskonto"',
  '#KONTO 3001 "Försäljning"',
  '#KONTO 2611 "Utgående moms 25%"',
  '#VER A 1 20240115 "Faktura 1001"',
  '{',
  '#TRANS 1510 {} 12500.00',
  '#TRANS 3001 {} -10000.00',
  '#TRANS 2611 {} -2500.00',
  '}',
  '#VER A 2 20240220 "Inbetalning faktura 1001"',
  '{',
  '#TRANS 1930 {} 12500.00',
  '#TRANS 1510 {} -12500.00',
  '}',
].join('\n')

const SIE_TYPE_1 = [
  '#FLAGGA 0',
  '#SIETYP 1',
  '#FNAMN "SIE1 AB"',
  '#RAR 0 20240101 20241231',
  '#KONTO 1510 "Kundfordringar"',
  '#IB 0 1510 50000.00',
  '#UB 0 1510 75000.00',
].join('\n')

const SIE_WITH_SRU = [
  '#FLAGGA 0',
  '#SIETYP 4',
  '#FNAMN "SRU AB"',
  '#RAR 0 20240101 20241231',
  '#KONTO 1510 "Kundfordringar"',
  '#SRU 1510 7251',
  '#KONTO 3001 "Försäljning"',
  '#SRU 3001 7410',
].join('\n')

const SIE_UNBALANCED_VOUCHER = [
  '#FLAGGA 0',
  '#SIETYP 4',
  '#FNAMN "Obalanserad AB"',
  '#RAR 0 20240101 20241231',
  '#KONTO 1510 "Kundfordringar"',
  '#KONTO 3001 "Försäljning"',
  '#VER A 1 20240115 "Obalanserad verifikation"',
  '{',
  '#TRANS 1510 {} 10000.00',
  '#TRANS 3001 {} -5000.00',
  '}',
].join('\n')

const SIE_WITH_OBJECT_LIST = [
  '#FLAGGA 0',
  '#SIETYP 4',
  '#FNAMN "Objects AB"',
  '#RAR 0 20240101 20241231',
  '#KONTO 5010 "Lokalhyra"',
  '#KONTO 1930 "Företagskonto"',
  '#VER A 1 20240115 "Hyra januari"',
  '{',
  '#TRANS 5010 {1 "Kontor"} 15000.00',
  '#TRANS 1930 {} -15000.00',
  '}',
].join('\n')

// SIE file where all VER/TRANS fields are quoted (common from some accounting programs)
const SIE_QUOTED_FIELDS = [
  '#FLAGGA 0',
  '#SIETYP 4',
  '#FNAMN "Quoted AB"',
  '#RAR 0 20240101 20241231',
  '#KONTO 1510 "Kundfordringar"',
  '#KONTO 3001 "Försäljning"',
  '#KONTO 2611 "Utgående moms 25%"',
  '#VER "A" "1" "20240115" "Faktura 1001"',
  '{',
  '#TRANS "1510" {} "12500.00"',
  '#TRANS "3001" {} "-10000.00"',
  '#TRANS "2611" {} "-2500.00"',
  '}',
].join('\n')

// SIE file with empty series (some programs use "" for series)
const SIE_EMPTY_SERIES = [
  '#FLAGGA 0',
  '#SIETYP 4',
  '#FNAMN "Empty Series AB"',
  '#RAR 0 20240101 20241231',
  '#KONTO 1930 "Företagskonto"',
  '#KONTO 3001 "Försäljning"',
  '#VER "" 1 20240115 "No series"',
  '{',
  '#TRANS 1930 {} 10000.00',
  '#TRANS 3001 {} -10000.00',
  '}',
].join('\n')

// SIE file with { on same line as #VER
const SIE_BRACE_ON_VER_LINE = [
  '#FLAGGA 0',
  '#SIETYP 4',
  '#FNAMN "Brace AB"',
  '#RAR 0 20240101 20241231',
  '#KONTO 1930 "Företagskonto"',
  '#KONTO 3001 "Försäljning"',
  '#VER A 1 20240115 "Inline brace" {',
  '#TRANS 1930 {} 10000.00',
  '#TRANS 3001 {} -10000.00',
  '}',
].join('\n')

// --- parseSIEFile tests ---

describe('parseSIEFile', () => {
  describe('header parsing', () => {
    it('parses SIE type', () => {
      const result = parseSIEFile(MINIMAL_SIE)
      expect(result.header.sieType).toBe(4)
    })

    it('parses company name from #FNAMN', () => {
      const result = parseSIEFile(MINIMAL_SIE)
      expect(result.header.companyName).toBe('Test AB')
    })

    it('parses org number from #ORGNR', () => {
      const result = parseSIEFile(MINIMAL_SIE)
      expect(result.header.orgNumber).toBe('5566778899')
    })

    it('parses fiscal year from #RAR', () => {
      const result = parseSIEFile(MINIMAL_SIE)
      expect(result.header.fiscalYears).toHaveLength(1)
      expect(result.header.fiscalYears[0].yearIndex).toBe(0)
      expect(result.header.fiscalYears[0].start).toEqual(new Date(2024, 0, 1))
      expect(result.header.fiscalYears[0].end).toEqual(new Date(2024, 11, 31))
    })

    it('parses currency from #VALUTA', () => {
      const result = parseSIEFile(MINIMAL_SIE)
      expect(result.header.currency).toBe('SEK')
    })

    it('defaults currency to SEK when not specified', () => {
      const content = '#FLAGGA 0\n#SIETYP 4\n#FNAMN "Test"\n#RAR 0 20240101 20241231'
      const result = parseSIEFile(content)
      expect(result.header.currency).toBe('SEK')
    })

    it('parses program info', () => {
      const result = parseSIEFile(MINIMAL_SIE)
      expect(result.header.program).toBe('TestProg')
      expect(result.header.programVersion).toBe('1.0')
    })

    it('parses generated date', () => {
      const result = parseSIEFile(MINIMAL_SIE)
      expect(result.header.generatedDate).toEqual(new Date(2024, 0, 1))
    })

    it('parses SIE type 1', () => {
      const result = parseSIEFile(SIE_TYPE_1)
      expect(result.header.sieType).toBe(1)
    })
  })

  describe('account parsing', () => {
    it('parses #KONTO with number and name', () => {
      const result = parseSIEFile(MINIMAL_SIE)
      expect(result.accounts).toHaveLength(3)
      expect(result.accounts[0]).toEqual({ number: '1510', name: 'Kundfordringar' })
      expect(result.accounts[1]).toEqual({ number: '1930', name: 'Företagskonto' })
    })

    it('parses #SRU codes onto accounts', () => {
      const result = parseSIEFile(SIE_WITH_SRU)
      const account1510 = result.accounts.find((a) => a.number === '1510')
      expect(account1510?.sruCode).toBe('7251')
      const account3001 = result.accounts.find((a) => a.number === '3001')
      expect(account3001?.sruCode).toBe('7410')
    })
  })

  describe('balance parsing', () => {
    it('parses opening balances (#IB) with positive amounts', () => {
      const result = parseSIEFile(SIE_WITH_BALANCES)
      const ib1510 = result.openingBalances.find((b) => b.account === '1510')
      expect(ib1510?.amount).toBe(50000)
      expect(ib1510?.yearIndex).toBe(0)
    })

    it('parses opening balances (#IB) with negative amounts', () => {
      const result = parseSIEFile(SIE_WITH_BALANCES)
      const ib2440 = result.openingBalances.find((b) => b.account === '2440')
      expect(ib2440?.amount).toBe(-150000)
    })

    it('parses closing balances (#UB)', () => {
      const result = parseSIEFile(SIE_WITH_BALANCES)
      expect(result.closingBalances).toHaveLength(3)
      const ub1930 = result.closingBalances.find((b) => b.account === '1930')
      expect(ub1930?.amount).toBe(125000)
    })
  })

  describe('voucher parsing', () => {
    it('parses #VER with series, number, date, description', () => {
      const result = parseSIEFile(SIE_WITH_VOUCHERS)
      expect(result.vouchers).toHaveLength(2)

      const v1 = result.vouchers[0]
      expect(v1.series).toBe('A')
      expect(v1.number).toBe(1)
      expect(v1.date).toEqual(new Date(2024, 0, 15))
      expect(v1.description).toBe('Faktura 1001')
    })

    it('parses #TRANS lines within a voucher', () => {
      const result = parseSIEFile(SIE_WITH_VOUCHERS)
      const v1 = result.vouchers[0]

      expect(v1.lines).toHaveLength(3)
      expect(v1.lines[0]).toMatchObject({ account: '1510', amount: 12500 })
      expect(v1.lines[1]).toMatchObject({ account: '3001', amount: -10000 })
      expect(v1.lines[2]).toMatchObject({ account: '2611', amount: -2500 })
    })

    it('handles object lists in braces', () => {
      const result = parseSIEFile(SIE_WITH_OBJECT_LIST)
      expect(result.vouchers).toHaveLength(1)

      const v = result.vouchers[0]
      expect(v.lines).toHaveLength(2)
      expect(v.lines[0]).toMatchObject({ account: '5010', amount: 15000 })
      expect(v.lines[1]).toMatchObject({ account: '1930', amount: -15000 })
    })

    it('parses quoted VER fields (series, number, date)', () => {
      const result = parseSIEFile(SIE_QUOTED_FIELDS)
      expect(result.vouchers).toHaveLength(1)

      const v = result.vouchers[0]
      expect(v.series).toBe('A')
      expect(v.number).toBe(1)
      expect(v.date).toEqual(new Date(2024, 0, 15))
      expect(v.description).toBe('Faktura 1001')
      expect(v.lines).toHaveLength(3)
      expect(v.lines[0]).toMatchObject({ account: '1510', amount: 12500 })
      expect(v.lines[1]).toMatchObject({ account: '3001', amount: -10000 })
      expect(v.lines[2]).toMatchObject({ account: '2611', amount: -2500 })

      const errors = result.issues.filter((i) => i.severity === 'error')
      expect(errors).toHaveLength(0)
    })

    it('allows empty series in VER', () => {
      const result = parseSIEFile(SIE_EMPTY_SERIES)
      expect(result.vouchers).toHaveLength(1)

      const v = result.vouchers[0]
      expect(v.series).toBe('')
      expect(v.number).toBe(1)
      expect(v.lines).toHaveLength(2)

      const errors = result.issues.filter((i) => i.severity === 'error')
      expect(errors).toHaveLength(0)
    })

    it('handles { on same line as #VER', () => {
      const result = parseSIEFile(SIE_BRACE_ON_VER_LINE)
      expect(result.vouchers).toHaveLength(1)

      const v = result.vouchers[0]
      expect(v.series).toBe('A')
      expect(v.number).toBe(1)
      expect(v.lines).toHaveLength(2)

      const errors = result.issues.filter((i) => i.severity === 'error')
      expect(errors).toHaveLength(0)
    })

    it('detects unbalanced vouchers as errors', () => {
      const result = parseSIEFile(SIE_UNBALANCED_VOUCHER)
      expect(result.vouchers).toHaveLength(1)

      const errors = result.issues.filter((i) => i.severity === 'error')
      expect(errors.length).toBeGreaterThanOrEqual(1)
      expect(errors.some((e) => e.message.includes('not balanced'))).toBe(true)
    })
  })

  describe('statistics', () => {
    it('calculates account count', () => {
      const result = parseSIEFile(MINIMAL_SIE)
      expect(result.stats.totalAccounts).toBe(3)
    })

    it('calculates voucher count', () => {
      const result = parseSIEFile(SIE_WITH_VOUCHERS)
      expect(result.stats.totalVouchers).toBe(2)
    })

    it('calculates transaction line count', () => {
      const result = parseSIEFile(SIE_WITH_VOUCHERS)
      // Voucher 1: 3 lines, Voucher 2: 2 lines
      expect(result.stats.totalTransactionLines).toBe(5)
    })

    it('sets fiscal year start/end from RAR 0', () => {
      const result = parseSIEFile(MINIMAL_SIE)
      expect(result.stats.fiscalYearStart).toEqual(new Date(2024, 0, 1))
      expect(result.stats.fiscalYearEnd).toEqual(new Date(2024, 11, 31))
    })

    it('returns null fiscal year dates when no RAR', () => {
      const content = '#FLAGGA 0\n#SIETYP 4\n#FNAMN "Test"'
      const result = parseSIEFile(content)
      expect(result.stats.fiscalYearStart).toBeNull()
      expect(result.stats.fiscalYearEnd).toBeNull()
    })
  })
})

// --- validateSIEFile tests ---

describe('validateSIEFile', () => {
  it('returns valid for a complete SIE file', () => {
    const parsed = parseSIEFile(SIE_WITH_VOUCHERS)
    const validation = validateSIEFile(parsed)

    expect(validation.valid).toBe(true)
    expect(validation.errors).toHaveLength(0)
  })

  it('adds error for unbalanced vouchers', () => {
    const parsed = parseSIEFile(SIE_UNBALANCED_VOUCHER)
    const validation = validateSIEFile(parsed)

    expect(validation.valid).toBe(false)
    expect(validation.errors.some((e) => e.includes('not balanced'))).toBe(true)
  })

  it('adds warning for undefined account references', () => {
    const content = [
      '#FLAGGA 0',
      '#SIETYP 4',
      '#FNAMN "Test"',
      '#RAR 0 20240101 20241231',
      '#KONTO 1510 "Kundfordringar"',
      '#IB 0 9999 50000.00',
    ].join('\n')

    const parsed = parseSIEFile(content)
    const validation = validateSIEFile(parsed)

    expect(validation.warnings.some((w) => w.includes('9999') && w.includes('not defined'))).toBe(true)
  })

  it('adds error for missing #RAR', () => {
    const content = '#FLAGGA 0\n#SIETYP 4\n#FNAMN "Test"\n#KONTO 1510 "Kund"'
    const parsed = parseSIEFile(content)
    const validation = validateSIEFile(parsed)

    expect(validation.valid).toBe(false)
    expect(validation.errors.some((e) => e.includes('fiscal year') || e.includes('#RAR'))).toBe(true)
  })

  it('adds warning for unbalanced opening balances', () => {
    const content = [
      '#FLAGGA 0',
      '#SIETYP 4',
      '#FNAMN "Test"',
      '#RAR 0 20240101 20241231',
      '#KONTO 1510 "Kundfordringar"',
      '#IB 0 1510 50000.00',
    ].join('\n')

    const parsed = parseSIEFile(content)
    const validation = validateSIEFile(parsed)

    expect(validation.warnings.some((w) => w.includes('Opening balances not balanced'))).toBe(true)
  })

  it('passes with balanced opening balances', () => {
    const parsed = parseSIEFile(SIE_WITH_BALANCES)
    const validation = validateSIEFile(parsed)

    // IB: 50000 + 100000 + (-150000) = 0 → balanced
    const ibWarning = validation.warnings.find((w) => w.includes('Opening balances not balanced'))
    expect(ibWarning).toBeUndefined()
  })
})
