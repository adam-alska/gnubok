/**
 * AI Categorization Engine
 *
 * SERVER-ONLY: Uses the Anthropic SDK and must only be imported
 * in server components or API routes.
 *
 * Provider-abstracted AI categorization for Swedish BAS account mapping.
 * Uses Claude Haiku with structured tool outputs for reliable JSON.
 * Accepts pre-filtered candidate templates from embedding search (Tier 2)
 * instead of dumping all ~100 templates into the prompt.
 */

import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { BOOKING_TEMPLATES, type BookingTemplate } from '@/lib/bookkeeping/booking-templates'
import type { TransactionCategory, EntityType } from '@/types'

// ============================================================
// Types
// ============================================================

export interface TransactionForCategorization {
  id: string
  description: string
  amount: number
  date: string
  merchant_name: string | null
  mcc_code: number | null
  currency: string
}

export interface AccountUsageEntry {
  account_number: string
  count: number
}

export interface MerchantHistoryEntry {
  merchant_name: string
  category: string
  template_id: string | null
  count: number
}

export interface CategorizationContext {
  entityType: EntityType
  recentHistory: { description: string; category: string }[]
}

export interface DocumentEnrichment {
  type: 'receipt' | 'supplier_invoice'
  merchantName?: string
  lineItems?: Array<{ description: string; amount: number; category?: string; accountSuggestion?: string }>
  vatBreakdown?: Array<{ rate: number; amount: number }>
  isReverseCharge?: boolean
}

export interface EnrichedCategorizationContext extends CategorizationContext {
  candidateTemplates: BookingTemplate[]
  userAccountUsage: AccountUsageEntry[]
  merchantHistory: MerchantHistoryEntry[]
  documentData?: DocumentEnrichment
}

export interface CategorizationSuggestion {
  transactionId: string
  category: TransactionCategory
  basAccount: string
  taxCode: string | null
  confidence: number
  reasoning: string
  isPrivate: boolean
  templateId?: string
}

export interface CategorizationProvider {
  categorize(
    transactions: TransactionForCategorization[],
    context: CategorizationContext | EnrichedCategorizationContext
  ): Promise<CategorizationSuggestion[]>
}

// ============================================================
// BAS Account + Category Mapping (used in prompt)
// ============================================================

function getCategoryAccountMap(entityType: EntityType): Record<string, { account: string; label: string }> {
  const educationAccount = entityType === 'aktiebolag' ? '7610' : '6991'
  return {
    income_services: { account: '3001', label: 'Tjänsteförsäljning' },
    income_products: { account: '3001', label: 'Varuförsäljning' },
    income_other: { account: '3900', label: 'Övriga intäkter' },
    expense_equipment: { account: '5410', label: 'Förbrukningsinventarier' },
    expense_software: { account: '5420', label: 'Programvara' },
    expense_travel: { account: '5800', label: 'Resekostnader' },
    expense_office: { account: '5010', label: 'Lokalhyra/kontorskostnad' },
    expense_marketing: { account: '5910', label: 'Annonsering/marknadsföring' },
    expense_professional_services: { account: '6530', label: 'Redovisning/konsulttjänster' },
    expense_education: { account: educationAccount, label: 'Utbildning' },
    expense_representation: { account: '6071', label: 'Representation (mat/möte)' },
    expense_consumables: { account: '5460', label: 'Förbrukningsvaror' },
    expense_vehicle: { account: '5611', label: 'Bil & drivmedel' },
    expense_telecom: { account: '6200', label: 'Telefon & internet' },
    expense_bank_fees: { account: '6570', label: 'Bankavgifter' },
    expense_card_fees: { account: '6570', label: 'Kortavgifter' },
    expense_currency_exchange: { account: '7960', label: 'Valutakursförluster' },
    expense_other: { account: '6991', label: 'Övriga kostnader' },
  }
}

/** Fallback template IDs when AI doesn't provide one */
const CATEGORY_DEFAULT_TEMPLATES: Record<string, string> = {
  expense_representation: 'representation_external',
  expense_equipment: 'equipment_small',
  expense_software: 'it_saas_subscription',
  expense_travel: 'travel_transport',
  expense_office: 'office_supplies_general',
  expense_consumables: 'office_supplies_general',
  expense_vehicle: 'vehicle_fuel',
  expense_telecom: 'telecom_mobile',
  expense_marketing: 'marketing_online_ads',
  expense_education: 'education_course',
  expense_professional_services: 'prof_accounting',
}

/**
 * Build template reference from candidate templates (pre-filtered by embeddings)
 * or fall back to full template list if no candidates provided.
 */
function getTemplateReference(
  direction: 'expense' | 'income',
  candidateTemplates?: BookingTemplate[]
): string {
  const templates = candidateTemplates && candidateTemplates.length > 0
    ? candidateTemplates
    : BOOKING_TEMPLATES

  return templates
    .filter((t) => t.direction === direction || t.direction === 'transfer')
    .map((t) => `${t.id}: ${t.name_sv} → ${t.debit_account}/${t.credit_account}`)
    .join('\n')
}

const NON_DEDUCTIBLE_RULES = `
MOMSREGLER FÖR SPECIFIKA KATEGORIER:
- Representation/måltider: Max 300 kr/person exkl. moms (IL 16 kap 2§), konto 6071/6072
- Gåvor: Reklamgåvor max 300 kr/mottagare, representationsgåvor max 180 kr
- Telefon/dator vid blandad användning: Bara yrkesmässig del avdragsgill
`

// ============================================================
// Classify Transaction Tool Schema
// ============================================================

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: 'classify_transactions',
  description: 'Classify a batch of bank transactions into Swedish BAS accounts and booking templates.',
  input_schema: {
    type: 'object' as const,
    properties: {
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            transactionId: { type: 'string', description: 'Transaction ID' },
            templateId: { type: 'string', description: 'Booking template ID (REQUIRED — must be from the provided templates list)' },
            category: { type: 'string', description: 'Transaction category (e.g. expense_representation, expense_equipment, expense_office)' },
            basAccount: { type: 'string', description: 'BAS account number (4 digits)' },
            taxCode: { type: ['string', 'null'], description: 'Tax code: MPI for deductible expenses with VAT, MP1 for income with VAT, null for VAT-exempt/private' },
            confidence: { type: 'number', description: 'Confidence score 0.0-1.0' },
            reasoning: { type: 'string', description: 'Short reasoning in Swedish' },
            isPrivate: { type: 'boolean', description: 'Whether this is a private expense' },
          },
          required: ['transactionId', 'templateId', 'category', 'basAccount', 'confidence', 'reasoning', 'isPrivate'],
        },
      },
    },
    required: ['suggestions'],
  },
}

// ============================================================
// Anthropic Provider
// ============================================================

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000
const MAX_BATCH_SIZE = 20

export class AnthropicCategorizationProvider implements CategorizationProvider {
  private client: Anthropic
  private model: string

  constructor(model = 'claude-haiku-4-5-20251001') {
    this.client = new Anthropic()
    this.model = model
  }

  async categorize(
    transactions: TransactionForCategorization[],
    context: CategorizationContext | EnrichedCategorizationContext
  ): Promise<CategorizationSuggestion[]> {
    // Cap batch size
    const batch = transactions.slice(0, MAX_BATCH_SIZE)
    if (batch.length === 0) return []

    const enriched = isEnrichedContext(context) ? context : null
    const privateAccount = context.entityType === 'aktiebolag' ? '2893' : '2013'
    const categoryAccountMap = getCategoryAccountMap(context.entityType)

    // Build template references — use candidate templates if available
    const hasExpenses = batch.some((t) => t.amount < 0)
    const hasIncome = batch.some((t) => t.amount > 0)
    const candidates = enriched?.candidateTemplates
    const templateRef = [
      hasExpenses ? `UTGIFTSMALLAR:\n${getTemplateReference('expense', candidates)}` : '',
      hasIncome ? `INTÄKTSMALLAR:\n${getTemplateReference('income', candidates)}` : '',
    ].filter(Boolean).join('\n\n')

    // Build account usage context
    const accountUsageContext = enriched?.userAccountUsage && enriched.userAccountUsage.length > 0
      ? `\nAnvändarens mest använda konton:\n${enriched.userAccountUsage
          .slice(0, 15)
          .map((a) => `- ${a.account_number} (${a.count} bokningar)`)
          .join('\n')}`
      : ''

    // Build merchant history context
    const merchantHistoryContext = enriched?.merchantHistory && enriched.merchantHistory.length > 0
      ? `\nTidigare kategorisering av dessa handlare:\n${enriched.merchantHistory
          .map((m) => `- "${m.merchant_name}" → ${m.category}${m.template_id ? ` (mall: ${m.template_id})` : ''} (${m.count}x)`)
          .join('\n')}`
      : ''

    // Build document enrichment context (from linked receipt or supplier invoice)
    const documentContext = enriched?.documentData
      ? buildDocumentContext(enriched.documentData)
      : ''

    const systemPrompt = `Du är expert på svensk bokföring och kategorisering av banktransaktioner enligt BAS-kontoplanen.
Din uppgift är att kategorisera varje transaktion till rätt mall-ID (templateId) och BAS-konto.

BOKFÖRINGSMALLAR (id: namn → debitkonto/kreditkonto):
${templateRef}

KATEGORIER (fallback om ingen mall matchar):
${Object.entries(categoryAccountMap)
  .map(([cat, info]) => `- ${cat}: ${info.account} (${info.label})`)
  .join('\n')}

Företagsform: ${context.entityType === 'aktiebolag' ? 'Aktiebolag (AB)' : 'Enskild firma (EF)'}
Privatkonto: ${privateAccount}

MOMSHANTERING:
- Bankavgifter, kortavgifter, valutaväxling: MOMSFRIA
- Övriga affärskostnader: Normalt 25% moms (ingående moms, MPI)
- Intäkter: Normalt 25% moms (utgående moms, MP1)

${NON_DEDUCTIBLE_RULES}
${documentContext}
REGLER:
1. Negativa belopp = utgifter, positiva = intäkter
2. VIKTIGT: Dessa transaktioner kommer från företagets bankkonto/kort. Anta ALLTID att de är affärsrelaterade. Klassificera ALDRIG som "private" — det beslutet tar användaren själv.
3. Ange confidence 0.0-1.0 baserat på hur säker du är på rätt affärskategori
4. Ange kort reasoning på svenska
5. Restauranger/mat/café → expense_representation (6071). Bygghandel/järnhandel → expense_equipment eller expense_consumables. Heminredning/kontorsvaror → expense_office.
6. taxCode: "MPI" för avdragsgilla affärskostnader med moms, "MP1" för intäkter med moms, null för momsfria
7. templateId är OBLIGATORISKT — välj alltid den mest passande mallen från listan ovan, även för alternativa förslag
8. isPrivate ska ALLTID vara false — användaren avgör själv vad som är privat
9. Ange TVÅ förslag per transaktion: ett primärt (mest troligt) och ett alternativt (näst mest troligt, annan kategori, lägre confidence). Båda ska vara affärskategorier.`

    const historyContext =
      context.recentHistory.length > 0
        ? `\nAnvändarens senaste kategoriseringar (lär dig mönster):\n${context.recentHistory
            .slice(0, 30)
            .map((h) => `- "${h.description}" → ${h.category}`)
            .join('\n')}`
        : ''

    const transactionList = batch
      .map(
        (t, i) =>
          `${i + 1}. ID: ${t.id}
   Beskrivning: ${t.description}
   Belopp: ${t.amount} ${t.currency}
   Datum: ${t.date}${t.merchant_name ? `\n   Handlare: ${t.merchant_name}` : ''}${t.mcc_code ? `\n   MCC: ${t.mcc_code}` : ''}`
      )
      .join('\n\n')

    const userPrompt = `Kategorisera följande transaktioner med classify_transactions-verktyget.
Ange TVÅ förslag per transaktion (primärt + alternativ med lägre confidence):
${historyContext}${accountUsageContext}${merchantHistoryContext}

TRANSAKTIONER:
${transactionList}`

    let lastError: Error | null = null

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const message = await this.client.messages.create({
          model: this.model,
          max_tokens: 4096,
          system: [
            {
              type: 'text',
              text: systemPrompt,
              cache_control: { type: 'ephemeral' },
            },
          ],
          tools: [CLASSIFY_TOOL],
          tool_choice: { type: 'tool', name: 'classify_transactions' },
          messages: [
            {
              role: 'user',
              content: userPrompt,
            },
          ],
        })

        // Extract tool_use block from response
        const toolUseBlock = message.content.find(
          (block) => block.type === 'tool_use' && block.name === 'classify_transactions'
        )

        if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
          throw new Error('No tool_use block in AI response')
        }

        const input = toolUseBlock.input as { suggestions?: unknown[] }
        return this.validateSuggestions(input.suggestions || [], batch, context.entityType)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')

        if (attempt < MAX_RETRIES - 1) {
          await sleep(RETRY_DELAY_MS * (attempt + 1))
        }
      }
    }

    throw new Error(
      `AI categorization failed after ${MAX_RETRIES} attempts: ${lastError?.message}`
    )
  }

  private validateSuggestions(
    raw: unknown[],
    transactions: TransactionForCategorization[],
    entityType: EntityType
  ): CategorizationSuggestion[] {
    if (!Array.isArray(raw)) return []

    const categoryAccountMap = getCategoryAccountMap(entityType)
    const validTransactionIds = new Set(transactions.map((t) => t.id))
    const validCategories = new Set(Object.keys(categoryAccountMap).concat(['uncategorized']))
    const transactionMap = new Map(transactions.map((t) => [t.id, t]))

    return raw
      .filter(
        (s): s is Record<string, unknown> =>
          s !== null && typeof s === 'object' && 'transactionId' in s
      )
      .filter((s) => validTransactionIds.has(s.transactionId as string))
      .map((s) => {
        // Never let AI classify as private — remap to expense_other
        let category = validCategories.has(s.category as string)
          ? (s.category as TransactionCategory)
          : 'expense_other'
        if (category === 'private') {
          category = 'expense_other'
        }

        // Enforce direction: positive amounts = income, negative = expense
        const tx = transactionMap.get(s.transactionId as string)
        if (tx) {
          if (tx.amount > 0 && category.startsWith('expense_')) {
            category = 'income_other' as TransactionCategory
          } else if (tx.amount < 0 && category.startsWith('income_')) {
            category = 'expense_other' as TransactionCategory
          }
        }

        const accountInfo = categoryAccountMap[category]

        return {
          transactionId: s.transactionId as string,
          category,
          basAccount: accountInfo?.account || (s.basAccount as string) || '6991',
          taxCode: (s.taxCode as string) || null,
          confidence: Math.max(0, Math.min(1, Number(s.confidence) || 0.5)),
          reasoning: (s.reasoning as string) || '',
          isPrivate: false,
          templateId: (s.templateId as string) || CATEGORY_DEFAULT_TEMPLATES[category] || undefined,
        }
      })
  }
}

function buildDocumentContext(doc: DocumentEnrichment): string {
  const parts: string[] = []

  const typeLabel = doc.type === 'receipt' ? 'KVITTO' : 'LEVERANTÖRSFAKTURA'
  parts.push(`LÄNKAT DOKUMENT (${typeLabel}):`)

  if (doc.merchantName) {
    parts.push(`Handlare/leverantör: ${doc.merchantName}`)
  }

  if (doc.lineItems && doc.lineItems.length > 0) {
    parts.push('Rader:')
    for (const item of doc.lineItems) {
      let line = `- ${item.description}: ${item.amount} kr`
      if (item.accountSuggestion) line += ` (föreslaget konto: ${item.accountSuggestion})`
      if (item.category) line += ` [${item.category}]`
      parts.push(line)
    }
  }

  if (doc.vatBreakdown && doc.vatBreakdown.length > 0) {
    parts.push('Momsfördelning:')
    for (const vat of doc.vatBreakdown) {
      parts.push(`- ${vat.rate}%: ${vat.amount} kr`)
    }
  }

  if (doc.isReverseCharge) {
    parts.push(`VIKTIGT: Omvänd skattskyldighet (reverse charge). Använd dubbelkontering:
- Debitera 2645 (beräknad ingående moms) OCH kreditera 2614 (utgående moms, omvänd skattskyldighet)
- Mallen "purchase_eu_service_reverse_charge" ska användas om tillgänglig`)
  }

  return parts.join('\n') + '\n'
}

function isEnrichedContext(
  ctx: CategorizationContext | EnrichedCategorizationContext
): ctx is EnrichedCategorizationContext {
  return 'candidateTemplates' in ctx
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
