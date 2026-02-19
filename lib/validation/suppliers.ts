import { z } from 'zod'

export const CreateSupplierInputSchema = z.object({
  name: z.string().min(1, 'Namn krävs').max(200, 'Namn för långt'),
  org_number: z.string().max(30).optional(),
  vat_number: z.string().max(20).optional(),
  email: z.string().email('Ogiltig e-postadress').max(254).optional(),
  phone: z.string().max(30).optional(),
  address_line1: z.string().max(200).optional(),
  postal_code: z.string().max(20).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  bankgiro: z.string().max(20).optional(),
  plusgiro: z.string().max(20).optional(),
  iban: z.string().max(34).optional(),
  bic: z.string().max(11).optional(),
  clearing_number: z.string().max(10).optional(),
  account_number: z.string().max(20).optional(),
  default_payment_terms: z.number()
    .int('Betalningsvillkor måste vara heltal')
    .min(0, 'Betalningsvillkor kan inte vara negativt')
    .max(365, 'Betalningsvillkor kan inte överstiga 365 dagar')
    .optional(),
  category: z.string().max(100).optional(),
  notes: z.string().max(5000).optional(),
  is_active: z.boolean().optional(),
})

export const UpdateSupplierInputSchema = z.object({
  name: z.string().min(1, 'Namn krävs').max(200, 'Namn för långt').optional(),
  org_number: z.string().max(30).nullish(),
  vat_number: z.string().max(20).nullish(),
  email: z.string().email('Ogiltig e-postadress').max(254).nullish(),
  phone: z.string().max(30).nullish(),
  address_line1: z.string().max(200).nullish(),
  postal_code: z.string().max(20).nullish(),
  city: z.string().max(100).nullish(),
  country: z.string().max(100).optional(),
  bankgiro: z.string().max(20).nullish(),
  plusgiro: z.string().max(20).nullish(),
  iban: z.string().max(34).nullish(),
  bic: z.string().max(11).nullish(),
  clearing_number: z.string().max(10).nullish(),
  account_number: z.string().max(20).nullish(),
  default_payment_terms: z.number()
    .int('Betalningsvillkor måste vara heltal')
    .min(0, 'Betalningsvillkor kan inte vara negativt')
    .max(365, 'Betalningsvillkor kan inte överstiga 365 dagar')
    .optional(),
  category: z.string().max(100).nullish(),
  notes: z.string().max(5000).nullish(),
  is_active: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Minst ett fält måste anges för uppdatering' }
)

const SupplierInvoiceItemSchema = z.object({
  description: z.string().min(1, 'Beskrivning krävs').max(500),
  quantity: z.number().min(0, 'Antal kan inte vara negativt'),
  unit: z.string().max(20).optional(),
  unit_price: z.number(),
  account_number: z.string().max(10).optional(),
  vat_rate: z.number().min(0).max(100).optional(),
  cost_center: z.string().max(50).optional(),
  project: z.string().max(50).optional(),
})

export const CreateSupplierInvoiceInputSchema = z.object({
  supplier_id: z.string().uuid('Ogiltigt leverantörs-ID'),
  invoice_number: z.string().min(1, 'Fakturanummer krävs').max(100),
  ocr_number: z.string().max(50).optional(),
  invoice_date: z.string().optional(),
  due_date: z.string().optional(),
  received_date: z.string().optional(),
  currency: z.string().max(3).optional(),
  exchange_rate: z.number().positive().optional(),
  subtotal: z.number(),
  vat_amount: z.number().min(0),
  total: z.number(),
  vat_rate: z.number().min(0).max(100).optional(),
  payment_method: z.enum(['bankgiro', 'plusgiro', 'bank_transfer', 'swish', 'cash']).optional(),
  payment_reference: z.string().max(50).optional(),
  attachment_url: z.string().url().optional(),
  notes: z.string().max(5000).optional(),
  items: z.array(SupplierInvoiceItemSchema).min(1, 'Minst en rad krävs'),
})

export const UpdateSupplierInvoiceInputSchema = z.object({
  invoice_number: z.string().min(1).max(100).optional(),
  ocr_number: z.string().max(50).nullish(),
  invoice_date: z.string().optional(),
  due_date: z.string().optional(),
  status: z.enum(['draft', 'received', 'attested', 'approved', 'scheduled', 'paid', 'disputed', 'credited']).optional(),
  currency: z.string().max(3).optional(),
  exchange_rate: z.number().positive().nullish(),
  subtotal: z.number().optional(),
  vat_amount: z.number().min(0).optional(),
  total: z.number().optional(),
  vat_rate: z.number().min(0).max(100).optional(),
  payment_method: z.enum(['bankgiro', 'plusgiro', 'bank_transfer', 'swish', 'cash']).nullish(),
  payment_reference: z.string().max(50).nullish(),
  attachment_url: z.string().url().nullish(),
  notes: z.string().max(5000).nullish(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Minst ett fält måste anges för uppdatering' }
)

export const AttestSupplierInvoiceInputSchema = z.object({
  action: z.enum(['attested', 'rejected', 'commented']),
  comment: z.string().max(2000).optional(),
})

export const CreateSupplierPaymentInputSchema = z.object({
  payment_date: z.string().min(1, 'Betalningsdatum krävs'),
  invoice_ids: z.array(z.string().uuid()).min(1, 'Minst en faktura krävs'),
})

export type CreateSupplierInputZ = z.infer<typeof CreateSupplierInputSchema>
export type UpdateSupplierInputZ = z.infer<typeof UpdateSupplierInputSchema>
export type CreateSupplierInvoiceInputZ = z.infer<typeof CreateSupplierInvoiceInputSchema>
export type UpdateSupplierInvoiceInputZ = z.infer<typeof UpdateSupplierInvoiceInputSchema>
export type AttestSupplierInvoiceInputZ = z.infer<typeof AttestSupplierInvoiceInputSchema>
export type CreateSupplierPaymentInputZ = z.infer<typeof CreateSupplierPaymentInputSchema>
