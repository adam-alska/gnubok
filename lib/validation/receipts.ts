import { z } from 'zod'

const TransactionCategorySchema = z.enum([
  'income_services',
  'income_products',
  'income_other',
  'expense_equipment',
  'expense_software',
  'expense_travel',
  'expense_office',
  'expense_marketing',
  'expense_professional_services',
  'expense_education',
  'expense_bank_fees',
  'expense_card_fees',
  'expense_currency_exchange',
  'expense_other',
  'private',
  'uncategorized',
])

const ReceiptStatusSchema = z.enum([
  'pending',
  'processing',
  'extracted',
  'confirmed',
  'error',
])

// Confirm line item input
const ConfirmLineItemInputSchema = z.object({
  id: z.string().uuid('Invalid line item ID'),
  is_business: z.boolean({ error: 'is_business is required' }),
  category: TransactionCategorySchema.optional(),
  bas_account: z.string().regex(/^\d{4}$/, 'Account number must be 4 digits').optional(),
})

// POST /api/receipts/[id]/confirm
export const ConfirmReceiptInputSchema = z.object({
  line_items: z.array(ConfirmLineItemInputSchema)
    .min(1, 'At least one line item is required')
    .max(200, 'Too many line items'),
  matched_transaction_id: z.string().uuid('Invalid transaction ID').optional(),
  representation_persons: z.number()
    .int('Must be a whole number')
    .min(1, 'At least 1 person')
    .max(100, 'Too many persons')
    .optional(),
  representation_purpose: z.string().max(500, 'Purpose too long').optional(),
})

// PATCH /api/receipts/[id]/match — link receipt to transaction
export const ReceiptMatchInputSchema = z.object({
  transaction_id: z.string().uuid('Invalid transaction ID'),
  match_confidence: z.number().min(0).max(1).optional(),
})

// PATCH /api/receipts/[id] — update receipt
export const UpdateReceiptInputSchema = z.object({
  merchant_name: z.string().max(200).optional(),
  receipt_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format')
    .optional(),
  receipt_time: z.string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Must be HH:MM or HH:MM:SS format')
    .optional(),
  total_amount: z.number().min(0, 'Total amount cannot be negative').optional(),
  currency: z.string().min(3).max(3).optional(),
  vat_amount: z.number().min(0).optional(),
  is_restaurant: z.boolean().optional(),
  is_systembolaget: z.boolean().optional(),
  is_foreign_merchant: z.boolean().optional(),
  representation_persons: z.number()
    .int()
    .min(1)
    .max(100)
    .nullish(),
  representation_purpose: z.string().max(500).nullish(),
  status: ReceiptStatusSchema.optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' }
)

export type ConfirmReceiptInputZ = z.infer<typeof ConfirmReceiptInputSchema>
export type ReceiptMatchInputZ = z.infer<typeof ReceiptMatchInputSchema>
export type UpdateReceiptInputZ = z.infer<typeof UpdateReceiptInputSchema>
