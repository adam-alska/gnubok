import { z } from 'zod'

// Shared enums
const CurrencySchema = z.enum(['SEK', 'EUR', 'USD', 'GBP', 'NOK', 'DKK'])

// ISO date string pattern: YYYY-MM-DD
const dateString = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid date in YYYY-MM-DD format')

// Invoice item input
const CreateInvoiceItemInputSchema = z.object({
  description: z.string().min(1, 'Description is required').max(500, 'Description too long'),
  quantity: z.number().positive('Quantity must be positive'),
  unit: z.string().min(1, 'Unit is required').max(20, 'Unit too long'),
  unit_price: z.number().min(0, 'Unit price cannot be negative'),
})

// Create invoice input
export const CreateInvoiceInputSchema = z.object({
  customer_id: z.string().uuid('Invalid customer ID'),
  invoice_date: dateString,
  due_date: dateString,
  currency: CurrencySchema,
  your_reference: z.string().max(200).optional(),
  our_reference: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  items: z.array(CreateInvoiceItemInputSchema)
    .min(1, 'At least one invoice item is required')
    .max(100, 'Too many invoice items'),
})

// Credit note input
export const CreateCreditNoteInputSchema = z.object({
  credited_invoice_id: z.string().uuid('Invalid invoice ID'),
  reason: z.string().max(1000).optional(),
})

// Update invoice (partial, for future use)
export const UpdateInvoiceInputSchema = z.object({
  customer_id: z.string().uuid('Invalid customer ID').optional(),
  invoice_date: dateString.optional(),
  due_date: dateString.optional(),
  currency: CurrencySchema.optional(),
  your_reference: z.string().max(200).nullish(),
  our_reference: z.string().max(200).nullish(),
  notes: z.string().max(2000).nullish(),
  items: z.array(CreateInvoiceItemInputSchema).min(1).max(100).optional(),
})

// Reminder action input (public endpoint)
export const ReminderActionInputSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  action: z.enum(['marked_paid', 'disputed'], {
    error: 'Action must be "marked_paid" or "disputed"',
  }),
})

// VAT validation input
export const VatValidateInputSchema = z.object({
  vat_number: z.string()
    .min(4, 'VAT number too short')
    .max(20, 'VAT number too long'),
  customer_id: z.string().uuid('Invalid customer ID').optional(),
})

export type CreateInvoiceInputZ = z.infer<typeof CreateInvoiceInputSchema>
export type CreateCreditNoteInputZ = z.infer<typeof CreateCreditNoteInputSchema>
export type UpdateInvoiceInputZ = z.infer<typeof UpdateInvoiceInputSchema>
export type ReminderActionInputZ = z.infer<typeof ReminderActionInputSchema>
export type VatValidateInputZ = z.infer<typeof VatValidateInputSchema>
