import type { Extension } from '@/lib/extensions/types'
import type { EventPayload } from '@/lib/events/types'
import type { InvoiceInboxItem } from '@/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import { processInboxItemMatch } from './lib/process-match'

const EXTENSION_ID = 'inbox-smart-match'

// The handler always uses a service-role client:
//   - processing_history has no INSERT RLS policy (audit integrity) — only service-role can append
//   - every query is scoped by company_id from the event payload
//   - we write pseudonymous IDs only (PII validator enforces this at the append layer)
// Using ctx.supabase is unsafe because the registry wrapper may build an anon-key
// client when no user session exists (e.g. webhook path).
function getServiceSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export const inboxSmartMatchExtension: Extension = {
  id: EXTENSION_ID,
  name: 'Smart matchning',
  version: '0.1.0',

  eventHandlers: [
    // When an inbox item is freshly classified, try to match it to a transaction
    {
      eventType: 'inbox_item.classified',
      handler: async (payload: EventPayload<'inbox_item.classified'>) => {
        // Only act on receipts for v1
        if (payload.documentType !== 'receipt') return

        const supabase = getServiceSupabase()

        try {
          await processInboxItemMatch(
            {
              supabase,
              companyId: payload.companyId,
              userId: payload.userId,
              extensionId: EXTENSION_ID,
              triggerReason: 'classified',
            },
            payload.inboxItem
          )
        } catch (err) {
          console.error(
            `[${EXTENSION_ID}] Failed to process classified inbox item ${payload.inboxItem.id}:`,
            err
          )
        }
      },
    },

    // When new transactions land, retry matching on any receipts still waiting
    {
      eventType: 'transaction.synced',
      handler: async (payload: EventPayload<'transaction.synced'>) => {
        const newTransactionIds = payload.transactions.map((t) => t.id).filter(Boolean)
        if (newTransactionIds.length === 0) return

        const supabase = getServiceSupabase()

        // Find receipts in pending state for this company.
        // Cap at 10 per sync so one big bank import doesn't time out the
        // handler; leftover pending items pick up on the next sync.
        const { data: pendingItems, error } = await supabase
          .from('invoice_inbox_items')
          .select('*')
          .eq('company_id', payload.companyId)
          .eq('document_type', 'receipt')
          .eq('status', 'ready')
          .eq('match_method', 'pending_transaction')
          .order('created_at', { ascending: false })
          .limit(10)

        if (error) {
          console.error(`[${EXTENSION_ID}] Failed to fetch pending receipts:`, error)
          return
        }
        if (!pendingItems || pendingItems.length === 0) return

        // Run LLM calls in parallel; one failing receipt shouldn't stop the others.
        const results = await Promise.allSettled(
          (pendingItems as InvoiceInboxItem[]).map((item) =>
            processInboxItemMatch(
              {
                supabase,
                companyId: payload.companyId,
                userId: payload.userId,
                extensionId: EXTENSION_ID,
                triggerReason: 'transaction_synced',
              },
              item
            )
          )
        )

        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            const itemId = (pendingItems[i] as InvoiceInboxItem).id
            console.error(
              `[${EXTENSION_ID}] Retroactive match failed for item ${itemId}:`,
              r.reason
            )
          }
        })
      },
    },
  ],
}
