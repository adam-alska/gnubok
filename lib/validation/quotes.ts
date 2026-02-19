import { z } from 'zod'

const CurrencySchema = z.enum(['SEK', 'EUR', 'USD', 'GBP', 'NOK', 'DKK'])

const dateString = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid date in YYYY-MM-DD format')

const CreateQuoteItemSchema = z.object({
  description: z.string().min(1, 'Beskrivning krävs').max(500),
  quantity: z.number().positive('Antal måste vara positivt'),
  unit: z.string().min(1, 'Enhet krävs').max(20),
  unit_price: z.number().min(0, 'Pris kan inte vara negativt'),
})

export const CreateQuoteInputSchema = z.object({
  customer_id: z.string().uuid('Ogiltigt kund-ID'),
  quote_date: dateString,
  valid_until: dateString,
  currency: CurrencySchema.optional().default('SEK'),
  your_reference: z.string().max(200).optional(),
  our_reference: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  items: z.array(CreateQuoteItemSchema).min(1, 'Minst en rad krävs').max(100),
})

export const UpdateQuoteInputSchema = z.object({
  customer_id: z.string().uuid().optional(),
  quote_date: dateString.optional(),
  valid_until: dateString.optional(),
  currency: CurrencySchema.optional(),
  status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted']).optional(),
  your_reference: z.string().max(200).nullish(),
  our_reference: z.string().max(200).nullish(),
  notes: z.string().max(2000).nullish(),
  items: z.array(CreateQuoteItemSchema).min(1).max(100).optional(),
})

export const ConvertQuoteInputSchema = z.object({
  target: z.enum(['order', 'invoice']),
})

export type CreateQuoteInputZ = z.infer<typeof CreateQuoteInputSchema>
export type UpdateQuoteInputZ = z.infer<typeof UpdateQuoteInputSchema>
export type ConvertQuoteInputZ = z.infer<typeof ConvertQuoteInputSchema>
