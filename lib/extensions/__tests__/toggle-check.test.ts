import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabase } from '@/tests/helpers'

const { supabase: mockSupabase, mockResult } = createMockSupabase()
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => Promise.resolve(mockSupabase),
}))

import { isExtensionEnabled } from '../toggle-check'

describe('isExtensionEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true when toggle exists and is enabled', async () => {
    mockResult({ data: { enabled: true }, error: null })

    const result = await isExtensionEnabled('user-1', 'general', 'receipt-ocr')

    expect(result).toBe(true)
    expect(mockSupabase.from).toHaveBeenCalledWith('extension_toggles')
  })

  it('returns false when toggle exists and is disabled', async () => {
    mockResult({ data: { enabled: false }, error: null })

    const result = await isExtensionEnabled('user-1', 'general', 'receipt-ocr')

    expect(result).toBe(false)
  })

  it('returns true for legacy general extensions when no toggle row exists', async () => {
    mockResult({ data: null, error: null })

    const result = await isExtensionEnabled('user-1', 'general', 'receipt-ocr')

    expect(result).toBe(true)
  })

  it('returns false for non-legacy extensions when no toggle row exists', async () => {
    mockResult({ data: null, error: null })

    const result = await isExtensionEnabled('user-1', 'restaurant', 'tip-tracking')

    expect(result).toBe(false)
  })
})
