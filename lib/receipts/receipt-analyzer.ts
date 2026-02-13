/**
 * Receipt Analyzer using Claude Haiku Vision API
 *
 * SERVER-ONLY: This module uses the Anthropic SDK and must only be imported
 * in server components or API routes.
 *
 * Analyzes receipt images and extracts line items, merchant info,
 * and special flags (restaurant, Systembolaget, foreign merchant).
 */

import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { ChatAnthropic } from '@langchain/anthropic'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import type { ReceiptExtractionResult, ExtractedLineItem } from '@/types'
import {
  SYSTEMBOLAGET_PATTERNS,
  RESTAURANT_PATTERNS,
  RESTAURANT_MCC_CODES,
} from './receipt-utils'

// Re-export client-safe functions for convenience
export {
  calculateRepresentationLimits,
  isRestaurantMCC,
  detectSystembolaget,
  detectRestaurant,
} from './receipt-utils'

const anthropic = new Anthropic()

// Maximum retries for API calls
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

/**
 * Analyze a receipt image using Claude Haiku Vision
 */
export async function analyzeReceipt(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' = 'image/jpeg'
): Promise<ReceiptExtractionResult> {
  const systemPrompt = `Du är expert på att extrahera data från svenska kvitton och fakturor.
Din uppgift är att noggrant analysera kvittobilden och extrahera all relevant information.

VIKTIGT:
- Extrahera VARJE artikelrad, inte bara summan
- Identifiera momssats per rad om möjligt (25%, 12%, 6%)
- Flagga om detta är: restaurang, Systembolaget, eller utländsk handlare
- Svenska organisationsnummer är i format XXXXXX-XXXX
- Momsregistreringsnummer börjar med SE
- Datum ska vara i ISO-format (YYYY-MM-DD)
- Belopp ska vara numeriska värden utan valutasymboler
- Ange konfidenstal (0.0-1.0) för hela extraheringen baserat på bildkvalitet`

  const userPrompt = `Analysera detta kvitto och extrahera strukturerad data.

Returnera ett JSON-objekt med följande struktur:

{
  "merchant": {
    "name": "Handlarens namn",
    "orgNumber": "XXXXXX-XXXX eller null",
    "vatNumber": "SE... eller null",
    "isForeign": false
  },
  "receipt": {
    "date": "YYYY-MM-DD",
    "time": "HH:MM eller null",
    "currency": "SEK"
  },
  "lineItems": [
    {
      "description": "Artikelbeskrivning",
      "quantity": 1,
      "unitPrice": 100.00,
      "lineTotal": 100.00,
      "vatRate": 25,
      "suggestedCategory": "equipment|software|travel|office|marketing|professional_services|education|other"
    }
  ],
  "totals": {
    "subtotal": 100.00,
    "vatAmount": 25.00,
    "total": 125.00
  },
  "flags": {
    "isRestaurant": false,
    "isSystembolaget": false,
    "isForeignMerchant": false
  },
  "confidence": 0.95
}

KATEGORIER för suggestedCategory:
- equipment: Datorer, telefoner, kameror, teknikprylar
- software: Program, appar, molntjänster, prenumerationer
- travel: Flyg, tåg, hotell, taxi
- office: Kontorsmaterial, möbler, hyra
- marketing: Reklam, marknadsföring, PR
- professional_services: Konsulter, redovisning, juridik
- education: Kurser, böcker, utbildning
- other: Övrigt

Returnera ENDAST JSON-objektet, ingen annan text.`

  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType,
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: userPrompt,
              },
            ],
          },
        ],
        system: systemPrompt,
      })

      // Extract the text content
      const content = message.content[0]
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from AI')
      }

      // Parse the JSON response - strip markdown code blocks if present
      let jsonText = content.text.trim()

      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.slice(7)
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.slice(3)
      }
      if (jsonText.endsWith('```')) {
        jsonText = jsonText.slice(0, -3)
      }
      jsonText = jsonText.trim()

      const parsed = JSON.parse(jsonText)

      // Validate and enhance the result
      return validateAndEnhanceResult(parsed)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error')

      // Don't retry on JSON parse errors
      if (error instanceof SyntaxError) {
        throw new Error(`Failed to parse AI response: ${lastError.message}`)
      }

      // Wait before retrying
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS * (attempt + 1))
      }
    }
  }

  throw new Error(`Receipt analysis failed after ${MAX_RETRIES} attempts: ${lastError?.message}`)
}

/**
 * Validate and enhance the extraction result
 */
function validateAndEnhanceResult(raw: unknown): ReceiptExtractionResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid extraction result: not an object')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = raw as any

  const merchant = data.merchant || {}
  const receipt = data.receipt || {}
  const totals = data.totals || {}
  const flags = data.flags || {}

  // Validate line items
  const lineItems = validateLineItems(data.lineItems)

  // Detect special merchants if not already flagged
  const merchantName = (merchant.name || '').toLowerCase()
  const isSystembolaget = flags.isSystembolaget || detectSystembolagetLocal(merchantName)
  const isRestaurant = flags.isRestaurant || detectRestaurantLocal(merchantName)
  const isForeign = flags.isForeignMerchant || detectForeignMerchant(merchant, receipt.currency)

  const result: ReceiptExtractionResult = {
    merchant: {
      name: validateString(merchant.name),
      orgNumber: validateOrgNumber(merchant.orgNumber),
      vatNumber: validateVatNumber(merchant.vatNumber),
      isForeign,
    },
    receipt: {
      date: validateDate(receipt.date),
      time: validateTime(receipt.time),
      currency: validateString(receipt.currency) || 'SEK',
    },
    lineItems,
    totals: {
      subtotal: validateNumber(totals.subtotal),
      vatAmount: validateNumber(totals.vatAmount),
      total: validateNumber(totals.total),
    },
    flags: {
      isRestaurant,
      isSystembolaget,
      isForeignMerchant: isForeign,
    },
    confidence: validateNumber(data.confidence) || 0.5,
  }

  return result
}

/**
 * Validate line items array
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateLineItems(data: any): ExtractedLineItem[] {
  if (!Array.isArray(data)) return []

  return data
    .filter((item) => item && typeof item === 'object' && item.description)
    .map((item) => ({
      description: String(item.description).trim(),
      quantity: validateNumber(item.quantity) || 1,
      unitPrice: validateNumber(item.unitPrice),
      lineTotal: validateNumber(item.lineTotal) || 0,
      vatRate: validateNumber(item.vatRate),
      suggestedCategory: validateCategory(item.suggestedCategory),
      confidence: validateNumber(item.confidence) || undefined,
    }))
    .filter((item) => item.lineTotal > 0 || item.description.length > 0)
}

/**
 * Validate expense category suggestion
 */
function validateCategory(value: unknown): string | null {
  const validCategories = [
    'equipment',
    'software',
    'travel',
    'office',
    'marketing',
    'professional_services',
    'education',
    'other',
  ]

  if (typeof value === 'string' && validCategories.includes(value)) {
    return value
  }
  return null
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function detectForeignMerchant(merchant: any, currency?: string): boolean {
  // Check currency (non-SEK suggests foreign)
  if (currency && currency !== 'SEK') {
    return true
  }

  // Check org number format (Swedish org numbers are 10 digits)
  const orgNumber = merchant.orgNumber || ''
  if (orgNumber && !isSwedishOrgNumber(orgNumber)) {
    return true
  }

  // Check VAT number (Swedish starts with SE)
  const vatNumber = merchant.vatNumber || ''
  if (vatNumber && !vatNumber.toUpperCase().startsWith('SE')) {
    return true
  }

  return false
}

/**
 * Check if org number is Swedish format
 */
function isSwedishOrgNumber(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  return digits.length === 10
}

// Validation helpers
function validateString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  return null
}

function validateNumber(value: unknown): number | null {
  if (typeof value === 'number' && !isNaN(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[^\d.-]/g, ''))
    if (!isNaN(parsed)) {
      return parsed
    }
  }
  return null
}

function validateDate(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const date = new Date(value)
  if (isNaN(date.getTime())) return null

  return date.toISOString().split('T')[0]
}

function validateTime(value: unknown): string | null {
  if (typeof value !== 'string') return null

  // Match HH:MM or HH:MM:SS
  const match = value.match(/^(\d{2}):(\d{2})(:\d{2})?$/)
  if (match) {
    return `${match[1]}:${match[2]}`
  }
  return null
}

function validateOrgNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const digits = value.replace(/\D/g, '')

  // Swedish org numbers are 10 digits
  if (digits.length === 10) {
    return `${digits.slice(0, 6)}-${digits.slice(6)}`
  }

  return null
}

function validateVatNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const cleaned = value.trim().toUpperCase()
  if (cleaned.startsWith('SE') && cleaned.length >= 12) {
    return cleaned
  }

  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const ProductEstimationSchema = z.object({
  estimatedValue: z.number().describe('Uppskattat marknadsvärde i SEK'),
  confidence: z.number().min(0).max(1).describe('Hur säker du är på uppskattningen (0.0-1.0)'),
  description: z.string().describe('Kort beskrivning av produkten'),
  brand: z.string().nullable().describe('Varumärke om identifierbart, annars null'),
})

/**
 * Estimate product value from image using Claude Vision via LangChain
 * Used for gift/product registration without receipt
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
