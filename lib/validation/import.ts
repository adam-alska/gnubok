import { z } from 'zod'

// Account number: 4 digits per Swedish BAS
const accountNumberSchema = z.string()
  .regex(/^\d{4}$/, 'Account number must be exactly 4 digits')

// POST /api/import/sie/mappings — bulk save mappings
const AccountMappingSchema = z.object({
  sourceAccount: z.string().min(1, 'Source account is required').max(10),
  sourceName: z.string().max(200).optional(),
  targetAccount: accountNumberSchema,
  confidence: z.number().min(0).max(1).optional(),
  matchType: z.enum(['exact', 'name', 'class', 'manual']).optional(),
})

export const SaveMappingsInputSchema = z.object({
  mappings: z.array(AccountMappingSchema)
    .min(1, 'At least one mapping is required')
    .max(1000, 'Too many mappings'),
})

// PUT /api/import/sie/mappings — update single mapping
export const UpdateMappingInputSchema = z.object({
  sourceAccount: z.string().min(1, 'Source account is required').max(10),
  targetAccount: accountNumberSchema,
})

// POST /api/import/sie/create-accounts
const SIEAccountSchema = z.object({
  number: z.string().min(1, 'Account number is required').max(10),
  name: z.string().min(1, 'Account name is required').max(200),
})

export const CreateAccountsFromSIEInputSchema = z.object({
  accounts: z.array(SIEAccountSchema)
    .min(1, 'At least one account is required')
    .max(2000, 'Too many accounts'),
})

// POST /api/push/subscribe
export const PushSubscribeInputSchema = z.object({
  endpoint: z.string()
    .url('Invalid endpoint URL')
    .max(2000, 'Endpoint URL too long'),
  keys: z.object({
    p256dh: z.string().min(1, 'p256dh key is required'),
    auth: z.string().min(1, 'auth key is required'),
  }),
})

// DELETE /api/push/subscribe
export const PushUnsubscribeInputSchema = z.object({
  endpoint: z.string()
    .url('Invalid endpoint URL')
    .max(2000, 'Endpoint URL too long'),
})

export type SaveMappingsInputZ = z.infer<typeof SaveMappingsInputSchema>
export type UpdateMappingInputZ = z.infer<typeof UpdateMappingInputSchema>
export type CreateAccountsFromSIEInputZ = z.infer<typeof CreateAccountsFromSIEInputSchema>
export type PushSubscribeInputZ = z.infer<typeof PushSubscribeInputSchema>
export type PushUnsubscribeInputZ = z.infer<typeof PushUnsubscribeInputSchema>
