import {
  FORTNOX_DATA_TYPES,
  getFortnoxDataType,
  getRequiredScopes,
  getMissingScopesForTypes,
  getGroupedDataTypes,
  requiresFinancialYear,
  getCategoryLabel,
} from '../fortnox-data-types'

describe('fortnox-data-types', () => {
  describe('FORTNOX_DATA_TYPES', () => {
    it('has unique IDs', () => {
      const ids = FORTNOX_DATA_TYPES.map((dt) => dt.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('has all required fields', () => {
      for (const dt of FORTNOX_DATA_TYPES) {
        expect(dt.id).toBeTruthy()
        expect(dt.name).toBeTruthy()
        expect(dt.endpoint).toBeTruthy()
        expect(dt.requiredScope).toBeTruthy()
        expect(['sie_import', 'gnubok_table', 'raw_json']).toContain(dt.syncTarget)
        expect(['accounting', 'sales', 'purchase', 'hr', 'other']).toContain(dt.category)
        expect(typeof dt.sortOrder).toBe('number')
      }
    })

    it('has gnubok_table types with targetTable', () => {
      const tableSyncTypes = FORTNOX_DATA_TYPES.filter((dt) => dt.syncTarget === 'gnubok_table')
      for (const dt of tableSyncTypes) {
        expect(dt.targetTable).toBeTruthy()
      }
    })
  })

  describe('getFortnoxDataType', () => {
    it('returns data type by ID', () => {
      const sie = getFortnoxDataType('sie4')
      expect(sie).toBeDefined()
      expect(sie!.name).toBe('SIE4 (bokföringsdata)')
      expect(sie!.syncTarget).toBe('sie_import')
    })

    it('returns undefined for unknown ID', () => {
      expect(getFortnoxDataType('nonexistent')).toBeUndefined()
    })
  })

  describe('getRequiredScopes', () => {
    it('returns unique scopes for given data type IDs', () => {
      const scopes = getRequiredScopes(['sie4', 'customers', 'invoices'])
      expect(scopes).toContain('bookkeeping')
      expect(scopes).toContain('customer')
      expect(scopes).toContain('invoice')
      expect(new Set(scopes).size).toBe(scopes.length)
    })

    it('ignores unknown IDs', () => {
      const scopes = getRequiredScopes(['sie4', 'unknown'])
      expect(scopes).toEqual(['bookkeeping'])
    })

    it('deduplicates scopes', () => {
      // invoices and invoicepayments both need 'invoice' scope
      const scopes = getRequiredScopes(['invoices', 'invoicepayments'])
      expect(scopes.filter((s) => s === 'invoice').length).toBe(1)
    })
  })

  describe('getMissingScopesForTypes', () => {
    it('returns scopes not in granted set', () => {
      const missing = getMissingScopesForTypes(
        ['sie4', 'customers', 'employees'],
        ['bookkeeping', 'customer']
      )
      expect(missing).toContain('salary')
      expect(missing).not.toContain('bookkeeping')
      expect(missing).not.toContain('customer')
    })

    it('returns empty array when all scopes are granted', () => {
      const missing = getMissingScopesForTypes(
        ['sie4'],
        ['bookkeeping', 'companyinformation']
      )
      expect(missing).toEqual([])
    })
  })

  describe('getGroupedDataTypes', () => {
    it('groups by category', () => {
      const grouped = getGroupedDataTypes()
      expect(Object.keys(grouped)).toEqual(['accounting', 'sales', 'purchase', 'hr', 'other'])
      expect(grouped.accounting.length).toBeGreaterThan(0)
      expect(grouped.sales.length).toBeGreaterThan(0)
    })

    it('sorts by sortOrder within each group', () => {
      const grouped = getGroupedDataTypes()
      for (const types of Object.values(grouped)) {
        for (let i = 1; i < types.length; i++) {
          expect(types[i].sortOrder).toBeGreaterThanOrEqual(types[i - 1].sortOrder)
        }
      }
    })
  })

  describe('requiresFinancialYear', () => {
    it('returns true when SIE4 is selected', () => {
      expect(requiresFinancialYear(['sie4'])).toBe(true)
    })

    it('returns true when accounts is selected', () => {
      expect(requiresFinancialYear(['accounts'])).toBe(true)
    })

    it('returns false when only customers selected', () => {
      expect(requiresFinancialYear(['customers'])).toBe(false)
    })
  })

  describe('getCategoryLabel', () => {
    it('returns Swedish labels', () => {
      expect(getCategoryLabel('accounting')).toBe('Bokföring')
      expect(getCategoryLabel('sales')).toBe('Försäljning')
      expect(getCategoryLabel('purchase')).toBe('Inköp')
      expect(getCategoryLabel('hr')).toBe('Löner')
      expect(getCategoryLabel('other')).toBe('Övrigt')
    })
  })
})
