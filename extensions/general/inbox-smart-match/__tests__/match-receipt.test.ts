import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Bedrock SDK before importing the module under test
const mockSend = vi.fn()
vi.mock('@aws-sdk/client-bedrock-runtime', () => {
  class ConverseCommand {
    public input: unknown
    constructor(input: unknown) { this.input = input }
  }
  class BedrockRuntimeClient {
    send(command: unknown) { return mockSend(command) }
  }
  return { BedrockRuntimeClient, ConverseCommand }
})

import { matchReceiptToCandidate } from '@/extensions/general/inbox-smart-match/lib/match-receipt'
import type { ReceiptExtractionResult } from '@/types'
import type { CandidateTransaction } from '@/extensions/general/inbox-smart-match/lib/fetch-candidates'

function makeExtracted(): ReceiptExtractionResult {
  return {
    merchant: { name: 'Willys Hemma', orgNumber: null, vatNumber: null, isForeign: false },
    receipt: { date: '2026-04-15', time: null, currency: 'SEK' },
    lineItems: [],
    totals: { subtotal: 239, vatAmount: 60, total: 299 },
    flags: { isRestaurant: false, isSystembolaget: false, isForeignMerchant: false },
    confidence: 0.9,
  } as ReceiptExtractionResult
}

function makeCandidates(): CandidateTransaction[] {
  return [
    { id: 't1', date: '2026-04-15', description: 'WILLYS SÖDERM', amount: -299, amount_sek: null, currency: 'SEK', merchant_name: 'Willys' },
    { id: 't2', date: '2026-04-14', description: 'ICA MAXI', amount: -312, amount_sek: null, currency: 'SEK', merchant_name: 'ICA' },
  ]
}

function mockBedrockResponse(toolInput: Record<string, unknown>) {
  mockSend.mockResolvedValue({
    output: {
      message: {
        content: [
          {
            toolUse: {
              toolUseId: 'id',
              name: 'match_receipt',
              input: toolInput,
            },
          },
        ],
      },
    },
    usage: { inputTokens: 100, outputTokens: 20 },
  })
}

describe('matchReceiptToCandidate', () => {
  beforeEach(() => {
    mockSend.mockReset()
    process.env.AWS_ACCESS_KEY_ID = 'test'
    process.env.AWS_SECRET_ACCESS_KEY = 'test'
    process.env.AWS_REGION = 'eu-north-1'
  })

  it('returns a matched result when LLM picks a valid candidate', async () => {
    mockBedrockResponse({
      matched: true,
      transaction_id: 't1',
      confidence: 96,
      reasoning: 'Exakt belopp och datum. Willys matchar WILLYS SÖDERM.',
    })

    const result = await matchReceiptToCandidate({
      extracted: makeExtracted(),
      candidates: makeCandidates(),
    })

    expect(result.matched).toBe(true)
    expect(result.transactionId).toBe('t1')
    expect(result.confidence).toBeCloseTo(0.96, 2)
    expect(result.reasoning).toContain('Willys')
  })

  it('returns no match when LLM says matched=false', async () => {
    mockBedrockResponse({
      matched: false,
      transaction_id: null,
      confidence: 10,
      reasoning: 'Ingen kandidat har rätt belopp eller handlare.',
    })

    const result = await matchReceiptToCandidate({
      extracted: makeExtracted(),
      candidates: makeCandidates(),
    })

    expect(result.matched).toBe(false)
    expect(result.transactionId).toBeNull()
    expect(result.confidence).toBeCloseTo(0.1, 2)
  })

  it('degrades to no-match when LLM returns unknown transaction_id', async () => {
    mockBedrockResponse({
      matched: true,
      transaction_id: 'hallucinated-id-not-in-candidates',
      confidence: 80,
      reasoning: 'Detta är fel id',
    })

    const result = await matchReceiptToCandidate({
      extracted: makeExtracted(),
      candidates: makeCandidates(),
    })

    expect(result.matched).toBe(false)
    expect(result.transactionId).toBeNull()
    expect(result.confidence).toBe(0)
  })

  it('returns safe default when no tool use in response', async () => {
    mockSend.mockResolvedValue({
      output: { message: { content: [] } },
      usage: { inputTokens: 0, outputTokens: 0 },
    })

    const result = await matchReceiptToCandidate({
      extracted: makeExtracted(),
      candidates: makeCandidates(),
    })

    expect(result.matched).toBe(false)
    expect(result.transactionId).toBeNull()
  })
})
