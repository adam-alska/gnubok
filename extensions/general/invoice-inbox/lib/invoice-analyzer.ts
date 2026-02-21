/**
 * Invoice Analyzer using Claude Haiku Vision API
 *
 * SERVER-ONLY: This module uses the Anthropic SDK and must only be imported
 * in server components or API routes.
 *
 * Analyzes supplier invoice PDFs/images and extracts structured data
 * including supplier info, line items, VAT breakdown, and payment details.
 */

import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import type { InvoiceExtractionResult, ExtractedInvoiceLineItem, VatBreakdownItem } from '../types'

const anthropic = new Anthropic()

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

/**
 * Analyze a supplier invoice using Claude Haiku Vision.
 * Supports both PDF (native document support) and images.
 */
export async function analyzeInvoice(
  fileBase64: string,
  mimeType: string
): Promise<InvoiceExtractionResult> {
  const systemPrompt = `Du är expert på att extrahera data från svenska leverantörsfakturor.
Din uppgift är att noggrant analysera fakturan och extrahera all relevant information.

VIKTIGT:
- Extrahera leverantörens organisationsnummer (XXXXXX-XXXX format)
- Extrahera bankgiro och/eller plusgiro
- Extrahera varje fakturaradspost med belopp, moms
- Identifiera momssatser (25%, 12%, 6%, 0%)
- Extrahera OCR-nummer eller betalningsreferens
- Datum ska vara i ISO-format (YYYY-MM-DD)
- Belopp ska vara numeriska värden utan valutasymboler
- Ange konfidenstal (0.0-1.0) för hela extraheringen`

  const userPrompt = `Analysera denna leverantörsfaktura och extrahera strukturerad data.

Returnera ett JSON-objekt med följande struktur:

{
  "supplier": {
    "name": "Leverantörens namn",
    "orgNumber": "XXXXXX-XXXX eller null",
    "vatNumber": "SE... eller null",
    "address": "Fullständig adress eller null",
    "bankgiro": "XXX-XXXX eller null",
    "plusgiro": "XXXXXX-X eller null"
  },
  "invoice": {
    "invoiceNumber": "Fakturanummer",
    "invoiceDate": "YYYY-MM-DD",
    "dueDate": "YYYY-MM-DD",
    "paymentReference": "OCR-nummer eller referens eller null",
    "currency": "SEK"
  },
  "lineItems": [
    {
      "description": "Beskrivning av rad",
      "quantity": 1,
      "unitPrice": 100.00,
      "lineTotal": 100.00,
      "vatRate": 25,
      "accountSuggestion": "BAS-kontonummer som 5410 eller null"
    }
  ],
  "totals": {
    "subtotal": 100.00,
    "vatAmount": 25.00,
    "total": 125.00
  },
  "vatBreakdown": [
    {
      "rate": 25,
      "base": 100.00,
      "amount": 25.00
    }
  ],
  "confidence": 0.95
}

KONTOKATEGORIER (BAS):
- 4000-4999: Varuinköp, material
- 5010: Lokalhyra
- 5410: Förbrukningsinventarier
- 5420: Programvaror
- 5800-5899: Resekostnader
- 6100-6199: Kontorsmaterial
- 6200-6299: Telefon, internet
- 6310: Företagsförsäkringar
- 6530: Redovisningstjänster
- 6570: Bankkostnader

Returnera ENDAST JSON-objektet, ingen annan text.`

  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Build content based on mime type
      const isPdf = mimeType === 'application/pdf'
      const isImage = mimeType.startsWith('image/')

      if (!isPdf && !isImage) {
        throw new Error(`Unsupported file type: ${mimeType}`)
      }

      const contentBlocks: Anthropic.MessageCreateParams['messages'][0]['content'] = isPdf
        ? [
            {
              type: 'document' as const,
              source: {
                type: 'base64' as const,
                media_type: 'application/pdf' as const,
                data: fileBase64,
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
                data: fileBase64,
              },
            },
            { type: 'text' as const, text: userPrompt },
          ]

      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
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
      return validateAndEnhanceResult(parsed)
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

  throw new Error(`Invoice analysis failed after ${MAX_RETRIES} attempts: ${lastError?.message}`)
}

function validateAndEnhanceResult(raw: unknown): InvoiceExtractionResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid extraction result: not an object')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = raw as any

  const supplier = data.supplier || {}
  const invoice = data.invoice || {}
  const totals = data.totals || {}

  return {
    supplier: {
      name: validateString(supplier.name),
      orgNumber: validateOrgNumber(supplier.orgNumber),
      vatNumber: validateVatNumber(supplier.vatNumber),
      address: validateString(supplier.address),
      bankgiro: validateString(supplier.bankgiro),
      plusgiro: validateString(supplier.plusgiro),
    },
    invoice: {
      invoiceNumber: validateString(invoice.invoiceNumber),
      invoiceDate: validateDate(invoice.invoiceDate),
      dueDate: validateDate(invoice.dueDate),
      paymentReference: validateString(invoice.paymentReference),
      currency: validateString(invoice.currency) || 'SEK',
    },
    lineItems: validateLineItems(data.lineItems),
    totals: {
      subtotal: validateNumber(totals.subtotal),
      vatAmount: validateNumber(totals.vatAmount),
      total: validateNumber(totals.total),
    },
    vatBreakdown: validateVatBreakdown(data.vatBreakdown),
    confidence: validateNumber(data.confidence) || 0.5,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateLineItems(data: any): ExtractedInvoiceLineItem[] {
  if (!Array.isArray(data)) return []

  return data
    .filter((item: unknown) => item && typeof item === 'object')
    .map((item: Record<string, unknown>) => ({
      description: String(item.description || '').trim(),
      quantity: (validateNumber(item.quantity) || 1),
      unitPrice: validateNumber(item.unitPrice),
      lineTotal: validateNumber(item.lineTotal) || 0,
      vatRate: validateNumber(item.vatRate),
      accountSuggestion: validateAccountNumber(item.accountSuggestion as string | undefined),
    }))
    .filter((item: ExtractedInvoiceLineItem) => item.lineTotal > 0 || item.description.length > 0)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateVatBreakdown(data: any): VatBreakdownItem[] {
  if (!Array.isArray(data)) return []

  return data
    .filter((item: unknown) => item && typeof item === 'object')
    .map((item: Record<string, unknown>) => ({
      rate: validateNumber(item.rate) || 0,
      base: validateNumber(item.base) || 0,
      amount: validateNumber(item.amount) || 0,
    }))
    .filter((item: VatBreakdownItem) => item.amount > 0 || item.base > 0)
}

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
    if (!isNaN(parsed)) return parsed
  }
  return null
}

function validateDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  if (isNaN(date.getTime())) return null
  return date.toISOString().split('T')[0]
}

function validateOrgNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const digits = value.replace(/\D/g, '')
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

function validateAccountNumber(value: string | undefined): string | null {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  if (digits.length === 4 && parseInt(digits) >= 1000 && parseInt(digits) <= 9999) {
    return digits
  }
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
