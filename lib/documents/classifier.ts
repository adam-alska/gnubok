/**
 * Document Classifier using Claude Haiku Vision API
 *
 * SERVER-ONLY: This module uses the Anthropic SDK and must only be imported
 * in server components or API routes.
 *
 * Classifies documents as supplier invoices, receipts, government letters,
 * or unknown. Also detects EU reverse charge for supplier invoices.
 */

import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import type { DocumentClassificationType } from '@/types'

const anthropic = new Anthropic()

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

export interface DocumentClassification {
  type: DocumentClassificationType
  confidence: number
  reasoning: string
  isReverseCharge?: boolean
}

/**
 * Classify a document using Claude Haiku Vision.
 * Determines if it's a supplier invoice, receipt, government letter, or unknown.
 */
export async function classifyDocument(
  base64: string,
  mimeType: string
): Promise<DocumentClassification> {
  const systemPrompt = `Du är expert på att klassificera svenska affärsdokument.
Din uppgift är att avgöra vilken typ av dokument som visas.

DOKUMENTTYPER:
- supplier_invoice: Leverantörsfaktura (har fakturanummer, bankgiro/plusgiro, förfallodatum, leverantörsuppgifter)
- receipt: Kvitto (butiks-/restaurangkvitto, kort betalningsbevis med artikelrader)
- government_letter: Myndighetspost (från Skatteverket, Bolagsverket, Försäkringskassan, kommun, etc.)
- unknown: Annat dokument som inte passar ovan

FÖR LEVERANTÖRSFAKTUROR - kontrollera även:
- Är fakturan från en utländsk/EU-leverantör utan svensk moms?
- Nämner dokumentet "reverse charge", "omvänd skattskyldighet", eller "artikel 196"?
- Har leverantören ett VAT-nummer som INTE börjar med SE?
Om ja: flagga isReverseCharge = true`

  const userPrompt = `Klassificera detta dokument. Returnera ENDAST ett JSON-objekt:

{
  "type": "supplier_invoice" | "receipt" | "government_letter" | "unknown",
  "confidence": 0.95,
  "reasoning": "Kort förklaring",
  "isReverseCharge": false
}

Returnera ENDAST JSON-objektet, ingen annan text.`

  const isPdf = mimeType === 'application/pdf'
  const isImage = mimeType.startsWith('image/')

  if (!isPdf && !isImage) {
    throw new Error(`Unsupported file type: ${mimeType}`)
  }

  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const contentBlocks: Anthropic.MessageCreateParams['messages'][0]['content'] = isPdf
        ? [
            {
              type: 'document' as const,
              source: {
                type: 'base64' as const,
                media_type: 'application/pdf' as const,
                data: base64,
              },
            },
            { type: 'text' as const, text: userPrompt },
          ]
        : [
            {
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: mimeType as ImageMediaType,
                data: base64,
              },
            },
            { type: 'text' as const, text: userPrompt },
          ]

      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: contentBlocks }],
        system: systemPrompt,
      })

      const content = message.content[0]
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from AI')
      }

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
      return validateClassification(parsed)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error')

      if (error instanceof SyntaxError) {
        throw new Error(`Failed to parse AI response: ${lastError.message}`)
      }

      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS * (attempt + 1))
      }
    }
  }

  throw new Error(`Document classification failed after ${MAX_RETRIES} attempts: ${lastError?.message}`)
}

const VALID_TYPES: DocumentClassificationType[] = [
  'supplier_invoice',
  'receipt',
  'government_letter',
  'unknown',
]

function validateClassification(raw: unknown): DocumentClassification {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid classification result: not an object')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = raw as any

  const type = VALID_TYPES.includes(data.type) ? data.type : 'unknown'
  const confidence = typeof data.confidence === 'number' ? data.confidence : 0.5
  const reasoning = typeof data.reasoning === 'string' ? data.reasoning : ''
  const isReverseCharge = type === 'supplier_invoice' ? Boolean(data.isReverseCharge) : undefined

  return { type, confidence, reasoning, isReverseCharge }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
