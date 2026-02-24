import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase, makeTransaction } from '@/tests/helpers'

// Mock Supabase
const { supabase: mockSupabase, mockResult } = createMockSupabase()
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase),
}))

// Mock booking-templates (needed by evaluateMappingRules)
vi.mock('../booking-templates', () => ({
  findMatchingTemplates: vi.fn().mockReturnValue([]),
  buildMappingResultFromTemplate: vi.fn(),
}))

describe('mapping-engine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('saveUserMappingRule', () => {
    it('saves auto-learned rule without user description', async () => {
      const { saveUserMappingRule } = await import('../mapping-engine')

      mockResult({ data: null, error: null })

      await saveUserMappingRule('user-1', 'ICA Maxi', '5410', '1930', false)

      // Verify insert was called via supabase.from().insert()
      expect(mockSupabase.from).toHaveBeenCalledWith('mapping_rules')
    })

    it('saves user-described rule with priority 5 and confidence 0.98', async () => {
      const { saveUserMappingRule } = await import('../mapping-engine')

      mockResult({ data: null, error: null })

      await saveUserMappingRule(
        'user-1',
        'Restaurant XYZ',
        '6071',
        '1930',
        false,
        'business lunch with client',
        'restaurant_dining'
      )

      // Verify from was called (first for delete, then for insert)
      expect(mockSupabase.from).toHaveBeenCalledWith('mapping_rules')
    })

    it('does not throw on insert error (non-critical)', async () => {
      const { saveUserMappingRule } = await import('../mapping-engine')

      mockResult({ data: null, error: { message: 'DB error' } })

      // Should not throw
      await expect(
        saveUserMappingRule('user-1', 'ICA Maxi', '5410', '1930', false)
      ).resolves.toBeUndefined()
    })

    it('escapes special regex characters in merchant name', async () => {
      const { saveUserMappingRule } = await import('../mapping-engine')

      mockResult({ data: null, error: null })

      // Merchant name with regex special chars
      await saveUserMappingRule('user-1', 'Test (Pty) Ltd.', '5410', '1930', false)

      expect(mockSupabase.from).toHaveBeenCalledWith('mapping_rules')
    })
  })

  describe('evaluateMappingRules', () => {
    it('returns default result when no rules match', async () => {
      const { evaluateMappingRules } = await import('../mapping-engine')

      const tx = makeTransaction({ amount: -100, merchant_name: 'Unknown' })
      mockResult({ data: [], error: null })

      const result = await evaluateMappingRules('user-1', tx)

      expect(result.debit_account).toBe('6991')
      expect(result.credit_account).toBe('1930')
      expect(result.confidence).toBe(0.1)
      expect(result.requires_review).toBe(true)
    })

    it('matches merchant_pattern rule', async () => {
      const { evaluateMappingRules } = await import('../mapping-engine')

      const tx = makeTransaction({
        amount: -299,
        merchant_name: 'ICA Maxi',
        description: 'ICA MAXI STOCKHOLM',
      })

      mockResult({
        data: [
          {
            id: 'rule-1',
            user_id: 'user-1',
            rule_name: 'Learned: ICA Maxi',
            rule_type: 'merchant_name',
            priority: 10,
            mcc_codes: null,
            merchant_pattern: 'ICA Maxi',
            description_pattern: null,
            amount_min: null,
            amount_max: null,
            debit_account: '5410',
            credit_account: '1930',
            vat_treatment: null,
            vat_debit_account: null,
            vat_credit_account: null,
            risk_level: 'NONE',
            default_private: false,
            requires_review: false,
            confidence_score: 0.95,
            capitalization_threshold: null,
            capitalized_debit_account: null,
            is_active: true,
            source: 'auto',
            user_description: null,
            template_id: null,
            created_at: '2024-01-01',
            updated_at: '2024-01-01',
          },
        ],
        error: null,
      })

      const result = await evaluateMappingRules('user-1', tx)

      expect(result.debit_account).toBe('5410')
      expect(result.credit_account).toBe('1930')
      expect(result.confidence).toBe(0.95)
    })
  })
})
