import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeTransaction, createMockSupabase } from '@/tests/helpers'
import { BOOKING_TEMPLATES } from '../booking-templates'

// Mock server-only (no-op in tests)
vi.mock('server-only', () => ({}))

// Mock OpenAI Embeddings
vi.mock('@langchain/openai', () => {
  class MockOpenAIEmbeddings {
    embedQuery = vi.fn().mockResolvedValue(new Array(1536).fill(0.1))
    embedDocuments = vi.fn().mockImplementation((texts: string[]) =>
      Promise.resolve(texts.map(() => new Array(1536).fill(0.1)))
    )
  }
  return { OpenAIEmbeddings: MockOpenAIEmbeddings }
})

// Mock Supabase
const { supabase: mockSupabase, mockResult } = createMockSupabase()
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockResolvedValue(mockSupabase),
}))

describe('template-embeddings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('buildEmbeddingText', () => {
    it('includes all relevant fields for a template', async () => {
      const { buildEmbeddingText } = await import('../template-embeddings')

      const template = BOOKING_TEMPLATES.find((t) => t.id === 'premises_rent')!
      const text = buildEmbeddingText(template)

      // Should include Swedish and English name
      expect(text).toContain('Lokalhyra')
      expect(text).toContain('Office rent')

      // Should include description
      expect(text).toContain(template.description_sv)

      // Should include keywords
      expect(text).toContain('hyra')
      expect(text).toContain('lokal')

      // Should include group
      expect(text).toContain('premises')

      // Should include direction
      expect(text).toContain('utgift')

      // Should include accounts
      expect(text).toContain('5010')
      expect(text).toContain('1930')
    })

    it('includes VAT treatment when present', async () => {
      const { buildEmbeddingText } = await import('../template-embeddings')

      const template = BOOKING_TEMPLATES.find((t) => t.id === 'premises_electricity')!
      const text = buildEmbeddingText(template)

      expect(text).toContain('standard_25')
      expect(text).toContain('25%')
    })

    it('includes special rules when present', async () => {
      const { buildEmbeddingText } = await import('../template-embeddings')

      const template = BOOKING_TEMPLATES.find((t) => t.id === 'premises_rent')!
      const text = buildEmbeddingText(template)

      expect(text).toContain(template.special_rules_sv!)
    })

    it('includes MCC codes when present', async () => {
      const { buildEmbeddingText } = await import('../template-embeddings')

      const template = BOOKING_TEMPLATES.find((t) => t.id === 'premises_electricity')!
      const text = buildEmbeddingText(template)

      expect(text).toContain('4900')
    })

    it('includes deductibility note for non-full deductibility', async () => {
      const { buildEmbeddingText } = await import('../template-embeddings')

      const template = BOOKING_TEMPLATES.find((t) => t.deductibility === 'non_deductible')!
      const text = buildEmbeddingText(template)

      expect(text).toContain('non_deductible')
    })

    it('generates text for all 100 templates without error', async () => {
      const { buildEmbeddingText } = await import('../template-embeddings')

      for (const template of BOOKING_TEMPLATES) {
        const text = buildEmbeddingText(template)
        expect(text.length).toBeGreaterThan(10)
      }
    })
  })

  describe('buildTransactionQueryText', () => {
    it('combines description, merchant, and direction', async () => {
      const { buildTransactionQueryText } = await import('../template-embeddings')

      const tx = makeTransaction({
        description: 'SPOTIFY PREMIUM',
        merchant_name: 'Spotify',
        amount: -109,
        mcc_code: 5815,
      })

      const text = buildTransactionQueryText(tx)

      expect(text).toContain('SPOTIFY PREMIUM')
      expect(text).toContain('Spotify')
      expect(text).toContain('MCC 5815')
      expect(text).toContain('utgift')
    })

    it('marks positive amounts as income', async () => {
      const { buildTransactionQueryText } = await import('../template-embeddings')

      const tx = makeTransaction({
        description: 'Inbetalning',
        amount: 5000,
      })

      const text = buildTransactionQueryText(tx)
      expect(text).toContain('intäkt')
    })

    it('handles null merchant_name and mcc_code', async () => {
      const { buildTransactionQueryText } = await import('../template-embeddings')

      const tx = makeTransaction({
        description: 'Some payment',
        merchant_name: null,
        mcc_code: null,
        amount: -100,
      })

      const text = buildTransactionQueryText(tx)
      expect(text).toContain('Some payment')
      expect(text).toContain('utgift')
      expect(text).not.toContain('MCC')
    })
  })

  describe('getSchemaVersion', () => {
    it('returns a consistent hash string', async () => {
      const { getSchemaVersion } = await import('../template-embeddings')

      const v1 = getSchemaVersion()
      const v2 = getSchemaVersion()

      expect(v1).toBe(v2)
      expect(v1).toHaveLength(12)
      expect(v1).toMatch(/^[a-f0-9]+$/)
    })
  })

  describe('findSimilarTemplates', () => {
    it('returns empty array on RPC error (graceful fallback)', async () => {
      const { findSimilarTemplates } = await import('../template-embeddings')

      // Mock staleness check
      mockResult({ data: { schema_version: 'test' }, error: null })

      const tx = makeTransaction({
        description: 'SPOTIFY',
        amount: -109,
      })

      // The mock will return error for the RPC call
      mockResult({ data: null, error: { message: 'RPC failed' } })
      const results = await findSimilarTemplates(tx)
      expect(results).toEqual([])
    })

    it('returns empty array when no embeddings exist', async () => {
      const { findSimilarTemplates } = await import('../template-embeddings')

      mockResult({ data: [], error: null })

      const tx = makeTransaction({
        description: 'Random purchase',
        amount: -50,
      })

      const results = await findSimilarTemplates(tx)
      expect(results).toEqual([])
    })
  })
})
