import { z } from 'zod'

const CurrencySchema = z.enum(['SEK', 'EUR', 'USD', 'GBP', 'NOK', 'DKK'])

const dateString = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid date in YYYY-MM-DD format')

const RecurringItemSchema = z.object({
  description: z.string().min(1, 'Beskrivning krävs').max(500),
  quantity: z.number().positive('Antal måste vara positivt'),
  unit: z.string().min(1, 'Enhet krävs').max(20),
  unit_price: z.number().min(0, 'Pris kan inte vara negativt'),
})

export const CreateRecurringInvoiceInputSchema = z.object({
  customer_id: z.string().uuid('Ogiltigt kund-ID'),
  template_name: z.string().min(1, 'Mallnamn krävs').max(200),
  description: z.string().max(1000).optional(),
  frequency: z.enum(['weekly', 'monthly', 'quarterly', 'semi_annually', 'annually']),
  interval_count: z.number().int().min(1).max(52).optional().default(1),
  start_date: dateString,
  end_date: dateString.optional(),
  items: z.array(RecurringItemSchema).min(1, 'Minst en rad krävs').max(100),
  currency: CurrencySchema.optional().default('SEK'),
  your_reference: z.string().max(200).optional(),
  our_reference: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  payment_terms_days: z.number().int().min(0).max(365).optional().default(30),
})

export const UpdateRecurringInvoiceInputSchema = z.object({
  template_name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullish(),
  frequency: z.enum(['weekly', 'monthly', 'quarterly', 'semi_annually', 'annually']).optional(),
  interval_count: z.number().int().min(1).max(52).optional(),
  end_date: dateString.nullish(),
  is_active: z.boolean().optional(),
  items: z.array(RecurringItemSchema).min(1).max(100).optional(),
  currency: CurrencySchema.optional(),
  your_reference: z.string().max(200).nullish(),
  our_reference: z.string().max(200).nullish(),
  notes: z.string().max(2000).nullish(),
  payment_terms_days: z.number().int().min(0).max(365).optional(),
})

export type CreateRecurringInvoiceInputZ = z.infer<typeof CreateRecurringInvoiceInputSchema>
export type UpdateRecurringInvoiceInputZ = z.infer<typeof UpdateRecurringInvoiceInputSchema>
