import { extensionRegistry } from './registry'
import { receiptOcrExtension } from '@/extensions/general/receipt-ocr'
import { aiCategorizationExtension } from '@/extensions/general/ai-categorization'
import { pushNotificationsExtension } from '@/extensions/general/push-notifications'
import { aiChatExtension } from '@/extensions/general/ai-chat'
import { invoiceInboxExtension } from '@/extensions/general/invoice-inbox'
import { calendarExtension } from '@/extensions/general/calendar'
import { userDescriptionMatchExtension } from '@/extensions/general/user-description-match'
import { euSalesListExtension } from '@/extensions/export/eu-sales-list'
import { vatMonitorExtension } from '@/extensions/export/vat-monitor'
import { intrastatExtension } from '@/extensions/export/intrastat'
import { currencyReceivablesExtension } from '@/extensions/export/currency-receivables'
import type { Extension } from './types'

import { enableBankingExtension } from '@/extensions/general/enable-banking'

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
  aiChatExtension,
  invoiceInboxExtension,
  calendarExtension,
  userDescriptionMatchExtension,
  enableBankingExtension,

  // ── Export sector ──────────────────────────────────────────
  euSalesListExtension,
  vatMonitorExtension,
  intrastatExtension,
  currencyReceivablesExtension,
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
