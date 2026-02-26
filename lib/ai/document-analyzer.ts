/**
 * Unified Document Analyzer
 *
 * SERVER-ONLY: Uses the shared vision client (Anthropic SDK).
 *
 * Provides four modes:
 * - analyzeDocument(): Single Claude call that classifies AND extracts
 * - extractReceipt(): Standalone receipt extraction
 * - extractInvoice(): Standalone invoice extraction
 * - classifyDocument(): Lightweight classify-only
 */

import 'server-only'
import type {
  DocumentClassificationType,
  ReceiptExtractionResult,
  InvoiceExtractionResult,
  ExtractedInvoiceLineItem,
  VatBreakdownItem,
} from '@/types'
import { callVision } from './vision-client'
import {
  validateString,
  validateNumber,
  validateDate,
  validateTime,
  validateOrgNumber,
  validateVatNumber,
  validateAccountNumber,
} from './validation-helpers'
import { buildTemplatePromptSection } from '@/lib/bookkeeping/template-prompt'

// ============================================================
// Types
// ============================================================

export interface DocumentClassification {
  type: DocumentClassificationType
  confidence: number
  reasoning: string
  isReverseCharge?: boolean
}

export interface UnifiedExtractionResult {
  classification: DocumentClassification
  receipt?: ReceiptExtractionResult
  invoice?: InvoiceExtractionResult
}

interface ConsistencyResult {
  valid: boolean
  issues: string[]
}

// ============================================================
// Prompts
// ============================================================

const CLASSIFY_SYSTEM_PROMPT = `Du är expert på att klassificera svenska affärsdokument.
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

const RECEIPT_SYSTEM_PROMPT = `Du är expert på att extrahera data från svenska kvitton och fakturor.
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

const INVOICE_SYSTEM_PROMPT = `Du är expert på att extrahera data från svenska leverantörsfakturor.
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

function buildReceiptUserPrompt(): string {
  const templateSection = buildTemplatePromptSection()

  return `Analysera detta kvitto och extrahera strukturerad data.

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
      "suggestedCategory": "equipment|software|travel|office|marketing|professional_services|education|other",
      "suggestedTemplateId": "mall-id eller null"
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
  "confidence": 0.95,
  "suggestedTemplateId": "mall-id för hela kvittot eller null"
}

${templateSection}

KATEGORIER för suggestedCategory (backup om ingen mall matchar):
- equipment: Datorer, telefoner, kameror, teknikprylar
- software: Program, appar, molntjänster, prenumerationer
- travel: Flyg, tåg, hotell, taxi
- office: Kontorsmaterial, möbler, hyra
- marketing: Reklam, marknadsföring, PR
- professional_services: Konsulter, redovisning, juridik
- education: Kurser, böcker, utbildning
- other: Övrigt

Returnera ENDAST JSON-objektet, ingen annan text.`
}

function buildInvoiceUserPrompt(): string {
  const templateSection = buildTemplatePromptSection()

  return `Analysera denna leverantörsfaktura och extrahera strukturerad data.

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
      "accountSuggestion": "BAS-kontonummer som 5410 eller null",
      "suggestedTemplateId": "mall-id eller null"
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
  "confidence": 0.95,
  "suggestedTemplateId": "mall-id för hela fakturan eller null"
}

${templateSection}

KONTOKATEGORIER (BAS, backup om ingen mall matchar):
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
}

function buildUnifiedUserPrompt(): string {
  const templateSection = buildTemplatePromptSection()

  return `Analysera detta dokument. Gör BÅDA stegen:

STEG 1: Klassificera dokumenttypen.
STEG 2: Om det är ett kvitto eller leverantörsfaktura, extrahera all data.

Returnera ett JSON-objekt med följande struktur:

{
  "classification": {
    "type": "supplier_invoice" | "receipt" | "government_letter" | "unknown",
    "confidence": 0.95,
    "reasoning": "Kort förklaring",
    "isReverseCharge": false
  },
  "receipt": null,
  "invoice": null
}

Om type = "receipt", fyll i "receipt" med:
{
  "merchant": { "name": "...", "orgNumber": "XXXXXX-XXXX eller null", "vatNumber": "SE... eller null", "isForeign": false },
  "receipt": { "date": "YYYY-MM-DD", "time": "HH:MM eller null", "currency": "SEK" },
  "lineItems": [{ "description": "...", "quantity": 1, "unitPrice": 100, "lineTotal": 100, "vatRate": 25, "suggestedCategory": "equipment|software|travel|office|marketing|professional_services|education|other", "suggestedTemplateId": null }],
  "totals": { "subtotal": 100, "vatAmount": 25, "total": 125 },
  "flags": { "isRestaurant": false, "isSystembolaget": false, "isForeignMerchant": false },
  "confidence": 0.95,
  "suggestedTemplateId": null
}

Om type = "supplier_invoice", fyll i "invoice" med:
{
  "supplier": { "name": "...", "orgNumber": "XXXXXX-XXXX eller null", "vatNumber": "SE... eller null", "address": "...", "bankgiro": "...", "plusgiro": "..." },
  "invoice": { "invoiceNumber": "...", "invoiceDate": "YYYY-MM-DD", "dueDate": "YYYY-MM-DD", "paymentReference": "...", "currency": "SEK" },
  "lineItems": [{ "description": "...", "quantity": 1, "unitPrice": 100, "lineTotal": 100, "vatRate": 25, "accountSuggestion": "5410", "suggestedTemplateId": null }],
  "totals": { "subtotal": 100, "vatAmount": 25, "total": 125 },
  "vatBreakdown": [{ "rate": 25, "base": 100, "amount": 25 }],
  "confidence": 0.95,
  "suggestedTemplateId": null
}

${templateSection}

Om type = "government_letter" eller "unknown": lämna receipt och invoice som null.

Returnera ENDAST JSON-objektet, ingen annan text.`
}

// ============================================================
// Validation
// ============================================================

const VALID_CLASSIFICATION_TYPES: DocumentClassificationType[] = [
  'supplier_invoice',
  'receipt',
  'government_letter',
  'unknown',
]

const VALID_VAT_RATES = [0, 6, 12, 25]

function validateClassification(raw: unknown): DocumentClassification {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid classification result: not an object')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = raw as any

  const type = VALID_CLASSIFICATION_TYPES.includes(data.type) ? data.type : 'unknown'
  const confidence = typeof data.confidence === 'number' ? data.confidence : 0.5
  const reasoning = typeof data.reasoning === 'string' ? data.reasoning : ''
  const isReverseCharge = type === 'supplier_invoice' ? Boolean(data.isReverseCharge) : undefined

  return { type, confidence, reasoning, isReverseCharge }
}

function validateReceiptExtraction(raw: unknown): ReceiptExtractionResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid receipt extraction: not an object')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = raw as any

  const merchant = data.merchant || {}
  const receipt = data.receipt || {}
  const totals = data.totals || {}
  const flags = data.flags || {}

  return {
    merchant: {
      name: validateString(merchant.name),
      orgNumber: validateOrgNumber(merchant.orgNumber),
      vatNumber: validateVatNumber(merchant.vatNumber),
      isForeign: Boolean(flags.isForeignMerchant || merchant.isForeign),
    },
    receipt: {
      date: validateDate(receipt.date),
      time: validateTime(receipt.time),
      currency: validateString(receipt.currency) || 'SEK',
    },
    lineItems: validateReceiptLineItems(data.lineItems),
    totals: {
      subtotal: validateNumber(totals.subtotal),
      vatAmount: validateNumber(totals.vatAmount),
      total: validateNumber(totals.total),
    },
    flags: {
      isRestaurant: Boolean(flags.isRestaurant),
      isSystembolaget: Boolean(flags.isSystembolaget),
      isForeignMerchant: Boolean(flags.isForeignMerchant || merchant.isForeign),
    },
    confidence: validateNumber(data.confidence) || 0.5,
    suggestedTemplateId: validateString(data.suggestedTemplateId) || undefined,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateReceiptLineItems(data: any): ReceiptExtractionResult['lineItems'] {
  if (!Array.isArray(data)) return []

  return data
    .filter((item: unknown) => item && typeof item === 'object')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((item: any) => ({
      description: String(item.description || '').trim(),
      quantity: validateNumber(item.quantity) || 1,
      unitPrice: validateNumber(item.unitPrice),
      lineTotal: validateNumber(item.lineTotal) || 0,
      vatRate: validateNumber(item.vatRate),
      suggestedCategory: validateString(item.suggestedCategory),
      suggestedTemplateId: validateString(item.suggestedTemplateId) || undefined,
      confidence: validateNumber(item.confidence) || undefined,
    }))
    .filter((item: { lineTotal: number; description: string }) => item.lineTotal > 0 || item.description.length > 0)
}

function validateInvoiceExtraction(raw: unknown): InvoiceExtractionResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid invoice extraction: not an object')
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
    lineItems: validateInvoiceLineItems(data.lineItems),
    totals: {
      subtotal: validateNumber(totals.subtotal),
      vatAmount: validateNumber(totals.vatAmount),
      total: validateNumber(totals.total),
    },
    vatBreakdown: validateVatBreakdown(data.vatBreakdown),
    confidence: validateNumber(data.confidence) || 0.5,
    suggestedTemplateId: validateString(data.suggestedTemplateId) || undefined,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateInvoiceLineItems(data: any): ExtractedInvoiceLineItem[] {
  if (!Array.isArray(data)) return []

  return data
    .filter((item: unknown) => item && typeof item === 'object')
    .map((item: Record<string, unknown>) => ({
      description: String(item.description || '').trim(),
      quantity: validateNumber(item.quantity) || 1,
      unitPrice: validateNumber(item.unitPrice),
      lineTotal: validateNumber(item.lineTotal) || 0,
      vatRate: validateNumber(item.vatRate),
      accountSuggestion: validateAccountNumber(item.accountSuggestion as string | undefined),
      suggestedTemplateId: validateString(item.suggestedTemplateId as string | undefined) || undefined,
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

// ============================================================
// Consistency Validation
// ============================================================

/**
 * Post-extraction validation that catches AI hallucinations.
 */
export function validateExtractionConsistency(
  extraction: ReceiptExtractionResult | InvoiceExtractionResult,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _type: 'receipt' | 'invoice'
): ConsistencyResult {
  const issues: string[] = []

  const total = extraction.totals.total
  const lineItems = extraction.lineItems

  // Check: total > 0
  if (total !== null && total <= 0) {
    issues.push(`Total is ${total} — expected positive value`)
  }

  // Check: line item totals sum to receipt/invoice total (±1 SEK tolerance)
  if (total !== null && lineItems.length > 0) {
    const lineSum = lineItems.reduce((sum, item) => sum + item.lineTotal, 0)
    const diff = Math.abs(lineSum - total)
    if (diff > 1) {
      issues.push(`Line items sum to ${lineSum} but total is ${total} (diff: ${diff})`)
    }
  }

  // Check: VAT rates are valid (0, 6, 12, 25)
  for (const item of lineItems) {
    if (item.vatRate !== null && !VALID_VAT_RATES.includes(item.vatRate)) {
      issues.push(`Invalid VAT rate ${item.vatRate} on "${item.description}"`)
    }
  }

  // Check: descriptions aren't empty
  for (const item of lineItems) {
    if (!item.description || item.description.trim().length === 0) {
      issues.push('Line item has empty description')
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  }
}

// ============================================================
// Public API
// ============================================================

/**
 * Unified document analysis: classifies AND extracts in a single Claude call.
 * Falls back to dedicated extraction if misclassification detected.
 */
export async function analyzeDocument(
  base64: string,
  mimeType: string
): Promise<UnifiedExtractionResult> {
  const raw = await callVision({
    base64,
    mimeType,
    systemPrompt: `${CLASSIFY_SYSTEM_PROMPT}\n\n${RECEIPT_SYSTEM_PROMPT}\n\n${INVOICE_SYSTEM_PROMPT}`,
    userPrompt: buildUnifiedUserPrompt(),
    maxTokens: 4096,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = raw as any

  const classification = validateClassification(data.classification || data)

  const result: UnifiedExtractionResult = { classification }

  if (classification.type === 'receipt') {
    if (data.receipt) {
      result.receipt = validateReceiptExtraction(data.receipt)
      const consistency = validateExtractionConsistency(result.receipt, 'receipt')
      if (!consistency.valid && result.receipt.confidence > 0.5) {
        // Retry with dedicated extraction
        try {
          result.receipt = await extractReceipt(base64, mimeType)
        } catch {
          // Keep original with reduced confidence
          result.receipt = { ...result.receipt, confidence: result.receipt.confidence * 0.7 }
        }
      }
    } else {
      // Misclassification fallback: type says receipt but no receipt data
      try {
        result.receipt = await extractReceipt(base64, mimeType)
      } catch {
        // Classification only — no extraction available
      }
    }
  } else if (classification.type === 'supplier_invoice') {
    if (data.invoice) {
      result.invoice = validateInvoiceExtraction(data.invoice)
      const consistency = validateExtractionConsistency(result.invoice, 'invoice')
      if (!consistency.valid && result.invoice.confidence > 0.5) {
        try {
          result.invoice = await extractInvoice(base64, mimeType)
        } catch {
          result.invoice = { ...result.invoice, confidence: result.invoice.confidence * 0.7 }
        }
      }
    } else {
      try {
        result.invoice = await extractInvoice(base64, mimeType)
      } catch {
        // Classification only
      }
    }
  }

  return result
}

/**
 * Standalone receipt extraction.
 * For use when caller already knows it's a receipt.
 */
export async function extractReceipt(
  base64: string,
  mimeType: string
): Promise<ReceiptExtractionResult> {
  const raw = await callVision({
    base64,
    mimeType,
    systemPrompt: RECEIPT_SYSTEM_PROMPT,
    userPrompt: buildReceiptUserPrompt(),
    maxTokens: 4096,
  })

  const result = validateReceiptExtraction(raw)

  const consistency = validateExtractionConsistency(result, 'receipt')
  if (!consistency.valid && result.confidence > 0.5) {
    // Retry with correction prompt
    try {
      const correctionPrompt = `Föregående extraheringen hade dessa problem: ${consistency.issues.join('; ')}. Var god extrahera igen med korrigeringar.\n\n${buildReceiptUserPrompt()}`
      const retryRaw = await callVision({
        base64,
        mimeType,
        systemPrompt: RECEIPT_SYSTEM_PROMPT,
        userPrompt: correctionPrompt,
        maxTokens: 4096,
      })
      return validateReceiptExtraction(retryRaw)
    } catch {
      // Return original with reduced confidence
      return { ...result, confidence: result.confidence * 0.7 }
    }
  }

  return result
}

/**
 * Standalone invoice extraction.
 * For use when caller already knows it's an invoice.
 */
export async function extractInvoice(
  base64: string,
  mimeType: string
): Promise<InvoiceExtractionResult> {
  const raw = await callVision({
    base64,
    mimeType,
    systemPrompt: INVOICE_SYSTEM_PROMPT,
    userPrompt: buildInvoiceUserPrompt(),
    maxTokens: 4096,
  })

  const result = validateInvoiceExtraction(raw)

  const consistency = validateExtractionConsistency(result, 'invoice')
  if (!consistency.valid && result.confidence > 0.5) {
    try {
      const correctionPrompt = `Föregående extraheringen hade dessa problem: ${consistency.issues.join('; ')}. Var god extrahera igen med korrigeringar.\n\n${buildInvoiceUserPrompt()}`
      const retryRaw = await callVision({
        base64,
        mimeType,
        systemPrompt: INVOICE_SYSTEM_PROMPT,
        userPrompt: correctionPrompt,
        maxTokens: 4096,
      })
      return validateInvoiceExtraction(retryRaw)
    } catch {
      return { ...result, confidence: result.confidence * 0.7 }
    }
  }

  return result
}

/**
 * Lightweight classify-only (no extraction).
 * Kept for backward compatibility.
 */
export async function classifyDocument(
  base64: string,
  mimeType: string
): Promise<DocumentClassification> {
  const userPrompt = `Klassificera detta dokument. Returnera ENDAST ett JSON-objekt:

{
  "type": "supplier_invoice" | "receipt" | "government_letter" | "unknown",
  "confidence": 0.95,
  "reasoning": "Kort förklaring",
  "isReverseCharge": false
}

Returnera ENDAST JSON-objektet, ingen annan text.`

  const raw = await callVision({
    base64,
    mimeType,
    systemPrompt: CLASSIFY_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 1024,
  })

  return validateClassification(raw)
}
