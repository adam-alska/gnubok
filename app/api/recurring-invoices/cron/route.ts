import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { processRecurringInvoices } from '@/lib/invoices/recurring-engine'

/**
 * Cron endpoint for processing recurring invoices.
 *
 * This should be called periodically (e.g., daily) by a cron job.
 * Uses the service role client to bypass RLS since cron jobs are not user-authenticated.
 *
 * Protect this endpoint with a CRON_SECRET header in production.
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()

  const result = await processRecurringInvoices(supabase)

  return NextResponse.json({
    message: `Processed ${result.processed} recurring invoices`,
    ...result,
  })
}
