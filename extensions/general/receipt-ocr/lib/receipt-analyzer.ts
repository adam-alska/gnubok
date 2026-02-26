/**
 * Receipt Analyzer — delegates to lib/ai/document-analyzer for extraction,
 * then applies receipt-specific validation and enhancement.
 *
 * SERVER-ONLY: uses the shared vision client via document-analyzer.
 *
 * Preserved public API: analyzeReceipt() and estimateProductValue().
 */

import 'server-only'
import { ChatAnthropic } from '@langchain/anthropic'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import type { ReceiptExtractionResult } from '@/types'
import { extractReceipt } from '@/lib/ai/document-analyzer'
import {
  SYSTEMBOLAGET_PATTERNS,
  RESTAURANT_PATTERNS,
} from './receipt-utils'

// Re-export client-safe functions for convenience
export {
  calculateRepresentationLimits,
  isRestaurantMCC,
  detectSystembolaget,
  detectRestaurant,
} from './receipt-utils'

// Retry config for estimateProductValue (still uses LangChain, not vision-client)
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

/**
 * Analyze a receipt image using Claude Haiku Vision.
 * Delegates extraction to the shared core, then applies receipt-specific enhancements.
 */
export async function analyzeReceipt(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' = 'image/jpeg'
): Promise<ReceiptExtractionResult> {
  const raw = await extractReceipt(imageBase64, mimeType)
  return validateAndEnhanceResult(raw)
}

/**
 * Receipt-specific validation and enhancement.
 * Applies Systembolaget/restaurant/foreign merchant detection
 * on top of the core extraction result.
 */
function validateAndEnhanceResult(result: ReceiptExtractionResult): ReceiptExtractionResult {
  // Detect special merchants using local patterns
  const merchantName = (result.merchant.name || '').toLowerCase()
  const isSystembolaget = result.flags.isSystembolaget || detectSystembolagetLocal(merchantName)
  const isRestaurant = result.flags.isRestaurant || detectRestaurantLocal(merchantName)
  const isForeign = result.flags.isForeignMerchant || detectForeignMerchant(result.merchant, result.receipt.currency)

  return {
    ...result,
    merchant: {
      ...result.merchant,
      isForeign,
    },
    flags: {
      isRestaurant,
      isSystembolaget,
      isForeignMerchant: isForeign,
    },
  }
}

/**
 * Detect if merchant is Systembolaget (local version using imported patterns)
 */
function detectSystembolagetLocal(merchantName: string): boolean {
  return SYSTEMBOLAGET_PATTERNS.some((pattern) => merchantName.includes(pattern))
}

/**
 * Detect if merchant is a restaurant (local version using imported patterns)
 */
function detectRestaurantLocal(merchantName: string): boolean {
  return RESTAURANT_PATTERNS.some((pattern) => merchantName.includes(pattern))
}

/**
 * Detect if merchant is foreign (non-Swedish)
 */
function detectForeignMerchant(
  merchant: ReceiptExtractionResult['merchant'],
  currency?: string
): boolean {
  if (currency && currency !== 'SEK') return true

  const orgNumber = merchant.orgNumber || ''
  if (orgNumber) {
    const digits = orgNumber.replace(/\D/g, '')
    if (digits.length !== 10) return true
  }

  const vatNumber = merchant.vatNumber || ''
  if (vatNumber && !vatNumber.toUpperCase().startsWith('SE')) return true

  return false
}

// ============================================================
// Product Value Estimation (LangChain — separate from receipt analysis)
// ============================================================

const ProductEstimationSchema = z.object({
  estimatedValue: z.number().describe('Uppskattat marknadsvärde i SEK'),
  confidence: z.number().min(0).max(1).describe('Hur säker du är på uppskattningen (0.0-1.0)'),
  description: z.string().describe('Kort beskrivning av produkten'),
  brand: z.string().nullable().describe('Varumärke om identifierbart, annars null'),
})

/**
 * Estimate product value from image using Claude Vision via LangChain.
 * Used for gift/product registration without receipt.
 */
export async function estimateProductValue(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' = 'image/jpeg'
): Promise<{
  estimatedValue: number
  confidence: number
  description: string
  brand: string | null
}> {
  const model = new ChatAnthropic({
    modelName: 'claude-haiku-4-5-20251001',
    maxTokens: 1024,
    temperature: 0,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  })

  const structuredModel = model.withStructuredOutput(ProductEstimationSchema)

  const systemPrompt = `Du är expert på att uppskatta marknadsvärdet på produkter baserat på bilder.
Din uppgift är att identifiera produkten och ge en rimlig uppskattning av dess marknadsvärde i svenska kronor.`

  const userPrompt = `Analysera produkten i bilden och uppskatta dess marknadsvärde i SEK. Identifiera varumärke om möjligt.`

  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await structuredModel.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage({
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
            {
              type: 'text',
              text: userPrompt,
            },
          ],
        }),
      ])

      return {
        estimatedValue: result.estimatedValue || 0,
        confidence: result.confidence || 0.5,
        description: result.description || 'Okänd produkt',
        brand: result.brand,
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error')

      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS * (attempt + 1))
      }
    }
  }

  throw new Error(`Product value estimation failed after ${MAX_RETRIES} attempts: ${lastError?.message}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
