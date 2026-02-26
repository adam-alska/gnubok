/**
 * Template Embeddings — Core Facade
 *
 * Delegates to the ai-categorization extension's service when available.
 * Returns empty/no-op results when the extension is not loaded,
 * allowing core to compile without @langchain/openai.
 *
 * Pure helper functions (buildEmbeddingText, buildTransactionQueryText,
 * getSchemaVersion) are re-exported from the extension for tests that
 * depend on them.
 */

import { extensionRegistry } from '@/lib/extensions/registry'
import {
  findMatchingTemplates,
  type TemplateMatch,
} from './booking-templates'
import type { Transaction, EntityType } from '@/types'

/**
 * Find similar templates via embedding search.
 * Falls back to keyword matching when the AI extension is not loaded.
 */
export async function findSimilarTemplates(
  transaction: Transaction,
  entityType?: EntityType,
  matchCount?: number,
  userDescription?: string
): Promise<TemplateMatch[]> {
  const aiExt = extensionRegistry.get('ai-categorization')
  if (aiExt?.services?.findSimilarTemplates) {
    return aiExt.services.findSimilarTemplates(transaction, entityType, matchCount, userDescription)
  }
  // Graceful fallback: keyword-based matching (no AI deps)
  return findMatchingTemplates(transaction, entityType)
}

/**
 * Seed all template embeddings in the database.
 * No-op when the AI extension is not loaded.
 */
export async function seedAllTemplateEmbeddings(): Promise<{
  seeded: number
  errors: string[]
}> {
  const aiExt = extensionRegistry.get('ai-categorization')
  if (aiExt?.services?.seedAllTemplateEmbeddings) {
    return aiExt.services.seedAllTemplateEmbeddings()
  }
  return { seeded: 0, errors: ['ai-categorization extension not loaded'] }
}

/**
 * Get the current schema version hash.
 * Returns 'none' when the AI extension is not loaded.
 */
export async function getSchemaVersion(): Promise<string> {
  const aiExt = extensionRegistry.get('ai-categorization')
  if (aiExt?.services?.getSchemaVersion) {
    return aiExt.services.getSchemaVersion()
  }
  return 'none'
}
