import { extensionRegistry } from './registry'
import { receiptOcrExtension } from '@/extensions/receipt-ocr'
import { aiCategorizationExtension } from '@/extensions/ai-categorization'
import type { Extension } from './types'

/**
 * Explicit list of first-party extensions.
 *
 * Next.js bundling requires static imports — no dynamic filesystem scanning.
 * Add extensions here as they are built.
 */
const FIRST_PARTY_EXTENSIONS: Extension[] = [
  receiptOcrExtension,
  aiCategorizationExtension,
]

let loaded = false

/**
 * Load and register all first-party extensions.
 * Idempotent — safe to call multiple times.
 */
export function loadExtensions(): void {
  if (loaded) return
  loaded = true

  for (const extension of FIRST_PARTY_EXTENSIONS) {
    extensionRegistry.register(extension)
  }
}
