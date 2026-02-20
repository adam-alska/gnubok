import { extensionRegistry } from './registry'
import { receiptOcrExtension } from '@/extensions/receipt-ocr'
import { aiCategorizationExtension } from '@/extensions/ai-categorization'
import { pushNotificationsExtension } from '@/extensions/push-notifications'
import { sruExportExtension } from '@/extensions/sru-export'
import { neBilagaExtension } from '@/extensions/ne-bilaga'
import { aiChatExtension } from '@/extensions/ai-chat'
import type { Extension } from './types'

// ── Enable Banking (PSD2) — opt-in extension ───────────────────────────
// Uncomment the following line to enable automatic PSD2 bank transaction sync.
// Requires ENABLE_BANKING_APP_ID and ENABLE_BANKING_PRIVATE_KEY env vars.
//
// import { enableBankingExtension } from '@/extensions/enable-banking'

/**
 * Explicit list of first-party extensions.
 *
 * Next.js bundling requires static imports — no dynamic filesystem scanning.
 * Add extensions here as they are built.
 */
const FIRST_PARTY_EXTENSIONS: Extension[] = [
  receiptOcrExtension,
  aiCategorizationExtension,
  pushNotificationsExtension,
  sruExportExtension,
  neBilagaExtension,
  aiChatExtension,
  // enableBankingExtension,  // Uncomment to activate PSD2 bank sync
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
