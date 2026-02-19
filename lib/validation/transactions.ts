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

// POST /api/transactions
export const CreateTransactionInputSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  description: z.string().min(1, 'Description is required'),
  amount: z.number({ error: 'Amount is required' }),
  currency: z.string().default('SEK'),
  category: TransactionCategorySchema.default('uncategorized'),
  is_business: z.boolean().nullable().optional(),
})

export type CreateTransactionInputZ = z.infer<typeof CreateTransactionInputSchema>

// POST /api/transactions/[id]/categorize
export const CategorizeTransactionInputSchema = z.object({
  is_business: z.boolean({ error: 'is_business is required' }),
  category: TransactionCategorySchema.optional(),
})

// POST /api/transactions/[id]/match-invoice
export const MatchInvoiceInputSchema = z.object({
  invoice_id: z.string().uuid('Invalid invoice ID'),
})

// POST /api/transactions/suggest-categories
export const SuggestCategoriesInputSchema = z.object({
  transaction_ids: z.array(z.string().uuid('Invalid transaction ID'))
    .min(1, 'At least one transaction ID is required')
    .max(50, 'Maximum 50 transaction IDs allowed'),
})

// POST /api/transactions/batch-match-invoices has no body — it's auto
// (No schema needed as the POST handler takes no request body)

export type CategorizeTransactionInputZ = z.infer<typeof CategorizeTransactionInputSchema>
export type MatchInvoiceInputZ = z.infer<typeof MatchInvoiceInputSchema>
export type SuggestCategoriesInputZ = z.infer<typeof SuggestCategoriesInputSchema>
