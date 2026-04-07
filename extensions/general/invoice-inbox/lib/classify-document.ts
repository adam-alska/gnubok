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
- Belopp ska vara positiva tal med max 2 decimaler
- Datum i ISO-format (YYYY-MM-DD)
- Momssats som heltal (0, 6, 12, eller 25)
- Ge en confidence-poäng 0-100 för hur säker du är på klassificeringen och extraktionen

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

  // HEIC → convert to JPEG via sharp
  if (mimeType === 'image/heic' || mimeType === 'image/heif') {
    const jpegBuffer = await sharp(fileBuffer).jpeg({ quality: 90 }).toBuffer()
    return {
      image: {
        format: 'jpeg',
        source: { bytes: new Uint8Array(jpegBuffer) },
      },
    }
  }

  // Standard image formats
  const imageFormat = MIME_TO_IMAGE_FORMAT[mimeType]
  if (imageFormat) {
    return {
      image: {
        format: imageFormat as 'jpeg' | 'png' | 'webp' | 'gif',
        source: { bytes: new Uint8Array(fileBuffer) },
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
    return { documentType, extractedData, confidence, rawResponse: raw, usage }
  }

  if (documentType === 'receipt') {
    const extractedData = mapToReceiptExtraction(raw)
    if (!extractedData) return null
    return { documentType, extractedData, confidence, rawResponse: raw, usage }
  }

  return null
}

function mapToInvoiceExtraction(raw: Record<string, unknown>): InvoiceExtractionResult | null {
  const lineItems = mapInvoiceLineItems(raw.line_items)
  const vatBreakdown = mapVatBreakdown(raw.vat_breakdown)

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
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) / 100 || 0)),
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
- Belopp ska vara positiva tal
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
