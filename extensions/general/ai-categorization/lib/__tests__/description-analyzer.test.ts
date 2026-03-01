import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only (no-op in tests)
vi.mock('server-only', () => ({}))

// Mock Anthropic SDK
const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: mockCreate }
  }
  return { default: MockAnthropic }
})

function makeToolResponse(input: Record<string, unknown>) {
  return {
    content: [
      {
        type: 'tool_use',
        name: 'analyze_description',
        input,
      },
    ],
  }
}

describe('description-analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns correct result for an expense with standard VAT', async () => {
    mockCreate.mockResolvedValueOnce(
      makeToolResponse({
        debitAccount: '6071',
        creditAccount: '1930',
        vatTreatment: 'standard_25',
        category: 'expense_representation',
        confidence: 0.85,
        reasoning: 'Lunch med kund klassificeras som representation.',
        warnings: ['Max 300 kr/person for avdragsratt'],
        templateId: null,
      })
    )

    const { analyzeDescription } = await import('../description-analyzer')

    const result = await analyzeDescription({
      description: 'Lunch med kund',
      transactionAmount: -450,
      transactionDate: '2026-01-15',
      transactionDescription: 'RESTAURANT XYZ',
      merchantName: 'Restaurant XYZ',
      currency: 'SEK',
      entityType: 'enskild_firma',
    })

    expect(result.debitAccount).toBe('6071')
    expect(result.creditAccount).toBe('1930')
    expect(result.vatTreatment).toBe('standard_25')
    expect(result.category).toBe('expense_representation')
    expect(result.confidence).toBe(0.85)
    expect(result.reasoning).toContain('representation')
    expect(result.warnings).toHaveLength(1)
    expect(result.templateId).toBeNull()
  })

  it('returns correct result for income', async () => {
    mockCreate.mockResolvedValueOnce(
      makeToolResponse({
        debitAccount: '1930',
        creditAccount: '3001',
        vatTreatment: 'standard_25',
        category: 'income_services',
        confidence: 0.9,
        reasoning: 'Konsultarvode bokfors som tjansteintakt.',
        warnings: [],
        templateId: null,
      })
    )

    const { analyzeDescription } = await import('../description-analyzer')

    const result = await analyzeDescription({
      description: 'Konsultarvode',
      transactionAmount: 25000,
      transactionDate: '2026-01-15',
      transactionDescription: 'PAYMENT FROM CLIENT',
      merchantName: null,
      currency: 'SEK',
      entityType: 'aktiebolag',
    })

    expect(result.debitAccount).toBe('1930')
    expect(result.creditAccount).toBe('3001')
    expect(result.category).toBe('income_services')
    expect(result.confidence).toBe(0.9)
  })

  it('corrects category direction mismatch', async () => {
    mockCreate.mockResolvedValueOnce(
      makeToolResponse({
        debitAccount: '6071',
        creditAccount: '1930',
        vatTreatment: null,
        category: 'income_services', // Wrong direction for expense
        confidence: 0.7,
        reasoning: 'Test',
        warnings: [],
        templateId: null,
      })
    )

    const { analyzeDescription } = await import('../description-analyzer')

    const result = await analyzeDescription({
      description: 'Something',
      transactionAmount: -500,
      transactionDate: '2026-01-15',
      transactionDescription: 'PAYMENT',
      merchantName: null,
      currency: 'SEK',
      entityType: 'enskild_firma',
    })

    // Income category should be corrected to expense for negative amount
    expect(result.category).toBe('expense_other')
  })

  it('clamps confidence to [0, 1]', async () => {
    mockCreate.mockResolvedValueOnce(
      makeToolResponse({
        debitAccount: '6991',
        creditAccount: '1930',
        vatTreatment: null,
        category: 'expense_other',
        confidence: 1.5, // Over 1
        reasoning: 'Test',
        warnings: [],
        templateId: null,
      })
    )

    const { analyzeDescription } = await import('../description-analyzer')

    const result = await analyzeDescription({
      description: 'Something',
      transactionAmount: -100,
      transactionDate: '2026-01-15',
      transactionDescription: 'PAYMENT',
      merchantName: null,
      currency: 'SEK',
      entityType: 'enskild_firma',
    })

    expect(result.confidence).toBe(1)
  })

  it('falls back to default accounts for invalid account numbers', async () => {
    mockCreate.mockResolvedValueOnce(
      makeToolResponse({
        debitAccount: 'INVALID',
        creditAccount: 'bad',
        vatTreatment: null,
        category: 'expense_other',
        confidence: 0.5,
        reasoning: 'Test',
        warnings: [],
        templateId: null,
      })
    )

    const { analyzeDescription } = await import('../description-analyzer')

    const result = await analyzeDescription({
      description: 'Something',
      transactionAmount: -100,
      transactionDate: '2026-01-15',
      transactionDescription: 'PAYMENT',
      merchantName: null,
      currency: 'SEK',
      entityType: 'enskild_firma',
    })

    // Should fall back to safe defaults
    expect(result.debitAccount).toBe('6991')
    expect(result.creditAccount).toBe('1930')
  })

  it('enforces expense direction: credit account must be 1930', async () => {
    mockCreate.mockResolvedValueOnce(
      makeToolResponse({
        debitAccount: '5420',
        creditAccount: '2440', // Not 1930 for a bank transaction expense
        vatTreatment: 'standard_25',
        category: 'expense_software',
        confidence: 0.8,
        reasoning: 'Test',
        warnings: [],
        templateId: null,
      })
    )

    const { analyzeDescription } = await import('../description-analyzer')

    const result = await analyzeDescription({
      description: 'Software subscription',
      transactionAmount: -500,
      transactionDate: '2026-01-15',
      transactionDescription: 'PAYMENT',
      merchantName: null,
      currency: 'SEK',
      entityType: 'enskild_firma',
    })

    expect(result.creditAccount).toBe('1930')
  })

  it('rejects private category', async () => {
    mockCreate.mockResolvedValueOnce(
      makeToolResponse({
        debitAccount: '2013',
        creditAccount: '1930',
        vatTreatment: null,
        category: 'private',
        confidence: 0.9,
        reasoning: 'Test',
        warnings: [],
        templateId: null,
      })
    )

    const { analyzeDescription } = await import('../description-analyzer')

    const result = await analyzeDescription({
      description: 'Something',
      transactionAmount: -100,
      transactionDate: '2026-01-15',
      transactionDescription: 'PAYMENT',
      merchantName: null,
      currency: 'SEK',
      entityType: 'enskild_firma',
    })

    expect(result.category).toBe('expense_other')
  })

  it('throws after retries exhausted', async () => {
    mockCreate.mockRejectedValue(new Error('API error'))

    const { analyzeDescription } = await import('../description-analyzer')

    await expect(
      analyzeDescription({
        description: 'Something',
        transactionAmount: -100,
        transactionDate: '2026-01-15',
        transactionDescription: 'PAYMENT',
        merchantName: null,
        currency: 'SEK',
        entityType: 'enskild_firma',
      })
    ).rejects.toThrow('AI description analysis failed after 3 attempts')

    // Should have retried 3 times (initial + 2 retries)
    expect(mockCreate).toHaveBeenCalledTimes(3)
  })

  it('validates invalid VAT treatment to null', async () => {
    mockCreate.mockResolvedValueOnce(
      makeToolResponse({
        debitAccount: '6991',
        creditAccount: '1930',
        vatTreatment: 'invalid_vat',
        category: 'expense_other',
        confidence: 0.5,
        reasoning: 'Test',
        warnings: [],
        templateId: null,
      })
    )

    const { analyzeDescription } = await import('../description-analyzer')

    const result = await analyzeDescription({
      description: 'Something',
      transactionAmount: -100,
      transactionDate: '2026-01-15',
      transactionDescription: 'PAYMENT',
      merchantName: null,
      currency: 'SEK',
      entityType: 'enskild_firma',
    })

    expect(result.vatTreatment).toBeNull()
  })
})
