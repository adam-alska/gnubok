import { z } from 'zod'

const CurrencySchema = z.enum(['SEK', 'EUR', 'USD', 'GBP', 'NOK', 'DKK'])

const dateString = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid date in YYYY-MM-DD format')

const CreateOrderItemSchema = z.object({
  description: z.string().min(1, 'Beskrivning krävs').max(500),
  quantity: z.number().positive('Antal måste vara positivt'),
  unit: z.string().min(1, 'Enhet krävs').max(20),
  unit_price: z.number().min(0, 'Pris kan inte vara negativt'),
})

export const CreateOrderInputSchema = z.object({
  customer_id: z.string().uuid('Ogiltigt kund-ID'),
  quote_id: z.string().uuid().optional(),
  order_date: dateString,
  delivery_date: dateString.optional(),
  currency: CurrencySchema.optional().default('SEK'),
  your_reference: z.string().max(200).optional(),
  our_reference: z.string().max(200).optional(),
  delivery_address: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  items: z.array(CreateOrderItemSchema).min(1, 'Minst en rad krävs').max(100),
})

export const UpdateOrderInputSchema = z.object({
  customer_id: z.string().uuid().optional(),
  order_date: dateString.optional(),
  delivery_date: dateString.nullish(),
  currency: CurrencySchema.optional(),
  status: z.enum(['draft', 'confirmed', 'in_progress', 'delivered', 'invoiced', 'cancelled']).optional(),
  your_reference: z.string().max(200).nullish(),
  our_reference: z.string().max(200).nullish(),
  delivery_address: z.string().max(500).nullish(),
  notes: z.string().max(2000).nullish(),
  items: z.array(CreateOrderItemSchema).min(1).max(100).optional(),
})

export type CreateOrderInputZ = z.infer<typeof CreateOrderInputSchema>
export type UpdateOrderInputZ = z.infer<typeof UpdateOrderInputSchema>
