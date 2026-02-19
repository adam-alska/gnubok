import { z } from 'zod'
import { NextResponse } from 'next/server'

/**
 * Validate a request body against a Zod schema.
 * Returns either the validated data or a NextResponse with 400 status.
 */
export function validateBody<T>(schema: z.ZodSchema<T>, body: unknown):
  { success: true; data: T } | { success: false; response: NextResponse } {
  const result = schema.safeParse(body)
  if (!result.success) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Validation failed', details: result.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
  }
  return { success: true, data: result.data }
}

// Re-export all schemas
export * from './invoices'
export * from './customers'
export * from './transactions'
export * from './bookkeeping'
export * from './receipts'
export * from './deadlines'
export * from './settings'
export * from './banking'
export * from './calendar'
export * from './chat'
export * from './import'
