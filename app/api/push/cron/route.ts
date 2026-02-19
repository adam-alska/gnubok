import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import {
  sendTaxDeadlineNotifications,
  sendInvoiceNotifications,
} from '@/lib/push/notification-scheduler'
import { logger } from '@/lib/logger'

/**
 * GET /api/push/cron
 * Daily cron job to send push notifications
 * Runs at 09:00 every day
 *
 * Vercel Cron: "0 9 * * *"
 */
export async function GET(request: Request) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Create a service role client for accessing all user data
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'Missing Supabase configuration' },
      { status: 500 }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    // Send all notification types in parallel
    const [taxResult, invoiceResult] = await Promise.all([
      sendTaxDeadlineNotifications(supabase),
      sendInvoiceNotifications(supabase),
    ])

    const totalSent = taxResult.sent + invoiceResult.sent
    const totalSkipped = taxResult.skipped + invoiceResult.skipped

    logger.info('push-cron', 'Push notification cron completed', { totalSent, totalSkipped, taxSent: taxResult.sent, taxSkipped: taxResult.skipped, invoiceSent: invoiceResult.sent, invoiceSkipped: invoiceResult.skipped })

    return NextResponse.json({
      success: true,
      totalSent,
      totalSkipped,
      details: {
        taxDeadlines: taxResult,
        invoices: invoiceResult,
      },
    })
  } catch (error) {
    logger.error('push-cron', 'Error in push notification cron', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json(
      { error: 'Failed to send push notifications' },
      { status: 500 }
    )
  }
}
