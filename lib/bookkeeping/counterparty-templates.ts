import type { SupabaseClient } from '@supabase/supabase-js'
import {
  normalizeMerchantName,
  levenshteinDistance,
} from '@/lib/documents/core-receipt-matcher'
import {
  generateInputVatLine,
  generateReverseChargeLines,
  getVatRate,
} from './vat-entries'
import type {
  CategorizationTemplate,
  CategorizationTemplateSource,
  EntityType,
  MappingResult,
  Transaction,
  VatJournalLine,
  VatTreatment,
} from '@/types'

// ── Normalization ──────────────────────────────────────────────

/**
 * Normalize a transaction description to a canonical counterparty name.
 *
 * Strips bank transfer prefixes, trailing dates, invoice references,
 * and trailing digit sequences, then delegates to normalizeMerchantName()
 * for Swedish company suffix removal and lowercasing.
 */
export function normalizeCounterpartyName(raw: string): string {
  const cleaned = raw
    // Strip common bank transfer prefixes
    .replace(/^(BANKGIRO|SWISH|KORTKÖP|KORT\s*KÖP|PG|BG|AUTOGIRO|PLUSGIRO)\s*/i, '')
    // Strip dates (20240615, 2024-06-15, 24-06-15)
    .replace(/\b\d{2,4}[-/]?\d{2}[-/]?\d{2}\b/g, '')
    // Strip invoice/reference numbers (F2024-001, #12345, INV-123)
    .replace(/\b[F#]?\d{4,}\S*/gi, '')
    .replace(/\bINV[-]?\d+/gi, '')
    // Strip trailing sequences of 4+ digits (card numbers, transaction refs)
    .replace(/\s+\d{4,}\s*$/g, '')
    .trim()

  return normalizeMerchantName(cleaned)
}

// ── Confidence ─────────────────────────────────────────────────

/**
 * Logarithmic confidence formula.
 * Starts low, grows slowly, caps at 0.95. Early corrections are cheap,
 * later corrections are appropriately alarming.
 */
export function calculateConfidence(occurrenceCount: number): number {
  const raw = 0.3 + Math.log2(occurrenceCount + 1) * 0.15
  return Math.round(Math.min(raw, 0.95) * 100) / 100
}

// ── Lookup ─────────────────────────────────────────────────────

export interface CounterpartyTemplateMatch {
  template: CategorizationTemplate
  matchMethod: 'exact_alias' | 'exact_normalized' | 'fuzzy'
  confidence: number
}

/**
 * Find a counterparty template matching a transaction.
 *
 * Three-tier matching:
 * 1. Exact alias match — GIN index on counterparty_aliases array
 * 2. Exact normalized name match — UNIQUE index
 * 3. Fuzzy Levenshtein — distance ≤2 for short names, ≤3 for long names
 */
export async function findCounterpartyTemplate(
  supabase: SupabaseClient,
  userId: string,
  transaction: Transaction
): Promise<CounterpartyTemplateMatch | null> {
  const rawName = transaction.merchant_name || transaction.description
  if (!rawName) return null

  const normalized = normalizeCounterpartyName(rawName)
  if (!normalized || normalized.length < 2) return null

  // 1. Exact alias match (highest confidence multiplier)
  const { data: aliasMatch } = await supabase
    .from('categorization_templates')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .contains('counterparty_aliases', [rawName.toLowerCase()])
    .limit(1)
    .maybeSingle()

  if (aliasMatch) {
    return {
      template: aliasMatch as CategorizationTemplate,
      matchMethod: 'exact_alias',
      confidence: Math.min(Number(aliasMatch.confidence) * 1.0, 1),
    }
  }

  // 2. Exact normalized name match
  const { data: exactMatch } = await supabase
    .from('categorization_templates')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('counterparty_name', normalized)
    .maybeSingle()

  if (exactMatch) {
    return {
      template: exactMatch as CategorizationTemplate,
      matchMethod: 'exact_normalized',
      confidence: Math.round(Number(exactMatch.confidence) * 0.95 * 100) / 100,
    }
  }

  // 3. Fuzzy match — fetch all active templates, compute Levenshtein
  const { data: allTemplates } = await supabase
    .from('categorization_templates')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (!allTemplates || allTemplates.length === 0) return null

  let bestMatch: CategorizationTemplate | null = null
  let bestDistance = Infinity

  for (const tmpl of allTemplates) {
    const dist = levenshteinDistance(normalized, tmpl.counterparty_name)
    const maxAllowed = normalized.length <= 10 ? 2 : 3
    if (dist <= maxAllowed && dist < bestDistance) {
      bestDistance = dist
      bestMatch = tmpl as CategorizationTemplate
    }
  }

  if (bestMatch) {
    const similarity = 1 - bestDistance / Math.max(normalized.length, bestMatch.counterparty_name.length)
    return {
      template: bestMatch,
      matchMethod: 'fuzzy',
      confidence: Math.round(Number(bestMatch.confidence) * similarity * 100) / 100,
    }
  }

  return null
}

// ── Build MappingResult ────────────────────────────────────────

/**
 * Convert a counterparty template match into a MappingResult
 * (same shape the mapping engine expects).
 */
export function buildMappingResultFromCounterpartyTemplate(
  match: CounterpartyTemplateMatch,
  transaction: Transaction,
  entityType: EntityType
): MappingResult {
  const tmpl = match.template
  const absAmount = Math.abs(transaction.amount)
  const isExpense = transaction.amount < 0

  // Generate VAT lines if applicable
  const vatLines: VatJournalLine[] = []
  if (isExpense && tmpl.vat_treatment) {
    const vatTreatment = tmpl.vat_treatment as VatTreatment
    if (vatTreatment === 'reverse_charge') {
      const rcLines = generateReverseChargeLines(absAmount)
      for (const rcl of rcLines) {
        vatLines.push({
          account_number: rcl.account_number,
          debit_amount: rcl.debit_amount,
          credit_amount: rcl.credit_amount,
          description: rcl.line_description || '',
        })
      }
    } else {
      const vatRate = getVatRate(vatTreatment)
      if (vatRate > 0) {
        const vatLine = generateInputVatLine(absAmount, vatRate)
        if (vatLine) {
          vatLines.push({
            account_number: vatLine.account_number,
            debit_amount: vatLine.debit_amount,
            credit_amount: vatLine.credit_amount,
            description: vatLine.line_description || '',
          })
        }
      }
    }
  }

  // Determine if private (debit to private account means non-business)
  const privateAccounts = ['2013', '2893']
  const isPrivate = privateAccounts.includes(tmpl.debit_account)

  return {
    rule: null,
    debit_account: tmpl.debit_account,
    credit_account: tmpl.credit_account,
    risk_level: 'NONE',
    confidence: match.confidence,
    requires_review: false,
    default_private: isPrivate,
    vat_lines: vatLines,
    description: `Motpart: ${tmpl.counterparty_name} (${tmpl.occurrence_count} ggr)`,
  }
}

// ── Feedback / Upsert ──────────────────────────────────────────

/**
 * Upsert a counterparty template from a categorization result.
 *
 * - New counterparty: insert with starting confidence based on source
 * - Re-approval (same accounts): increment occurrence_count, recalc confidence
 * - Correction (different accounts): update accounts, reset occurrence_count to 1
 * - Always: add raw name alias if not present, update last_seen_date
 */
export async function upsertCounterpartyTemplate(
  supabase: SupabaseClient,
  userId: string,
  transaction: Transaction,
  mappingResult: MappingResult,
  source: CategorizationTemplateSource
): Promise<void> {
  const rawName = transaction.merchant_name || transaction.description
  if (!rawName) return

  const normalized = normalizeCounterpartyName(rawName)
  if (!normalized || normalized.length < 2) return

  const rawNameLower = rawName.toLowerCase()
  const category = transaction.category !== 'uncategorized' ? transaction.category : null
  const txDate = transaction.date

  // Check for existing template
  const { data: existing } = await supabase
    .from('categorization_templates')
    .select('*')
    .eq('user_id', userId)
    .eq('counterparty_name', normalized)
    .maybeSingle()

  if (existing) {
    const isCorrection =
      existing.debit_account !== mappingResult.debit_account ||
      existing.credit_account !== mappingResult.credit_account

    // Build updated aliases array (add raw name if not present)
    const aliases: string[] = existing.counterparty_aliases || []
    if (!aliases.includes(rawNameLower)) {
      aliases.push(rawNameLower)
    }

    if (isCorrection) {
      // Correction: update accounts, reset occurrence to 1
      const newConfidence = calculateConfidence(1)
      await supabase
        .from('categorization_templates')
        .update({
          debit_account: mappingResult.debit_account,
          credit_account: mappingResult.credit_account,
          vat_treatment: mappingResult.vat_lines.length > 0
            ? detectVatTreatment(mappingResult)
            : existing.vat_treatment,
          vat_account: mappingResult.vat_lines[0]?.account_number || existing.vat_account,
          category: category || existing.category,
          occurrence_count: 1,
          confidence: newConfidence,
          last_seen_date: txDate,
          source: source === 'auto_learned' ? existing.source : source,
          counterparty_aliases: aliases,
        })
        .eq('id', existing.id)
    } else {
      // Re-approval: increment count, recalc confidence
      const newCount = existing.occurrence_count + 1
      const newConfidence = calculateConfidence(newCount)
      // Upgrade source if human approves an auto-learned template
      const newSource =
        source === 'user_approved' && existing.source === 'auto_learned'
          ? 'user_approved'
          : existing.source

      await supabase
        .from('categorization_templates')
        .update({
          occurrence_count: newCount,
          confidence: newConfidence,
          last_seen_date: txDate,
          source: newSource,
          counterparty_aliases: aliases,
          category: category || existing.category,
        })
        .eq('id', existing.id)
    }
  } else {
    // New template
    const startingConfidence = source === 'auto_learned'
      ? calculateConfidence(1) // ~0.45
      : calculateConfidence(1) // same formula, but source flag matters for threshold

    await supabase
      .from('categorization_templates')
      .insert({
        user_id: userId,
        counterparty_name: normalized,
        counterparty_aliases: [rawNameLower],
        debit_account: mappingResult.debit_account,
        credit_account: mappingResult.credit_account,
        vat_treatment: detectVatTreatment(mappingResult),
        vat_account: mappingResult.vat_lines[0]?.account_number || null,
        category: category || null,
        occurrence_count: 1,
        confidence: startingConfidence,
        last_seen_date: txDate,
        source,
      })
  }
}

/**
 * Detect VAT treatment from a MappingResult's VAT lines.
 */
function detectVatTreatment(result: MappingResult): string | null {
  if (result.vat_lines.length === 0) return null

  // Check for reverse charge (2645 debit = fiktiv ingående)
  const hasReverseCharge = result.vat_lines.some(
    (l) => l.account_number === '2645'
  )
  if (hasReverseCharge) return 'reverse_charge'

  // Check for input VAT (2641 debit)
  const inputVat = result.vat_lines.find(
    (l) => l.account_number === '2641' && l.debit_amount > 0
  )
  if (!inputVat) return null

  // Derive rate from the line description (generated by generateInputVatLine)
  // Format: "Ingående moms 25%", "Ingående moms 12%", "Ingående moms 6%"
  const rateMatch = inputVat.description?.match(/(\d+)%/)
  if (rateMatch) {
    const pct = parseInt(rateMatch[1], 10)
    if (pct === 12) return 'reduced_12'
    if (pct === 6) return 'reduced_6'
  }
  return 'standard_25'
}
