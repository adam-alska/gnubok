import { z } from 'zod'

const dateString = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid date in YYYY-MM-DD format')

// Create reconciliation session
export const CreateReconciliationSessionSchema = z.object({
  bank_connection_id: z.string().uuid().optional(),
  account_name: z.string().max(200).optional(),
  account_iban: z.string().max(34).optional(),
  period_start: dateString,
  period_end: dateString,
  opening_balance: z.number().optional().default(0),
  closing_balance: z.number().optional().default(0),
})

// Update reconciliation session
export const UpdateReconciliationSessionSchema = z.object({
  status: z.enum(['in_progress', 'completed', 'cancelled']),
})

// Reconcile an item
export const ReconcileItemSchema = z.object({
  match_type: z.enum(['auto_invoice', 'auto_rule', 'manual', 'split']),
  matched_invoice_id: z.string().uuid().optional(),
  matched_supplier_invoice_id: z.string().uuid().optional(),
  notes: z.string().max(1000).optional(),
  debit_account: z.string().regex(/^\d{4}$/, 'Must be a 4-digit BAS account').optional(),
  credit_account: z.string().regex(/^\d{4}$/, 'Must be a 4-digit BAS account').optional(),
  description: z.string().max(500).optional(),
})

// Split transaction
export const SplitTransactionSchema = z.object({
  splits: z.array(
    z.object({
      amount: z.number().positive('Amount must be positive'),
      description: z.string().min(1, 'Description is required').max(500),
      debit_account: z.string().regex(/^\d{4}$/, 'Must be a 4-digit BAS account'),
      credit_account: z.string().regex(/^\d{4}$/, 'Must be a 4-digit BAS account'),
    })
  ).min(2, 'At least 2 splits required').max(20, 'Maximum 20 splits'),
})

// Payment method
export const CreatePaymentMethodSchema = z.object({
  method_type: z.enum(['bankgiro', 'plusgiro', 'swish', 'bank_transfer', 'cash', 'card']),
  account_number: z.string().max(50).optional(),
  description: z.string().max(200).optional(),
  is_default: z.boolean().optional().default(false),
  linked_bank_account: z.string().regex(/^\d{4}$/).optional(),
})

export const UpdatePaymentMethodSchema = z.object({
  method_type: z.enum(['bankgiro', 'plusgiro', 'swish', 'bank_transfer', 'cash', 'card']).optional(),
  account_number: z.string().max(50).optional(),
  description: z.string().max(200).optional(),
  is_default: z.boolean().optional(),
  linked_bank_account: z.string().regex(/^\d{4}$/).optional(),
  is_active: z.boolean().optional(),
})
