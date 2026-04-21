/**
 * Document Classification Pipeline
 *
 * Pure function: file buffer + mime type → structured classification result.
 * No database, no side effects. Uses AWS Bedrock (Claude Sonnet) for vision-based
 * extraction of Swedish financial documents.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type ToolConfiguration,
  type Message,
} from '@aws-sdk/client-bedrock-runtime'
import sharp from 'sharp'
import type {
  InvoiceExtractionResult,
  ReceiptExtractionResult,
  ExtractedLineItem,
  ExtractedInvoiceLineItem,
  VatBreakdownItem,
} from '@/types'

// ── Types ────────────────────────────────────────────────────

export type DocumentClassificationType = 'supplier_invoice' | 'receipt' | 'government_letter' | 'unknown'

export interface ClassificationInput {
  fileBuffer: Buffer
  mimeType: string
  fileName: string
}

export interface ClassificationResult {
  documentType: DocumentClassificationType
  extractedData: InvoiceExtractionResult | ReceiptExtractionResult | null
  confidence: number
  rawResponse: Record<string, unknown>
  usage: { inputTokens: number; outputTokens: number }
}

// ── Bedrock client (lazy singleton) ──────────────────────────

let _client: BedrockRuntimeClient | null = null

function getClient(): BedrockRuntimeClient {
  if (!_client) {
    _client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'eu-north-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    })
  }
  return _client
}

// ── Constants ────────────────────────────────────────────────

const VALID_VAT_RATES = [0, 6, 12, 25]

const MIME_TO_IMAGE_FORMAT: Record<string, string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

// Bedrock rejects image bytes > 5 MB. Keep headroom under that ceiling.
const BEDROCK_IMAGE_BYTE_LIMIT = 4_500_000

// Shrink an image until it fits Bedrock's 5 MB cap. Steps down the longest edge
// and JPEG quality in sequence — preserves legibility of receipt text while
// guaranteeing we stay under the limit (or throwing if a photo is so dense it
// can't be compressed enough, which in practice never happens below 500px).
async function fitImageForBedrock(
  buffer: Buffer,
  mimeType: string
): Promise<{ buffer: Buffer; format: 'jpeg' | 'png' | 'webp' | 'gif' }> {
  const originalFormat = MIME_TO_IMAGE_FORMAT[mimeType] as 'jpeg' | 'png' | 'webp' | 'gif'

  if (buffer.byteLength <= BEDROCK_IMAGE_BYTE_LIMIT) {
    return { buffer, format: originalFormat }
  }

  // Re-encode to JPEG while shrinking. PNG at receipt-scale is usually 3-5×
  // larger than an equivalent JPEG, so JPEG is the right target format even
  // for PNG input.
  const dimensionSteps = [2400, 1800, 1400, 1000, 800]
  const qualitySteps = [85, 75, 60]

  for (const maxDim of dimensionSteps) {
    for (const quality of qualitySteps) {
      const candidate = await sharp(buffer)
        .rotate() // respect EXIF orientation
        .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()
      if (candidate.byteLength <= BEDROCK_IMAGE_BYTE_LIMIT) {
        return { buffer: candidate, format: 'jpeg' }
      }
    }
  }

  throw new Error('Bilden kunde inte komprimeras tillräckligt för AI-tolkning.')
}

// ── System prompt ────────────────────────────────────────────

const SYSTEM_PROMPT = `Du är en svensk bokföringsdokumentklassificerare och dataextraktor.

Du analyserar bilder och PDF:er av finansiella dokument (leverantörsfakturor, kvitton, skattedokument) och extraherar strukturerad data.

Kontext:
- Svensk bokföring enligt Bokföringslagen (BFL) och BFNAR
- Giltiga momssatser: 0%, 6%, 12%, 25%
- Organisationsnummer: 10 siffror, format XXXXXX-XXXX
- Vanliga betalningsmetoder: bankgiro, plusgiro, Swish, banköverföring, kort
- Valutor: SEK är standard, men EUR, USD, GBP etc förekommer

Instruktioner:
- Klassificera dokumenttypen
- Extrahera alla synliga fält — returnera null för fält som inte kan utläsas
- Belopp med max 2 decimaler. Totaler (amount_excl_vat, amount_incl_vat, vat_amount) är alltid positiva. line_items.amount är normalt positiva men KAN vara negativa för rabattrader.
- Datum i ISO-format (YYYY-MM-DD)
- Momssats som heltal (0, 6, 12, eller 25)
- Ge en confidence-poäng 0-100 för hur säker du är på klassificeringen och extraktionen

KRITISKT — Totaler och rabatter:
- amount_incl_vat MÅSTE motsvara fakturans slutbelopp ("Amount due", "Att betala", "Totalt", "Subtotal" när moms saknas). Summera ALDRIG delrader om fakturan anger ett explicit totalbelopp — använd det.
- Om en rad har en rabatt/discount under sig (t.ex. "Discount (-$10.00)", "Rabatt -100 kr"), extrahera radens NETTO-belopp (brutto − rabatt), INTE bruttobeloppet. Exempel: en rad "Compute Hours $50.68" följd av "Discount -$10.00" → line_items.amount = 40.68, inte 50.68.
- Summan av line_items.amount + moms MÅSTE bli lika med amount_incl_vat. Om det inte stämmer har du antingen missat en rabatt eller dubbelräknat en rad — kontrollera och justera.
- Om du är osäker på hur rabatter ska fördelas, lägg en enskild negativ "Rabatt"-rad i line_items så summan blir rätt.

Anropa ALLTID verktyget classify_document med resultatet.`

// ── Tool schema for structured output ────────────────────────

const CLASSIFICATION_TOOL: ToolConfiguration = {
  tools: [
    {
      toolSpec: {
        name: 'classify_document',
        description: 'Klassificera och extrahera data från ett svenskt finansiellt dokument',
        inputSchema: {
          json: {
            type: 'object',
            required: ['document_type', 'confidence'],
            properties: {
              document_type: {
                type: 'string',
                enum: ['supplier_invoice', 'receipt', 'government_letter', 'unknown'],
                description: 'Typ av dokument',
              },
              confidence: {
                type: 'integer',
                minimum: 0,
                maximum: 100,
                description: 'Säkerhet i klassificeringen (0-100)',
              },
              // Supplier invoice fields
              supplier_name: { type: ['string', 'null'] },
              supplier_org_number: { type: ['string', 'null'] },
              supplier_vat_number: { type: ['string', 'null'] },
              supplier_address: { type: ['string', 'null'] },
              supplier_bankgiro: { type: ['string', 'null'] },
              supplier_plusgiro: { type: ['string', 'null'] },
              invoice_number: { type: ['string', 'null'] },
              invoice_date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
              due_date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
              payment_reference: { type: ['string', 'null'], description: 'OCR-nummer eller betalningsreferens' },
              currency: { type: ['string', 'null'], description: 'ISO 4217 (t.ex. SEK, EUR)' },
              // Receipt fields
              merchant_name: { type: ['string', 'null'] },
              merchant_org_number: { type: ['string', 'null'] },
              merchant_vat_number: { type: ['string', 'null'] },
              merchant_is_foreign: { type: ['boolean', 'null'] },
              receipt_date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
              receipt_time: { type: ['string', 'null'], description: 'HH:MM' },
              is_restaurant: { type: ['boolean', 'null'] },
              is_systembolaget: { type: ['boolean', 'null'] },
              // Shared amount fields
              amount_excl_vat: { type: ['number', 'null'] },
              amount_incl_vat: { type: ['number', 'null'] },
              vat_amount: { type: ['number', 'null'] },
              // Line items
              line_items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    description: { type: 'string' },
                    quantity: { type: ['number', 'null'] },
                    unit_price: { type: ['number', 'null'] },
                    amount: { type: ['number', 'null'] },
                    vat_rate: { type: ['integer', 'null'], description: '0, 6, 12, or 25' },
                  },
                  required: ['description'],
                },
              },
              // VAT breakdown (for invoices)
              vat_breakdown: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    rate: { type: 'integer' },
                    base: { type: 'number' },
                    amount: { type: 'number' },
                  },
                  required: ['rate', 'base', 'amount'],
                },
              },
            },
          },
        },
      },
    },
  ],
  toolChoice: { any: {} },
}

// ── Core classification function ─────────────────────────────

export async function classifyDocument(input: ClassificationInput): Promise<ClassificationResult> {
  const contentBlock = await buildContentBlock(input)

  const messages: Message[] = [
    {
      role: 'user',
      content: [
        contentBlock,
        { text: 'Analysera detta dokument. Klassificera typ och extrahera all strukturerad data.' },
      ],
    },
  ]

  const modelId = process.env.BEDROCK_MODEL_ID || 'eu.anthropic.claude-sonnet-4-6'
  const maxTokens = parseInt(process.env.BEDROCK_MAX_TOKENS || '8192', 10)

  const command = new ConverseCommand({
    modelId,
    messages,
    system: [{ text: SYSTEM_PROMPT }],
    toolConfig: CLASSIFICATION_TOOL,
    inferenceConfig: { maxTokens },
  })

  const response = await getClient().send(command)

  // Extract tool use result from response
  const outputMessage = response.output?.message
  if (!outputMessage?.content) {
    throw new Error('No content in Bedrock response')
  }

  const toolUseBlock = outputMessage.content.find(
    (block): block is ContentBlock.ToolUseMember => 'toolUse' in block && block.toolUse !== undefined
  )

  if (!toolUseBlock?.toolUse?.input) {
    throw new Error('No tool use result in Bedrock response')
  }

  const rawData = toolUseBlock.toolUse.input as Record<string, unknown>
  const usage = {
    inputTokens: response.usage?.inputTokens ?? 0,
    outputTokens: response.usage?.outputTokens ?? 0,
  }

  // Validate and map to typed result
  const result = mapToClassificationResult(rawData, usage)

  // If validation found issues, retry once with correction
  if (!result) {
    return retryWithCorrection(input, rawData, usage)
  }

  return result
}

// ── Content block builder ────────────────────────────────────

async function buildContentBlock(input: ClassificationInput): Promise<ContentBlock> {
  const { fileBuffer, mimeType } = input

  // PDF → document block
  if (mimeType === 'application/pdf') {
    return {
      document: {
        format: 'pdf',
        name: sanitizeDocName(input.fileName),
        source: {
          bytes: new Uint8Array(fileBuffer),
        },
      },
    }
  }

  // HEIC → convert to JPEG via sharp, then fit to Bedrock's byte limit
  if (mimeType === 'image/heic' || mimeType === 'image/heif') {
    const jpegBuffer = await sharp(fileBuffer).rotate().jpeg({ quality: 90, mozjpeg: true }).toBuffer()
    const fitted = await fitImageForBedrock(jpegBuffer, 'image/jpeg')
    return {
      image: {
        format: fitted.format,
        source: { bytes: new Uint8Array(fitted.buffer) },
      },
    }
  }

  // Standard image formats — downscale if the buffer exceeds Bedrock's 5 MB cap
  const imageFormat = MIME_TO_IMAGE_FORMAT[mimeType]
  if (imageFormat) {
    const fitted = await fitImageForBedrock(fileBuffer, mimeType)
    return {
      image: {
        format: fitted.format,
        source: { bytes: new Uint8Array(fitted.buffer) },
      },
    }
  }

  throw new Error(`Unsupported MIME type: ${mimeType}`)
}

/** Sanitize filename for Bedrock document name (alphanumeric, spaces, hyphens, brackets only) */
function sanitizeDocName(fileName: string): string {
  const name = fileName.replace(/\.[^.]+$/, '') // strip extension
  return name.replace(/[^a-zA-Z0-9\s\-\[\]\(\)åäöÅÄÖ]/g, '').trim() || 'document'
}

// ── Response mapping + validation ────────────────────────────

function mapToClassificationResult(
  raw: Record<string, unknown>,
  usage: { inputTokens: number; outputTokens: number }
): ClassificationResult | null {
  const documentType = raw.document_type as DocumentClassificationType
  const confidence = Math.min(100, Math.max(0, Number(raw.confidence) || 0))

  if (!['supplier_invoice', 'receipt', 'government_letter', 'unknown'].includes(documentType)) {
    return null
  }

  if (documentType === 'government_letter' || documentType === 'unknown') {
    return {
      documentType,
      extractedData: null,
      confidence,
      rawResponse: raw,
      usage,
    }
  }

  if (documentType === 'supplier_invoice') {
    const extractedData = mapToInvoiceExtraction(raw)
    if (!extractedData) return null
    // mapToInvoiceExtraction caps its own confidence to 50% when line items
    // don't reconcile with amount_incl_vat. Propagate that cap to the outer
    // confidence so invoice_inbox_items.confidence (used by the UI badge)
    // also reflects the reconciliation failure.
    const effectiveConfidence = Math.min(confidence, Math.round(extractedData.confidence * 100))
    return { documentType, extractedData, confidence: effectiveConfidence, rawResponse: raw, usage }
  }

  if (documentType === 'receipt') {
    const extractedData = mapToReceiptExtraction(raw)
    if (!extractedData) return null
    return { documentType, extractedData, confidence, rawResponse: raw, usage }
  }

  return null
}

// Sum of line items must approximately match the extracted subtotal.
// Allows 0.02 * max(|subtotal|, 1) tolerance for rounding. Returns true if the extraction
// is internally consistent; false signals the model skipped a discount or double-counted.
function invoiceTotalsAreConsistent(raw: Record<string, unknown>): boolean {
  const subtotal = Number(raw.amount_excl_vat)
  const total = Number(raw.amount_incl_vat)
  const vat = Number(raw.vat_amount) || 0
  const items = Array.isArray(raw.line_items) ? raw.line_items : []
  if (!items.length) return true // nothing to compare against
  if (!isFinite(subtotal) && !isFinite(total)) return true

  const sumOfLines = items.reduce((acc, item) => {
    if (typeof item !== 'object' || item === null) return acc
    const amount = Number((item as Record<string, unknown>).amount)
    return acc + (isFinite(amount) ? amount : 0)
  }, 0)

  const anchor = isFinite(subtotal) ? subtotal : total - vat
  const tolerance = Math.max(0.02, Math.abs(anchor) * 0.02)
  return Math.abs(sumOfLines - anchor) <= tolerance
}

function mapToInvoiceExtraction(raw: Record<string, unknown>): InvoiceExtractionResult | null {
  const lineItems = mapInvoiceLineItems(raw.line_items)
  const vatBreakdown = mapVatBreakdown(raw.vat_breakdown)
  const totalsConsistent = invoiceTotalsAreConsistent(raw)

  const result: InvoiceExtractionResult = {
    supplier: {
      name: strOrNull(raw.supplier_name),
      orgNumber: strOrNull(raw.supplier_org_number),
      vatNumber: strOrNull(raw.supplier_vat_number),
      address: strOrNull(raw.supplier_address),
      bankgiro: strOrNull(raw.supplier_bankgiro),
      plusgiro: strOrNull(raw.supplier_plusgiro),
    },
    invoice: {
      invoiceNumber: strOrNull(raw.invoice_number),
      invoiceDate: dateOrNull(raw.invoice_date),
      dueDate: dateOrNull(raw.due_date),
      paymentReference: strOrNull(raw.payment_reference),
      currency: strOrNull(raw.currency) || 'SEK',
    },
    lineItems,
    totals: {
      subtotal: roundAmount(raw.amount_excl_vat),
      vatAmount: roundAmount(raw.vat_amount),
      total: roundAmount(raw.amount_incl_vat),
    },
    vatBreakdown,
    // If totals don't reconcile with line items, cap confidence at 50% so the UI flags it
    confidence: (() => {
      const raw_conf = Math.min(1, Math.max(0, Number(raw.confidence) / 100 || 0))
      return totalsConsistent ? raw_conf : Math.min(raw_conf, 0.5)
    })(),
  }

  return result
}

function mapToReceiptExtraction(raw: Record<string, unknown>): ReceiptExtractionResult | null {
  const lineItems = mapReceiptLineItems(raw.line_items)

  const result: ReceiptExtractionResult = {
    merchant: {
      name: strOrNull(raw.merchant_name),
      orgNumber: strOrNull(raw.merchant_org_number),
      vatNumber: strOrNull(raw.merchant_vat_number),
      isForeign: Boolean(raw.merchant_is_foreign),
    },
    receipt: {
      date: dateOrNull(raw.receipt_date),
      time: strOrNull(raw.receipt_time),
      currency: strOrNull(raw.currency) || 'SEK',
    },
    lineItems,
    totals: {
      subtotal: roundAmount(raw.amount_excl_vat),
      vatAmount: roundAmount(raw.vat_amount),
      total: roundAmount(raw.amount_incl_vat),
    },
    flags: {
      isRestaurant: Boolean(raw.is_restaurant),
      isSystembolaget: Boolean(raw.is_systembolaget),
      isForeignMerchant: Boolean(raw.merchant_is_foreign),
    },
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) / 100 || 0)),
  }

  return result
}

// ── Line item mappers ────────────────────────────────────────

function mapInvoiceLineItems(items: unknown): ExtractedInvoiceLineItem[] {
  if (!Array.isArray(items)) return []
  return items
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      description: String(item.description || ''),
      quantity: typeof item.quantity === 'number' ? item.quantity : 1,
      unitPrice: roundAmount(item.unit_price),
      lineTotal: roundAmount(item.amount) ?? 0,
      vatRate: validateVatRate(item.vat_rate),
      accountSuggestion: null,
    }))
}

function mapReceiptLineItems(items: unknown): ExtractedLineItem[] {
  if (!Array.isArray(items)) return []
  return items
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      description: String(item.description || ''),
      quantity: typeof item.quantity === 'number' ? item.quantity : 1,
      unitPrice: roundAmount(item.unit_price),
      lineTotal: roundAmount(item.amount) ?? 0,
      vatRate: validateVatRate(item.vat_rate),
      suggestedCategory: null,
    }))
}

function mapVatBreakdown(items: unknown): VatBreakdownItem[] {
  if (!Array.isArray(items)) return []
  return items
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .filter((item) => VALID_VAT_RATES.includes(Number(item.rate)))
    .map((item) => ({
      rate: Number(item.rate),
      base: Math.round(Number(item.base || 0) * 100) / 100,
      amount: Math.round(Number(item.amount || 0) * 100) / 100,
    }))
}

// ── Retry with correction ────────────────────────────────────

async function retryWithCorrection(
  input: ClassificationInput,
  previousResult: Record<string, unknown>,
  previousUsage: { inputTokens: number; outputTokens: number }
): Promise<ClassificationResult> {
  const contentBlock = await buildContentBlock(input)

  const messages: Message[] = [
    {
      role: 'user',
      content: [
        contentBlock,
        { text: 'Analysera detta dokument. Klassificera typ och extrahera all strukturerad data.' },
      ],
    },
    {
      role: 'assistant',
      content: [
        {
          toolUse: {
            toolUseId: 'retry_1',
            name: 'classify_document',
            input: previousResult as Record<string, unknown>,
          } as ContentBlock.ToolUseMember['toolUse'],
        },
      ],
    },
    {
      role: 'user',
      content: [
        {
          toolResult: {
            toolUseId: 'retry_1',
            status: 'error',
            content: [
              {
                text: `Valideringen misslyckades. Kontrollera:
- document_type måste vara ett av: supplier_invoice, receipt, government_letter, unknown
- Datum i format YYYY-MM-DD
- Momssatser måste vara 0, 6, 12, eller 25
- Totaler: amount_incl_vat ska vara fakturans slutbelopp. Summa av line_items.amount + vat_amount MÅSTE bli lika med amount_incl_vat. Om rader har rabatt under sig, använd NETTO-beloppet per rad, eller lägg till en separat negativ rabattrad så summan stämmer.
Försök igen med korrigerad data.`,
              },
            ],
          },
        },
      ],
    },
  ]

  const modelId = process.env.BEDROCK_MODEL_ID || 'eu.anthropic.claude-sonnet-4-6'
  const maxTokens = parseInt(process.env.BEDROCK_MAX_TOKENS || '8192', 10)

  try {
    const command = new ConverseCommand({
      modelId,
      messages,
      system: [{ text: SYSTEM_PROMPT }],
      toolConfig: CLASSIFICATION_TOOL,
      inferenceConfig: { maxTokens },
    })

    const response = await getClient().send(command)
    const outputMessage = response.output?.message
    const toolUseBlock = outputMessage?.content?.find(
      (block): block is ContentBlock.ToolUseMember => 'toolUse' in block && block.toolUse !== undefined
    )

    if (!toolUseBlock?.toolUse?.input) {
      throw new Error('No tool use in retry response')
    }

    const rawData = toolUseBlock.toolUse.input as Record<string, unknown>
    const retryUsage = {
      inputTokens: previousUsage.inputTokens + (response.usage?.inputTokens ?? 0),
      outputTokens: previousUsage.outputTokens + (response.usage?.outputTokens ?? 0),
    }

    const result = mapToClassificationResult(rawData, retryUsage)
    if (result) return result
  } catch {
    // Retry failed — fall through to error return
  }

  // Both attempts failed — return error result with raw data
  return {
    documentType: 'unknown',
    extractedData: null,
    confidence: 0,
    rawResponse: previousResult,
    usage: previousUsage,
  }
}

// ── Utility helpers ──────────────────────────────────────────

function strOrNull(val: unknown): string | null {
  if (typeof val === 'string' && val.trim().length > 0) return val.trim()
  return null
}

function dateOrNull(val: unknown): string | null {
  if (typeof val !== 'string') return null
  // Validate ISO date format YYYY-MM-DD
  const match = val.match(/^\d{4}-\d{2}-\d{2}$/)
  if (!match) return null
  const d = new Date(val)
  if (isNaN(d.getTime())) return null
  return val
}

function roundAmount(val: unknown): number | null {
  if (val === null || val === undefined) return null
  const n = Number(val)
  if (isNaN(n)) return null
  return Math.round(n * 100) / 100
}

function validateVatRate(val: unknown): number | null {
  if (val === null || val === undefined) return null
  const n = Number(val)
  if (VALID_VAT_RATES.includes(n)) return n
  return null
}
