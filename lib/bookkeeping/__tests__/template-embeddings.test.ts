import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeTransaction } from '@/tests/helpers'
import { extensionRegistry } from '@/lib/extensions/registry'

// Mock the extension registry
vi.mock('@/lib/extensions/registry', () => ({
  extensionRegistry: {
    get: vi.fn(),
  },
}))

describe('template-embeddings facade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('findSimilarTemplates', () => {
    it('delegates to ai-categorization extension service when available', async () => {
      const mockResults = [{ template: { id: 'test' }, confidence: 0.9 }]
      const mockFindSimilar = vi.fn().mockResolvedValue(mockResults)

      vi.mocked(extensionRegistry.get).mockReturnValue({
        id: 'ai-categorization',
        name: 'AI',
        version: '1.0.0',
        services: { findSimilarTemplates: mockFindSimilar },
      })

      const { findSimilarTemplates } = await import('../template-embeddings')
      const tx = makeTransaction({ description: 'SPOTIFY', amount: -109 })
      const results = await findSimilarTemplates(tx, 'enskild_firma')

      expect(mockFindSimilar).toHaveBeenCalledWith(tx, 'enskild_firma', undefined, undefined)
      expect(results).toEqual(mockResults)
    })

    it('falls back to keyword matching when extension not loaded', async () => {
      vi.mocked(extensionRegistry.get).mockReturnValue(undefined)

      const { findSimilarTemplates } = await import('../template-embeddings')
      const tx = makeTransaction({ description: 'SPOTIFY', amount: -109 })
      const results = await findSimilarTemplates(tx)

      // Should return keyword-based matches (may be empty for generic text)
      expect(Array.isArray(results)).toBe(true)
    })
  })

  describe('seedAllTemplateEmbeddings', () => {
    it('delegates to extension service when available', async () => {
      const mockSeed = vi.fn().mockResolvedValue({ seeded: 48, errors: [] })

      vi.mocked(extensionRegistry.get).mockReturnValue({
        id: 'ai-categorization',
        name: 'AI',
        version: '1.0.0',
        services: { seedAllTemplateEmbeddings: mockSeed },
      })

      const { seedAllTemplateEmbeddings } = await import('../template-embeddings')
      const result = await seedAllTemplateEmbeddings()

      expect(mockSeed).toHaveBeenCalled()
      expect(result).toEqual({ seeded: 48, errors: [] })
    })

    it('returns error when extension not loaded', async () => {
      vi.mocked(extensionRegistry.get).mockReturnValue(undefined)

      const { seedAllTemplateEmbeddings } = await import('../template-embeddings')
      const result = await seedAllTemplateEmbeddings()

      expect(result.seeded).toBe(0)
      expect(result.errors).toHaveLength(1)
    })
  })

  describe('getSchemaVersion', () => {
    it('delegates to extension service when available', async () => {
      const mockVersion = vi.fn().mockResolvedValue('abc123def456')

      vi.mocked(extensionRegistry.get).mockReturnValue({
        id: 'ai-categorization',
        name: 'AI',
        version: '1.0.0',
        services: { getSchemaVersion: mockVersion },
      })

      const { getSchemaVersion } = await import('../template-embeddings')
      const result = await getSchemaVersion()

      expect(result).toBe('abc123def456')
    })

    it('returns "none" when extension not loaded', async () => {
      vi.mocked(extensionRegistry.get).mockReturnValue(undefined)

      const { getSchemaVersion } = await import('../template-embeddings')
      const result = await getSchemaVersion()

      expect(result).toBe('none')
    })
  })
})
