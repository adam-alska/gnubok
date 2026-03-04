/**
 * AI Description Analyzer
 *
 * SERVER-ONLY: Uses the Anthropic SDK and must only be imported
 * in server components or API routes.
 *
 * Interprets a user's plain-language description of a bank transaction
 * and returns a structured booking suggestion with Swedish accounting reasoning.
 * Uses Claude Haiku with structured tool outputs for reliable JSON.
 */

import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import type { TransactionCategory, VatTreatment, EntityType } from '@/types'

// ============================================================
// Types
// ============================================================

export interface DescriptionAnalysisInput {
  description: string
  transactionAmount: number
  transactionDate: string
  transactionDescription: string
  merchantName: string | null
  currency: string
  entityType: EntityType
}

export interface DescriptionAnalysisResult {
  debitAccount: string
  creditAccount: string
  vatTreatment: VatTreatment | null
  category: TransactionCategory
  confidence: number
  reasoning: string
  warnings: string[]
  templateId: string | null
}

// ============================================================
// Constants
// ============================================================

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 500
const MODEL = 'claude-haiku-4-5-20251001'

const VALID_CATEGORIES = new Set<string>([
  'income_services', 'income_products', 'income_other',
  'expense_equipment', 'expense_software', 'expense_travel',
  'expense_office', 'expense_marketing', 'expense_professional_services',
  'expense_education', 'expense_representation', 'expense_consumables',
  'expense_vehicle', 'expense_telecom', 'expense_bank_fees',
  'expense_card_fees', 'expense_currency_exchange', 'expense_other',
])

const VALID_VAT_TREATMENTS = new Set<string>([
  'standard_25', 'reduced_12', 'reduced_6', 'reverse_charge', 'export', 'exempt',
])

// ============================================================
// Tool Schema
// ============================================================

const ANALYZE_TOOL: Anthropic.Tool = {
  name: 'analyze_description',
  description: 'Analyze a user description and return a structured booking suggestion for the transaction.',
  input_schema: {
    type: 'object' as const,
    properties: {
      debitAccount: { type: 'string', description: 'BAS debit account number (4 digits)' },
      creditAccount: { type: 'string', description: 'BAS credit account number (4 digits)' },
      vatTreatment: {
        type: ['string', 'null'],
        description: 'VAT treatment: standard_25, reduced_12, reduced_6, reverse_charge, export, exempt, or null if exempt/no VAT',
      },
      category: { type: 'string', description: 'Transaction category (e.g. expense_representation, income_services)' },
      confidence: { type: 'number', description: 'Confidence score 0.0-1.0' },
      reasoning: { type: 'string', description: 'Explanation in Swedish of why this booking is correct' },
      warnings: {
        type: 'array',
        items: { type: 'string' },
        description: 'Warnings about deductibility limits, special rules, etc. (in Swedish)',
      },
      templateId: {
        type: ['string', 'null'],
        description: 'Matching booking template ID if applicable, or null',
      },
    },
    required: ['debitAccount', 'creditAccount', 'vatTreatment', 'category', 'confidence', 'reasoning', 'warnings', 'templateId'],
  },
}

// ============================================================
// System Prompt
// ============================================================

function buildSystemPrompt(entityType: EntityType): string {
  const privateAccount = entityType === 'aktiebolag' ? '2893' : '2013'
  const entityLabel = entityType === 'aktiebolag' ? 'Aktiebolag (AB)' : 'Enskild firma (EF)'

  return `Du är expert på svensk bokföring enligt BAS-kontoplanen. Analysera användarens beskrivning av en banktransaktion och returnera ett bokföringsförslag.

VANLIGA BAS-KONTON:
Utgifter: 5010 Lokalhyra | 5410 Förbrukningsinventarier | 5420 Programvara | 5460 Förbrukningsvaror | 5611 Bil/drivmedel | 5800 Resekostnader | 5910 Annonsering | 6071 Representation mat | 6200 Telefon/internet | 6530 Redovisning/konsult | 6570 Bankavgifter | 6991 Övriga kostnader | ${entityType === 'aktiebolag' ? '7610' : '6991'} Utbildning
Intäkter: 3001 Försäljning 25% | 3002 Försäljning 12% | 3003 Försäljning 6% | 3305 Export | 3308 EU-tjänster | 3900 Övriga intäkter
Moms: 2611 Utg moms 25% | 2621 Utg moms 12% | 2631 Utg moms 6% | 2641 Ing moms | 2645 Beräknad ing moms
Skulder: 2350 Skulder till kreditinstitut (banklån, Almi) | 2440 Leverantörsskulder (ENBART för leverantörsfakturor)
Övrigt: 1510 Kundfordringar | 1930 Företagskonto | 8410 Räntekostnader | ${privateAccount} Privat

MOMSREGLER:
- standard_25: Normala varor/tjänster (25%)
- reduced_12: Livsmedel, hotell, konstverk (12%)
- reduced_6: Böcker, tidningar, kollektivtrafik, kultur (6%)
- reverse_charge: Tjänsteköp från utlandet/EU
- export: Försäljning utanför Sverige
- exempt: Momsfritt (bank, försäkring, sjukvård, utbildning)

VARNINGSREGLER:
- Representation/måltider: Max 300 kr/person exkl moms för avdragsrätt (IL 16 kap 2§)
- Gåvor: Reklamgåvor max 300 kr, representationsgåvor max 180 kr
- Blandad användning (telefon/dator): Bara yrkesmässig del avdragsgill
- Bankavgifter, kortavgifter, valutaväxling: MOMSFRIA (exempt)

Företagsform: ${entityLabel}
Privatkonto: ${privateAccount}

REGLER:
1. Negativt belopp = utgift: debitera kostnadskonto, kreditera 1930
2. Positivt belopp = intäkt: debitera 1930, kreditera intäktskonto
3. Ge ett klart reasoning på svenska som förklarar valet
4. Lägg till warnings för avdragsbegränsningar eller speciella regler
5. templateId: null (vi matchar mallar separat)`
}

// ============================================================
// Analyzer
// ============================================================

export async function analyzeDescription(
  input: DescriptionAnalysisInput
): Promise<DescriptionAnalysisResult> {
  const client = new Anthropic()
  const isExpense = input.transactionAmount < 0

  const userPrompt = `Transaktion:
- Användarens beskrivning: "${input.description}"
- Banktext: "${input.transactionDescription}"
- Belopp: ${input.transactionAmount} ${input.currency}
- Datum: ${input.transactionDate}${input.merchantName ? `\n- Handlare: ${input.merchantName}` : ''}

Analysera och returnera bokföringsförslag med analyze_description-verktyget.`

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: [
          {
            type: 'text',
            text: buildSystemPrompt(input.entityType),
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools: [ANALYZE_TOOL],
        tool_choice: { type: 'tool', name: 'analyze_description' },
        messages: [{ role: 'user', content: userPrompt }],
      })

      const toolUseBlock = message.content.find(
        (block) => block.type === 'tool_use' && block.name === 'analyze_description'
      )

      if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
        throw new Error('No tool_use block in AI response')
      }

      return validateResult(toolUseBlock.input as Record<string, unknown>, isExpense, input.entityType)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error')
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1))
      }
    }
  }

  throw new Error(
    `AI description analysis failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`
  )
}

// ============================================================
// Validation
// ============================================================

function validateResult(
  raw: Record<string, unknown>,
  isExpense: boolean,
  entityType: EntityType
): DescriptionAnalysisResult {
  const ACCOUNT_REGEX = /^\d{4}$/

  // Validate accounts — default to safe fallbacks
  let debitAccount = typeof raw.debitAccount === 'string' && ACCOUNT_REGEX.test(raw.debitAccount)
    ? raw.debitAccount
    : (isExpense ? '6991' : '1930')

  let creditAccount = typeof raw.creditAccount === 'string' && ACCOUNT_REGEX.test(raw.creditAccount)
    ? raw.creditAccount
    : (isExpense ? '1930' : '3001')

  // Enforce direction: expenses debit expense account + credit 1930, income debit 1930 + credit revenue
  if (isExpense && creditAccount !== '1930') {
    creditAccount = '1930'
  }
  if (!isExpense && debitAccount !== '1930') {
    debitAccount = '1930'
  }

  // Validate VAT treatment
  const rawVat = raw.vatTreatment as string | null
  const vatTreatment = rawVat && VALID_VAT_TREATMENTS.has(rawVat)
    ? rawVat as VatTreatment
    : null

  // Validate category with direction correction
  let category = VALID_CATEGORIES.has(raw.category as string)
    ? (raw.category as TransactionCategory)
    : (isExpense ? 'expense_other' : 'income_other')

  if (category === 'private') {
    category = isExpense ? 'expense_other' : 'income_other'
  }
  if (isExpense && category.startsWith('income_')) {
    category = 'expense_other'
  }
  if (!isExpense && category.startsWith('expense_')) {
    category = 'income_other'
  }

  // Clamp confidence
  const confidence = Math.max(0, Math.min(1, Number(raw.confidence) || 0.5))

  // Reasoning — must be a non-empty string
  const reasoning = typeof raw.reasoning === 'string' && raw.reasoning.length > 0
    ? raw.reasoning
    : (isExpense ? 'Utgift bokförd på standardkonto' : 'Intäkt bokförd på standardkonto')

  // Warnings
  const warnings = Array.isArray(raw.warnings)
    ? (raw.warnings as unknown[]).filter((w): w is string => typeof w === 'string')
    : []

  // Template ID
  const templateId = typeof raw.templateId === 'string' && raw.templateId.length > 0
    ? raw.templateId
    : null

  return {
    debitAccount,
    creditAccount,
    vatTreatment,
    category,
    confidence,
    reasoning,
    warnings,
    templateId,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
