/**
 * AI Categorization Engine
 *
 * SERVER-ONLY: Uses the Anthropic SDK and must only be imported
 * in server components or API routes.
 *
 * Provider-abstracted AI categorization for Swedish BAS account mapping.
 * Default implementation uses Claude Haiku for cost efficiency.
 */

import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
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

export interface CategorizationContext {
  entityType: EntityType
  recentHistory: { description: string; category: string }[]
}

export interface CategorizationSuggestion {
  transactionId: string
  category: TransactionCategory
  basAccount: string
  taxCode: string | null
  confidence: number
  reasoning: string
  isPrivate: boolean
}

export interface CategorizationProvider {
  categorize(
    transactions: TransactionForCategorization[],
    context: CategorizationContext
  ): Promise<CategorizationSuggestion[]>
}

// ============================================================
// BAS Account + Category Mapping (used in prompt)
// ============================================================

const CATEGORY_ACCOUNT_MAP: Record<string, { account: string; label: string }> = {
  income_services: { account: '3001', label: 'Tjänsteförsäljning' },
  income_products: { account: '3001', label: 'Varuförsäljning' },
  income_other: { account: '3900', label: 'Övriga intäkter' },
  expense_equipment: { account: '5410', label: 'Förbrukningsinventarier' },
  expense_software: { account: '5420', label: 'Programvara' },
  expense_travel: { account: '5800', label: 'Resekostnader' },
  expense_office: { account: '5010', label: 'Lokalhyra/kontorskostnad' },
  expense_marketing: { account: '5910', label: 'Annonsering/marknadsföring' },
  expense_professional_services: { account: '6530', label: 'Redovisning/konsulttjänster' },
  expense_education: { account: '6991', label: 'Utbildning' },
  expense_bank_fees: { account: '6570', label: 'Bankavgifter' },
  expense_card_fees: { account: '6570', label: 'Kortavgifter' },
  expense_currency_exchange: { account: '7960', label: 'Valutakursförluster' },
  expense_other: { account: '6991', label: 'Övriga kostnader' },
  private: { account: '2013', label: 'Privat uttag (EF) / Skuld till ägare (AB)' },
}

const NON_DEDUCTIBLE_RULES = `
ICKE-AVDRAGSGILLA KOSTNADER (svensk skatterätt):
- Kläder: Normalt inte avdragsgilla (RÅ 1988 ref. 35)
- Gym/träning: Inte avdragsgilla som personlig kostnad (IL 9 kap 2§)
- Kosmetika/hudvård: Normalt inte avdragsgillt
- Frisör: Normalt privat kostnad
- Representation/måltider: Max 300 kr/person exkl. moms (IL 16 kap 2§)
- Gåvor: Reklamgåvor max 300 kr/mottagare, representationsgåvor max 180 kr
- Telefon/dator vid blandad användning: Bara yrkesmässig del avdragsgill
`

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
    context: CategorizationContext
  ): Promise<CategorizationSuggestion[]> {
    // Cap batch size
    const batch = transactions.slice(0, MAX_BATCH_SIZE)
    if (batch.length === 0) return []

    const privateAccount = context.entityType === 'aktiebolag' ? '2893' : '2013'

    const systemPrompt = `Du är expert på svensk bokföring och kategorisering av banktransaktioner enligt BAS-kontoplanen.
Din uppgift är att kategorisera varje transaktion till rätt kategori och BAS-konto.

KATEGORIER OCH BAS-KONTON:
${Object.entries(CATEGORY_ACCOUNT_MAP)
  .map(([cat, info]) => `- ${cat}: ${info.account} (${info.label})`)
  .join('\n')}

Företagsform: ${context.entityType === 'aktiebolag' ? 'Aktiebolag (AB)' : 'Enskild firma (EF)'}
Privatkonto: ${privateAccount}

MOMSHANTERING:
- Bankavgifter, kortavgifter, valutaväxling: MOMSFRIA
- Övriga affärskostnader: Normalt 25% moms (ingående moms, MPI)
- Intäkter: Normalt 25% moms (utgående moms, MP1)

${NON_DEDUCTIBLE_RULES}

REGLER:
1. Negativa belopp = utgifter, positiva = intäkter
2. Markera transaktioner som troligen är privata med isPrivate: true
3. Ange confidence 0.0-1.0 baserat på hur säker du är
4. Ange kort reasoning på svenska
5. Om en transaktion liknar privat konsumtion (kläder, gym, etc.), sätt category: "private"
6. taxCode: "MPI" för avdragsgilla affärskostnader med moms, "MP1" för intäkter med moms, null för momsfria/privata`

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

    const userPrompt = `Kategorisera följande transaktioner:
${historyContext}

TRANSAKTIONER:
${transactionList}

Returnera ett JSON-objekt med följande struktur:
{
  "suggestions": [
    {
      "transactionId": "id",
      "category": "expense_software",
      "basAccount": "5420",
      "taxCode": "MPI",
      "confidence": 0.9,
      "reasoning": "Spotify-prenumeration, typisk programvarukostnad",
      "isPrivate": false
    }
  ]
}

Returnera ENDAST JSON-objektet, ingen annan text.`

    let lastError: Error | null = null

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const message = await this.client.messages.create({
          model: this.model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: userPrompt,
            },
          ],
        })

        const content = message.content[0]
        if (content.type !== 'text') {
          throw new Error('Unexpected response type from AI')
        }

        // Strip markdown code blocks if present
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
        return this.validateSuggestions(parsed.suggestions || [], batch)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')

        // Don't retry on parse errors
        if (error instanceof SyntaxError) {
          throw new Error(`Failed to parse AI response: ${lastError.message}`)
        }

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
    transactions: TransactionForCategorization[]
  ): CategorizationSuggestion[] {
    if (!Array.isArray(raw)) return []

    const validTransactionIds = new Set(transactions.map((t) => t.id))
    const validCategories = new Set(Object.keys(CATEGORY_ACCOUNT_MAP).concat(['uncategorized']))

    return raw
      .filter(
        (s): s is Record<string, unknown> =>
          s !== null && typeof s === 'object' && 'transactionId' in s
      )
      .filter((s) => validTransactionIds.has(s.transactionId as string))
      .map((s) => {
        const category = validCategories.has(s.category as string)
          ? (s.category as TransactionCategory)
          : 'expense_other'

        const accountInfo = CATEGORY_ACCOUNT_MAP[category]

        return {
          transactionId: s.transactionId as string,
          category,
          basAccount: accountInfo?.account || (s.basAccount as string) || '6991',
          taxCode: (s.taxCode as string) || null,
          confidence: Math.max(0, Math.min(1, Number(s.confidence) || 0.5)),
          reasoning: (s.reasoning as string) || '',
          isPrivate: category === 'private' || Boolean(s.isPrivate),
        }
      })
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
