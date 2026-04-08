import { describe, it, expect } from 'vitest'
import { INK2_ACCOUNT_MAPPINGS, isAccountInMapping, checkBalanceWarning } from '../ink2-engine'
import type { INK2SRUCode } from '../types'

/**
 * Helper to find which SRU code an account maps to
 */
function findSRUCodeForAccount(accountNumber: string): INK2SRUCode | null {
  for (const mapping of INK2_ACCOUNT_MAPPINGS) {
    if (isAccountInMapping(accountNumber, mapping)) {
      return mapping.sruCode
    }
  }
  return null
}

describe('INK2 Account Mappings', () => {
  describe('completeness', () => {
    it('has 19 mappings covering all INK2 fields', () => {
      expect(INK2_ACCOUNT_MAPPINGS).toHaveLength(19)
    })

    it('covers all SRU codes', () => {
      const codes = INK2_ACCOUNT_MAPPINGS.map(m => m.sruCode)
      const expectedCodes: INK2SRUCode[] = [
        '7201', '7202', '7203', '7210', '7211', '7212',
        '7220', '7221', '7222', '7230', '7231',
        '7310', '7320', '7330', '7340', '7350', '7360', '7370', '7380',
      ]
      expect(codes).toEqual(expectedCodes)
    })
  })

  describe('Balance sheet - Assets', () => {
    it('1000-1099 -> 7201 (Immateriella AT)', () => {
      expect(findSRUCodeForAccount('1000')).toBe('7201')
      expect(findSRUCodeForAccount('1050')).toBe('7201')
      expect(findSRUCodeForAccount('1099')).toBe('7201')
    })

    it('1100-1299 -> 7202 (Materiella AT)', () => {
      expect(findSRUCodeForAccount('1100')).toBe('7202')
      expect(findSRUCodeForAccount('1210')).toBe('7202')
      expect(findSRUCodeForAccount('1299')).toBe('7202')
    })

    it('1300-1399 -> 7203 (Finansiella AT)', () => {
      expect(findSRUCodeForAccount('1300')).toBe('7203')
      expect(findSRUCodeForAccount('1350')).toBe('7203')
      expect(findSRUCodeForAccount('1399')).toBe('7203')
    })

    it('1400-1499 -> 7210 (Varulager)', () => {
      expect(findSRUCodeForAccount('1400')).toBe('7210')
      expect(findSRUCodeForAccount('1460')).toBe('7210')
      expect(findSRUCodeForAccount('1499')).toBe('7210')
    })

    it('1500-1599 -> 7211 (Kundfordringar)', () => {
      expect(findSRUCodeForAccount('1500')).toBe('7211')
      expect(findSRUCodeForAccount('1510')).toBe('7211')
      expect(findSRUCodeForAccount('1599')).toBe('7211')
    })

    it('1600-1999 -> 7212 (Övriga OT)', () => {
      expect(findSRUCodeForAccount('1600')).toBe('7212')
      expect(findSRUCodeForAccount('1930')).toBe('7212')
      expect(findSRUCodeForAccount('1999')).toBe('7212')
    })
  })

  describe('Balance sheet - Equity & Liabilities', () => {
    it('2081 -> 7220 (Aktiekapital)', () => {
      expect(findSRUCodeForAccount('2081')).toBe('7220')
    })

    it('2081 does NOT go to 7221', () => {
      expect(findSRUCodeForAccount('2081')).not.toBe('7221')
    })

    it('2000-2080 -> 7221 (Övrigt EK)', () => {
      expect(findSRUCodeForAccount('2000')).toBe('7221')
      expect(findSRUCodeForAccount('2010')).toBe('7221')
      expect(findSRUCodeForAccount('2080')).toBe('7221')
    })

    it('2082-2098 -> 7221 (Övrigt EK)', () => {
      expect(findSRUCodeForAccount('2082')).toBe('7221')
      expect(findSRUCodeForAccount('2090')).toBe('7221')
      expect(findSRUCodeForAccount('2098')).toBe('7221')
    })

    it('2099 -> 7222 (Årets resultat)', () => {
      expect(findSRUCodeForAccount('2099')).toBe('7222')
    })

    it('2099 does NOT go to 7221', () => {
      expect(findSRUCodeForAccount('2099')).not.toBe('7221')
    })

    it('2100-2499 -> 7230 (Obeskattade reserver, avsättningar, skulder)', () => {
      expect(findSRUCodeForAccount('2100')).toBe('7230')
      expect(findSRUCodeForAccount('2150')).toBe('7230') // Obeskattade reserver
      expect(findSRUCodeForAccount('2250')).toBe('7230') // Avsättningar
      expect(findSRUCodeForAccount('2440')).toBe('7230') // Leverantörsskulder
      expect(findSRUCodeForAccount('2499')).toBe('7230')
    })

    it('2500-2999 -> 7231 (Övriga skulder)', () => {
      expect(findSRUCodeForAccount('2500')).toBe('7231')
      expect(findSRUCodeForAccount('2611')).toBe('7231') // Utgående moms
      expect(findSRUCodeForAccount('2710')).toBe('7231') // Personalens källskatt
      expect(findSRUCodeForAccount('2999')).toBe('7231')
    })
  })

  describe('Income statement', () => {
    it('3000-3999 -> 7310 (Nettoomsättning)', () => {
      expect(findSRUCodeForAccount('3000')).toBe('7310')
      expect(findSRUCodeForAccount('3001')).toBe('7310')
      expect(findSRUCodeForAccount('3100')).toBe('7310')
      expect(findSRUCodeForAccount('3999')).toBe('7310')
    })

    it('4000-4999 -> 7320 (Varuinköp)', () => {
      expect(findSRUCodeForAccount('4000')).toBe('7320')
      expect(findSRUCodeForAccount('4010')).toBe('7320')
      expect(findSRUCodeForAccount('4999')).toBe('7320')
    })

    it('5000-6999 -> 7330 (Övriga externa kostnader)', () => {
      expect(findSRUCodeForAccount('5000')).toBe('7330')
      expect(findSRUCodeForAccount('5460')).toBe('7330')
      expect(findSRUCodeForAccount('6200')).toBe('7330')
      expect(findSRUCodeForAccount('6999')).toBe('7330')
    })

    it('7000-7699 -> 7340 (Personalkostnader)', () => {
      expect(findSRUCodeForAccount('7000')).toBe('7340')
      expect(findSRUCodeForAccount('7210')).toBe('7340')
      expect(findSRUCodeForAccount('7699')).toBe('7340')
    })

    it('7700-7899 -> 7350 (Avskrivningar)', () => {
      expect(findSRUCodeForAccount('7700')).toBe('7350')
      expect(findSRUCodeForAccount('7820')).toBe('7350')
      expect(findSRUCodeForAccount('7899')).toBe('7350')
    })

    it('7900-7999 -> 7360 (Övriga rörelsekostnader)', () => {
      expect(findSRUCodeForAccount('7900')).toBe('7360')
      expect(findSRUCodeForAccount('7970')).toBe('7360')
      expect(findSRUCodeForAccount('7999')).toBe('7360')
    })

    it('8000-8499 -> 7370 (Finansiella poster)', () => {
      expect(findSRUCodeForAccount('8000')).toBe('7370')
      expect(findSRUCodeForAccount('8310')).toBe('7370') // Ränteintäkter
      expect(findSRUCodeForAccount('8400')).toBe('7370') // Räntekostnader
      expect(findSRUCodeForAccount('8499')).toBe('7370')
    })

    it('8500-8999 -> 7380 (Extraordinära poster)', () => {
      expect(findSRUCodeForAccount('8500')).toBe('7380')
      expect(findSRUCodeForAccount('8910')).toBe('7380') // Skatt
      expect(findSRUCodeForAccount('8999')).toBe('7380')
    })
  })

  describe('no overlap between mappings', () => {
    it('each account matches exactly one mapping', () => {
      // Test a representative sample across boundaries
      const testAccounts = [
        '1099', '1100', // 7201/7202 boundary
        '1299', '1300', // 7202/7203 boundary
        '1399', '1400', // 7203/7210 boundary
        '1499', '1500', // 7210/7211 boundary
        '1599', '1600', // 7211/7212 boundary
        '1999', '2000', // 7212/7221 boundary
        '2080', '2081', '2082', // 7221/7220/7221
        '2098', '2099', '2100', // 7221/7222/7230 boundary
        '2499', '2500', // 7230/7231 boundary
        '2999', '3000', // 7231/7310 boundary
        '3999', '4000', // 7310/7320 boundary
        '4999', '5000', // 7320/7330 boundary
        '6999', '7000', // 7330/7340 boundary
        '7699', '7700', // 7340/7350 boundary
        '7899', '7900', // 7350/7360 boundary
        '7999', '8000', // 7360/7370 boundary
        '8499', '8500', // 7370/7380 boundary
      ]

      for (const account of testAccounts) {
        let matchCount = 0
        for (const mapping of INK2_ACCOUNT_MAPPINGS) {
          if (isAccountInMapping(account, mapping)) {
            matchCount++
          }
        }
        expect(matchCount).toBe(1)
      }
    })
  })

  describe('section assignments', () => {
    it('asset mappings have section "assets"', () => {
      const assetMappings = INK2_ACCOUNT_MAPPINGS.filter(m => m.section === 'assets')
      expect(assetMappings.map(m => m.sruCode)).toEqual(['7201', '7202', '7203', '7210', '7211', '7212'])
    })

    it('equity/liability mappings have section "equity_liabilities"', () => {
      const eqMappings = INK2_ACCOUNT_MAPPINGS.filter(m => m.section === 'equity_liabilities')
      expect(eqMappings.map(m => m.sruCode)).toEqual(['7220', '7221', '7222', '7230', '7231'])
    })

    it('income statement mappings have section "income_statement"', () => {
      const isMappings = INK2_ACCOUNT_MAPPINGS.filter(m => m.section === 'income_statement')
      expect(isMappings.map(m => m.sruCode)).toEqual(['7310', '7320', '7330', '7340', '7350', '7360', '7370', '7380'])
    })
  })

  describe('normal balance assignments', () => {
    it('asset accounts are debit-normal', () => {
      const assetMappings = INK2_ACCOUNT_MAPPINGS.filter(m => m.section === 'assets')
      for (const m of assetMappings) {
        expect(m.normalBalance).toBe('debit')
      }
    })

    it('equity/liability accounts are credit-normal', () => {
      const eqMappings = INK2_ACCOUNT_MAPPINGS.filter(m => m.section === 'equity_liabilities')
      for (const m of eqMappings) {
        expect(m.normalBalance).toBe('credit')
      }
    })

    it('revenue (7310) is credit-normal', () => {
      const revenue = INK2_ACCOUNT_MAPPINGS.find(m => m.sruCode === '7310')
      expect(revenue?.normalBalance).toBe('credit')
    })

    it('expense accounts (7320-7360) are debit-normal', () => {
      const expenseCodes: INK2SRUCode[] = ['7320', '7330', '7340', '7350', '7360']
      for (const code of expenseCodes) {
        const mapping = INK2_ACCOUNT_MAPPINGS.find(m => m.sruCode === code)
        expect(mapping?.normalBalance).toBe('debit')
      }
    })

    it('financial and extraordinary items (7370, 7380) are net', () => {
      const financial = INK2_ACCOUNT_MAPPINGS.find(m => m.sruCode === '7370')
      const extraordinary = INK2_ACCOUNT_MAPPINGS.find(m => m.sruCode === '7380')
      expect(financial?.normalBalance).toBe('net')
      expect(extraordinary?.normalBalance).toBe('net')
    })
  })
})

describe('checkBalanceWarning', () => {
  it('returns null when perfectly balanced', () => {
    expect(checkBalanceWarning(100000, 100000)).toBeNull()
  })

  it('returns null for 1 kr difference (within rounding tolerance)', () => {
    expect(checkBalanceWarning(100000, 100001)).toBeNull()
    expect(checkBalanceWarning(100001, 100000)).toBeNull()
  })

  it('returns null for 2 kr difference (within rounding tolerance)', () => {
    expect(checkBalanceWarning(100000, 100002)).toBeNull()
    expect(checkBalanceWarning(100002, 100000)).toBeNull()
  })

  it('returns warning for 3 kr difference (exceeds tolerance)', () => {
    expect(checkBalanceWarning(100000, 100003)).not.toBeNull()
    expect(checkBalanceWarning(100003, 100000)).not.toBeNull()
  })

  it('returns null when totals are zero', () => {
    expect(checkBalanceWarning(0, 0)).toBeNull()
  })

  it('returns null when assets are zero (no data)', () => {
    expect(checkBalanceWarning(0, 5)).toBeNull()
  })

  it('includes amounts in warning message', () => {
    const warning = checkBalanceWarning(100000, 100005)
    expect(warning).toContain('100000')
    expect(warning).toContain('100005')
    expect(warning).toContain('5')
  })
})
