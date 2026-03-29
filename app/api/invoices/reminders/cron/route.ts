import { NextResponse } from 'next/server'
import { processOverdueReminders } from '@/lib/invoices/reminder-processor'
import { getEmailService } from '@/lib/email/service'
import { verifyCronSecret } from '@/lib/auth/cron'

export async function GET(request: Request) {
  const authError = verifyCronSecret(request)
  if (authError) return authError

  // Check if email service is configured
  if (!getEmailService().isConfigured()) {
    console.error('Email service not configured, skipping reminder cron')
    return NextResponse.json({
      success: false,
      error: 'Email service not configured'
    }, { status: 503 })
  }

  try {
    console.log('Starting invoice reminder cron job...')

    const result = await processOverdueReminders()

    console.log(`Reminder cron completed: ${result.sent} sent, ${result.failed} failed out of ${result.processed} processed`)

    return NextResponse.json({
      success: true,
      processed: result.processed,
      sent: result.sent,
      failed: result.failed,
      results: result.results.map(r => ({
        invoiceNumber: r.invoiceNumber,
        reminderLevel: r.reminderLevel,
        success: r.success,
        error: r.error
      }))
    })
  } catch (error) {
    console.error('Invoice reminder cron job error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cron job failed' },
      { status: 500 }
    )
  }
}

// Also support POST for manual triggering via dashboard
export async function POST(request: Request) {
  return GET(request)
}
