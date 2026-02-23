import { loadExtensions } from '@/lib/extensions/loader'
import { setContextFactory } from '@/lib/extensions/registry'
import { createExtensionContext } from '@/lib/extensions/context-factory'
import { registerSupplierInvoiceHandler } from '@/lib/bookkeeping/handlers/supplier-invoice-handler'

let initialized = false

/**
 * Ensure the system is initialized (extensions loaded, context factory wired,
 * core event handlers registered).
 * Called from API routes that emit events.
 * Idempotent — safe to call multiple times.
 */
export function ensureInitialized(): void {
  if (initialized) return
  initialized = true

  setContextFactory(createExtensionContext)
  registerSupplierInvoiceHandler()
  loadExtensions()
}
