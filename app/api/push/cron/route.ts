import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import {
  sendTaxDeadlineNotifications,
  sendInvoiceNotifications,
} from '@/lib/push/notification-scheduler'

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

    console.log(
      `Push notification cron completed: ${totalSent} sent, ${totalSkipped} skipped`
    )
    console.log(
      `  Tax: ${taxResult.sent} sent, ${taxResult.skipped} skipped`
    )
    console.log(
      `  Invoice: ${invoiceResult.sent} sent, ${invoiceResult.skipped} skipped`
    )

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
    console.error('Error in push notification cron:', error)
    return NextResponse.json(
      { error: 'Failed to send push notifications' },
      { status: 500 }
    )
  }
}
