import { eventBus } from '@/lib/events/bus'
import type { CoreEventType } from '@/lib/events/types'
import { createServiceClientNoCookies } from '@/lib/auth/api-keys'
import { createLogger } from '@/lib/logger'

const log = createLogger('event-log')

/**
 * Event types persisted to the event_log table for external automation platforms.
 * Excludes noise events that are always followed by an actionable event.
 */
const PERSISTED_EVENT_TYPES: CoreEventType[] = [
  'journal_entry.committed',
  'journal_entry.corrected',
  'document.uploaded',
  'invoice.created',
  'invoice.sent',
  'credit_note.created',
  'transaction.synced',
  'transaction.categorized',
  'transaction.reconciled',
  'period.locked',
  'period.year_closed',
  'customer.created',
  'receipt.matched',
  'receipt.confirmed',
  'supplier_invoice.registered',
  'supplier_invoice.approved',
  'supplier_invoice.paid',
  'supplier_invoice.credited',
  'invoice.match_confirmed',
  'supplier_invoice.match_confirmed',
  'supplier_invoice.confirmed',
]

// Excluded (with reasoning):
// - journal_entry.drafted: always followed by .committed
// - receipt.extracted: intermediate AI step; .matched/.confirmed are actionable
// - supplier_invoice.received: inbox receipt; .confirmed is actionable
// - supplier_invoice.extracted: intermediate AI step

/**
 * Extract the primary entity ID from an event payload.
 */
function extractEntityId(payload: Record<string, unknown>): string | null {
  // Try common entity shapes in priority order
  const entityKeys = [
    'entry', 'invoice', 'transaction', 'customer', 'receipt',
    'supplierInvoice', 'creditNote', 'period', 'document', 'inboxItem',
  ] as const

  for (const key of entityKeys) {
    const entity = payload[key]
    if (entity && typeof entity === 'object' && 'id' in entity) {
      const id = (entity as Record<string, unknown>).id
      if (typeof id === 'string') return id
    }
  }

  // For journal_entry.corrected: use the corrected entry's ID
  if ('corrected' in payload) {
    const corrected = payload.corrected
    if (corrected && typeof corrected === 'object' && 'id' in corrected) {
      const id = (corrected as Record<string, unknown>).id
      if (typeof id === 'string') return id
    }
  }

  return null
}

/**
 * Strip userId from payload (stored in its own column) and return clean data.
 */
function stripUserId(payload: Record<string, unknown>): Record<string, unknown> {
  const { userId: _userId, ...data } = payload
  return data
}

/**
 * Persist a single event to the event_log table.
 */
async function persistEvent(
  eventType: string,
  userId: string,
  entityId: string | null,
  data: Record<string, unknown>
): Promise<void> {
  const supabase = createServiceClientNoCookies()

  const { error } = await supabase
    .from('event_log')
    .insert({
      user_id: userId,
      event_type: eventType,
      entity_id: entityId,
      data,
    })

  if (error) {
    log.error(`Failed to persist event ${eventType}:`, error.message)
  }
}

/**
 * Register event log handlers on the event bus.
 * Persists events to the event_log table for external automation platforms.
 * Returns an array of unsubscribe functions.
 */
export function registerEventLogHandler(): (() => void)[] {
  return PERSISTED_EVENT_TYPES.map((eventType) =>
    eventBus.on(eventType, async (payload) => {
      try {
        const rawPayload = payload as Record<string, unknown>
        const userId = rawPayload.userId as string

        // transaction.synced carries an array — batch insert
        if (eventType === 'transaction.synced' && Array.isArray(rawPayload.transactions)) {
          const transactions = rawPayload.transactions as Array<Record<string, unknown>>
          if (transactions.length === 0) return

          const rows = transactions.map(tx => ({
            user_id: userId,
            event_type: eventType,
            entity_id: typeof tx.id === 'string' ? tx.id : null,
            data: { transaction: tx },
          }))

          const supabase = createServiceClientNoCookies()
          const { error } = await supabase.from('event_log').insert(rows)
          if (error) {
            log.error(`Failed to persist batch transaction.synced:`, error.message)
          }
          return
        }

        const entityId = extractEntityId(rawPayload)
        const data = stripUserId(rawPayload)
        await persistEvent(eventType, userId, entityId, data)
      } catch (err) {
        log.error(`Event log handler error for ${eventType}:`, err)
      }
    })
  )
}
