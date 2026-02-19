import { z } from 'zod'

// POST /api/banking/connect
export const ConnectBankInputSchema = z.object({
  aspsp_name: z.string().min(1, 'Bank name is required').max(100, 'Bank name too long'),
  aspsp_country: z.string()
    .length(2, 'Country code must be exactly 2 characters')
    .regex(/^[A-Z]{2}$/, 'Country code must be two uppercase letters'),
})

// POST /api/banking/sync
export const SyncBankInputSchema = z.object({
  connection_id: z.string().uuid('Invalid connection ID'),
  days_back: z.number()
    .int('Days must be a whole number')
    .min(1, 'Must sync at least 1 day')
    .max(730, 'Cannot sync more than 2 years')
    .optional()
    .default(30),
})

export type ConnectBankInputZ = z.infer<typeof ConnectBankInputSchema>
export type SyncBankInputZ = z.infer<typeof SyncBankInputSchema>
