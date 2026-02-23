import type {
  JournalEntry,
  Invoice,
  Transaction,
  Customer,
  FiscalPeriod,
  DocumentAttachment,
  Receipt,
  CreditNote,
  CAMT053Statement,
  CAMT054Notification,
  AuditSecurityEvent,
  ReconciliationMethod,
  InvoiceInboxItem,
  SupplierInvoice,
} from '@/types'

// ============================================================
// Core Event Types — discriminated union of all system events
// ============================================================

export type CoreEvent =
  // Bookkeeping
  | { type: 'journal_entry.drafted'; payload: { entry: JournalEntry; userId: string } }
  | { type: 'journal_entry.committed'; payload: { entry: JournalEntry; userId: string } }
  | { type: 'journal_entry.corrected'; payload: { original: JournalEntry; storno: JournalEntry; corrected: JournalEntry; userId: string } }
  // Documents
  | { type: 'document.uploaded'; payload: { document: DocumentAttachment; userId: string } }
  // Invoicing
  | { type: 'invoice.created'; payload: { invoice: Invoice; userId: string } }
  | { type: 'invoice.sent'; payload: { invoice: Invoice; userId: string } }
  | { type: 'invoice.paid'; payload: { invoice: Invoice; transaction: Transaction; kursdifferens?: number; userId: string } }
  | { type: 'invoice.overdue'; payload: { invoice: Invoice; days: number; userId: string } }
  | { type: 'credit_note.created'; payload: { creditNote: CreditNote; userId: string } }
  // Banking
  | { type: 'transaction.synced'; payload: { transactions: Transaction[]; userId: string } }
  | { type: 'transaction.categorized'; payload: { transaction: Transaction; account: string; taxCode: string; userId: string } }
  | { type: 'transaction.reconciled'; payload: { transaction: Transaction; journalEntryId: string; method: ReconciliationMethod; userId: string } }
  | { type: 'bank.statement_received'; payload: { statement: CAMT053Statement; userId: string } }
  | { type: 'bank.payment_notification'; payload: { notification: CAMT054Notification; userId: string } }
  // Periods
  | { type: 'period.locked'; payload: { period: FiscalPeriod; userId: string } }
  | { type: 'period.year_closed'; payload: { period: FiscalPeriod; userId: string } }
  // Customers
  | { type: 'customer.created'; payload: { customer: Customer; userId: string } }
  | { type: 'customer.pseudonymized'; payload: { customerId: string; userId: string } }
  // Receipts
  | { type: 'receipt.extracted'; payload: {
      receipt: Receipt;
      documentId: string | null;
      confidence: number;
      userId: string;
    }}
  | { type: 'receipt.matched'; payload: {
      receipt: Receipt;
      transaction: Transaction;
      confidence: number;
      autoMatched: boolean;
      userId: string;
    }}
  | { type: 'receipt.confirmed'; payload: {
      receipt: Receipt;
      businessTotal: number;
      privateTotal: number;
      userId: string;
    }}
  // Supplier Invoice Inbox
  | { type: 'supplier_invoice.received'; payload: { inboxItem: InvoiceInboxItem; userId: string } }
  | { type: 'supplier_invoice.extracted'; payload: { inboxItem: InvoiceInboxItem; confidence: number; userId: string } }
  | { type: 'supplier_invoice.confirmed'; payload: { inboxItem: InvoiceInboxItem; supplierInvoice: SupplierInvoice; userId: string } }
  // Audit
  | { type: 'audit.security_event'; payload: { event: AuditSecurityEvent; userId: string } }

// ============================================================
// Helper Types
// ============================================================

/** All possible event type strings */
export type CoreEventType = CoreEvent['type']

/** Extract the payload type for a given event type */
export type EventPayload<T extends CoreEventType> = Extract<CoreEvent, { type: T }>['payload']

/** Handler function for a specific event type */
export type EventHandler<T extends CoreEventType> = (payload: EventPayload<T>) => Promise<void> | void

/** Subscription: event type + handler */
export interface EventSubscription<T extends CoreEventType = CoreEventType> {
  eventType: T
  handler: EventHandler<T>
}
