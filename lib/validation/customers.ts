import { z } from 'zod'

const CustomerTypeSchema = z.enum([
  'individual',
  'swedish_business',
  'eu_business',
  'non_eu_business',
])

export const CreateCustomerInputSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name too long'),
  customer_type: CustomerTypeSchema,
  email: z.string().email('Invalid email address').max(254).optional(),
  phone: z.string().max(30, 'Phone number too long').optional(),
  address_line1: z.string().max(200).optional(),
  address_line2: z.string().max(200).optional(),
  postal_code: z.string().max(20).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  org_number: z.string().max(30).optional(),
  vat_number: z.string().max(20).optional(),
  default_payment_terms: z.number()
    .int('Payment terms must be a whole number')
    .min(0, 'Payment terms cannot be negative')
    .max(365, 'Payment terms cannot exceed 365 days')
    .optional(),
  notes: z.string().max(5000).optional(),
})

export const UpdateCustomerInputSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name too long').optional(),
  customer_type: CustomerTypeSchema.optional(),
  email: z.string().email('Invalid email address').max(254).nullish(),
  phone: z.string().max(30, 'Phone number too long').nullish(),
  address_line1: z.string().max(200).nullish(),
  address_line2: z.string().max(200).nullish(),
  postal_code: z.string().max(20).nullish(),
  city: z.string().max(100).nullish(),
  country: z.string().max(100).optional(),
  org_number: z.string().max(30).nullish(),
  vat_number: z.string().max(20).nullish(),
  default_payment_terms: z.number()
    .int('Payment terms must be a whole number')
    .min(0, 'Payment terms cannot be negative')
    .max(365, 'Payment terms cannot exceed 365 days')
    .optional(),
  notes: z.string().max(5000).nullish(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' }
)

export type CreateCustomerInputZ = z.infer<typeof CreateCustomerInputSchema>
export type UpdateCustomerInputZ = z.infer<typeof UpdateCustomerInputSchema>
