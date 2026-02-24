/**
 * Template Embeddings Module
 *
 * SERVER-ONLY: Uses OpenAI embeddings and Supabase service client.
 *
 * Provides semantic search over booking templates using pgvector.
 * Templates are pre-embedded and stored in the database. Transaction
 * text is embedded at query time and compared via cosine similarity.
 */

import 'server-only'
import { OpenAIEmbeddings } from '@langchain/openai'
import {
  BOOKING_TEMPLATES,
  getTemplateById,
  type BookingTemplate,
  type TemplateMatch,
} from './booking-templates'
import type { Transaction, EntityType } from '@/types'
import { createHash } from 'crypto'

// ============================================================
// Constants
// ============================================================

export const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_LOGIC_VERSION = '1'
const MATCH_COUNT = 20
const MATCH_THRESHOLD = 0.5

/**
 * Schema version is a hash of the model + embedding logic version.
 * Bump EMBEDDING_LOGIC_VERSION when buildEmbeddingText changes.
 */
export function getSchemaVersion(): string {
  return createHash('sha256')
    .update(`${EMBEDDING_MODEL}:${EMBEDDING_LOGIC_VERSION}`)
    .digest('hex')
    .slice(0, 12)
}

// ============================================================
// Embedding Text Builders
// ============================================================

/**
 * Build a rich text representation of a template for embedding.
 * Includes all semantically relevant fields.
 */
export function buildEmbeddingText(template: BookingTemplate): string {
  const parts: string[] = []

  parts.push(`${template.name_sv} (${template.name_en})`)
  parts.push(template.description_sv)

  if (template.keywords.length > 0) {
    parts.push(`Nyckelord: ${template.keywords.join(', ')}`)
  }

  parts.push(`Grupp: ${template.group}`)
  parts.push(`Typ: ${template.direction === 'expense' ? 'utgift' : template.direction === 'income' ? 'intäkt' : 'överföring'}`)
  parts.push(`Konton: ${template.debit_account} (debet) / ${template.credit_account} (kredit)`)

  if (template.vat_treatment) {
    parts.push(`Moms: ${template.vat_treatment} (${template.vat_rate * 100}%)`)
  }

  if (template.special_rules_sv) {
    parts.push(`Regler: ${template.special_rules_sv}`)
  }

  if (template.mcc_codes.length > 0) {
    parts.push(`MCC-koder: ${template.mcc_codes.join(', ')}`)
  }

  if (template.deductibility !== 'full') {
    parts.push(`Avdragsrätt: ${template.deductibility}`)
  }

  return parts.join('. ')
}

/**
 * Build query text from a transaction for embedding search.
 */
export function buildTransactionQueryText(transaction: Transaction): string {
  const parts: string[] = []

  if (transaction.description) {
    parts.push(transaction.description)
  }

  if (transaction.merchant_name) {
    parts.push(transaction.merchant_name)
  }

  if (transaction.mcc_code) {
    parts.push(`MCC ${transaction.mcc_code}`)
  }

  parts.push(transaction.amount < 0 ? 'utgift' : 'intäkt')

  return parts.join(' — ')
}

// ============================================================
// Embeddings Client
// ============================================================

let embeddingsInstance: OpenAIEmbeddings | null = null

function getEmbeddingsClient(): OpenAIEmbeddings {
  if (!embeddingsInstance) {
    embeddingsInstance = new OpenAIEmbeddings({
      modelName: EMBEDDING_MODEL,
      openAIApiKey: process.env.OPENAI_API_KEY,
    })
  }
  return embeddingsInstance
}

// ============================================================
// Seed All Template Embeddings
// ============================================================

export async function seedAllTemplateEmbeddings(): Promise<{
  seeded: number
  errors: string[]
}> {
  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = await createServiceClient()
  const embeddings = getEmbeddingsClient()
  const schemaVersion = getSchemaVersion()
  const errors: string[] = []

  // Build texts for all templates
  const texts = BOOKING_TEMPLATES.map((t) => buildEmbeddingText(t))

  // Batch embed all texts
  let vectors: number[][]
  try {
    vectors = await embeddings.embedDocuments(texts)
  } catch (error) {
    return { seeded: 0, errors: [`Embedding generation failed: ${error}`] }
  }

  // Upsert each template embedding
  let seeded = 0
  for (let i = 0; i < BOOKING_TEMPLATES.length; i++) {
    const template = BOOKING_TEMPLATES[i]
    const { error } = await supabase
      .from('booking_template_embeddings')
      .upsert(
        {
          template_id: template.id,
          embedding: JSON.stringify(vectors[i]),
          embedding_text: texts[i],
          model: EMBEDDING_MODEL,
          schema_version: schemaVersion,
        },
        { onConflict: 'template_id' }
      )

    if (error) {
      errors.push(`Failed to upsert ${template.id}: ${error.message}`)
    } else {
      seeded++
    }
  }

  return { seeded, errors }
}

// ============================================================
// Find Similar Templates (Semantic Search)
// ============================================================

let stalenessWarned = false

export async function findSimilarTemplates(
  transaction: Transaction,
  entityType?: EntityType,
  matchCount: number = MATCH_COUNT
): Promise<TemplateMatch[]> {
  try {
    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = await createServiceClient()
    const embeddings = getEmbeddingsClient()

    // Check schema version staleness on first call
    if (!stalenessWarned) {
      const { data: sample } = await supabase
        .from('booking_template_embeddings')
        .select('schema_version')
        .limit(1)
        .single()

      if (sample && sample.schema_version !== getSchemaVersion()) {
        console.warn(
          `[template-embeddings] Schema version mismatch: DB has "${sample.schema_version}", current is "${getSchemaVersion()}". Re-seed embeddings.`
        )
      }
      stalenessWarned = true
    }

    // Embed the transaction query text
    const queryText = buildTransactionQueryText(transaction)
    const queryVector = await embeddings.embedQuery(queryText)

    // Request extra results to account for post-filtering
    const requestCount = matchCount + 10

    const { data, error } = await supabase.rpc('match_booking_templates', {
      query_embedding: JSON.stringify(queryVector),
      match_count: requestCount,
      match_threshold: MATCH_THRESHOLD,
    })

    if (error || !data) {
      console.error('[template-embeddings] RPC error:', error)
      return []
    }

    // Map RPC results to TemplateMatch[], filtering by entity type and direction
    const isExpense = transaction.amount < 0
    const isIncome = transaction.amount > 0
    const results: TemplateMatch[] = []

    for (const row of data as { template_id: string; similarity: number }[]) {
      const template = getTemplateById(row.template_id)
      if (!template) continue

      // Filter by entity applicability
      if (entityType && template.entity_applicability !== 'all' && template.entity_applicability !== entityType) {
        continue
      }

      // Filter by direction
      if (template.direction === 'expense' && !isExpense) continue
      if (template.direction === 'income' && !isIncome) continue

      results.push({
        template,
        confidence: Math.round(row.similarity * 100) / 100,
      })

      if (results.length >= matchCount) break
    }

    return results
  } catch (error) {
    console.error('[template-embeddings] findSimilarTemplates failed:', error)
    return []
  }
}
