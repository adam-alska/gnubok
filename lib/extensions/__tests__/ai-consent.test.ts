/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase } from '@/tests/helpers'
import {
  hasAiConsent,
  grantAiConsent,
  revokeAiConsent,
  isAiExtension,
  CURRENT_CONSENT_VERSION,
} from '../ai-consent'

describe('ai-consent', () => {
  let supabase: ReturnType<typeof createMockSupabase>['supabase']
  let mockResult: ReturnType<typeof createMockSupabase>['mockResult']

  beforeEach(() => {
    vi.clearAllMocks()
    const mock = createMockSupabase()
    supabase = mock.supabase
    mockResult = mock.mockResult
  })

  describe('isAiExtension', () => {
    it('returns true for AI extensions', () => {
      expect(isAiExtension('receipt-ocr')).toBe(true)
      expect(isAiExtension('ai-categorization')).toBe(true)
      expect(isAiExtension('ai-chat')).toBe(true)
    })

    it('returns false for non-AI extensions', () => {
      expect(isAiExtension('enable-banking')).toBe(false)
      expect(isAiExtension('email')).toBe(false)
      expect(isAiExtension('calendar')).toBe(false)
    })
  })

  describe('hasAiConsent', () => {
    it('returns true for non-AI extensions without checking DB', async () => {
      const result = await hasAiConsent(supabase as any, 'company-1', 'enable-banking')
      expect(result).toBe(true)
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('returns false when no consent record exists', async () => {
      mockResult({ data: null })
      const result = await hasAiConsent(supabase as any, 'company-1', 'receipt-ocr')
      expect(result).toBe(false)
    })

    it('returns true after consent is granted with current version', async () => {
      mockResult({
        data: {
          value: {
            consented: true,
            version: CURRENT_CONSENT_VERSION,
            granted_at: '2024-01-01T00:00:00Z',
          },
        },
      })
      const result = await hasAiConsent(supabase as any, 'company-1', 'receipt-ocr')
      expect(result).toBe(true)
    })

    it('returns false after consent is revoked', async () => {
      mockResult({
        data: {
          value: {
            consented: false,
            version: CURRENT_CONSENT_VERSION,
            revoked_at: '2024-01-02T00:00:00Z',
          },
        },
      })
      const result = await hasAiConsent(supabase as any, 'company-1', 'receipt-ocr')
      expect(result).toBe(false)
    })

    it('returns false for outdated consent version', async () => {
      mockResult({
        data: {
          value: {
            consented: true,
            version: CURRENT_CONSENT_VERSION - 1,
            granted_at: '2024-01-01T00:00:00Z',
          },
        },
      })
      const result = await hasAiConsent(supabase as any, 'company-1', 'receipt-ocr')
      expect(result).toBe(false)
    })
  })

  describe('grantAiConsent', () => {
    it('upserts consent record to extension_data', async () => {
      mockResult({ data: null, error: null })
      await grantAiConsent(supabase as any, 'user-1', 'company-1', 'receipt-ocr')

      expect(supabase.from).toHaveBeenCalledWith('extension_data')
    })

    it('does nothing for non-AI extensions', async () => {
      await grantAiConsent(supabase as any, 'user-1', 'company-1', 'enable-banking')
      expect(supabase.from).not.toHaveBeenCalled()
    })
  })

  describe('revokeAiConsent', () => {
    it('upserts revoked consent to extension_data', async () => {
      mockResult({ data: null, error: null })
      await revokeAiConsent(supabase as any, 'user-1', 'company-1', 'ai-chat')

      expect(supabase.from).toHaveBeenCalledWith('extension_data')
    })

    it('does nothing for non-AI extensions', async () => {
      await revokeAiConsent(supabase as any, 'user-1', 'company-1', 'email')
      expect(supabase.from).not.toHaveBeenCalled()
    })
  })
})
