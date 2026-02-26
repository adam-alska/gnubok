import { eventBus } from '@/lib/events/bus'
import type { EventPayload } from '@/lib/events/types'
import { createClient } from '@/lib/supabase/server'
import { createSupplierInvoiceRegistrationEntry } from '@/lib/bookkeeping/supplier-invoice-entries'
import { createLogger } from '@/lib/logger'
import type { SupplierInvoiceItem } from '@/types'

const log = createLogger('supplier-invoice-handler')

/**
 * Core event handler: creates a registration journal entry when a supplier
 * invoice is confirmed (accrual method only).
 *
 * This decouples journal entry creation from the invoice-inbox extension,
 * making it a core concern triggered by the `supplier_invoice.confirmed` event.
 */
async function handleSupplierInvoiceConfirmed(
  payload: EventPayload<'supplier_invoice.confirmed'>
): Promise<void> {
  const { supplierInvoice, userId } = payload

  const supabase = await createClient()

  // Check accounting method
  const { data: settings } = await supabase
    .from('company_settings')
    .select('accounting_method')
    .eq('user_id', userId)
    .single()

  const accountingMethod = settings?.accounting_method || 'accrual'
  if (accountingMethod !== 'accrual') return

  // Fetch invoice items
  const { data: items, error: itemsError } = await supabase
    .from('supplier_invoice_items')
    .select('*')
    .eq('supplier_invoice_id', supplierInvoice.id)
    .order('sort_order')

  if (itemsError || !items || items.length === 0) {
    log.error('Failed to fetch invoice items:', itemsError)
    return
  }

  // Fetch supplier type
  const { data: supplier } = await supabase
    .from('suppliers')
    .select('supplier_type')
    .eq('id', supplierInvoice.supplier_id)
    .single()

  const supplierType = supplier?.supplier_type || 'swedish_business'

  try {
    const journalEntry = await createSupplierInvoiceRegistrationEntry(
      supabase,
      userId,
      supplierInvoice,
      items as SupplierInvoiceItem[],
      supplierType
    )

    if (journalEntry) {
      await supabase
        .from('supplier_invoices')
        .update({ registration_journal_entry_id: journalEntry.id })
        .eq('id', supplierInvoice.id)
    }
  } catch (err) {
    log.error('Failed to create registration journal entry:', err)
  }
}

/**
 * Register the core supplier invoice handler on the event bus.
 * Returns an unsubscribe function.
 */
export function registerSupplierInvoiceHandler(): () => void {
  return eventBus.on('supplier_invoice.confirmed', handleSupplierInvoiceConfirmed)
}
