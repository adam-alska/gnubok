import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/auth/cron'
import {
  performSync,
  SCHEDULE_KEY,
  saveExtensionData,
} from '@/extensions/general/cloud-backup/lib/sync'
import type { GoogleDriveSchedule } from '@/extensions/general/cloud-backup/types'

/**
 * GET /api/extensions/cloud-backup/auto-sync/cron
 *
 * Runs hourly. Finds all companies with `google_drive_schedule.enabled = true`
 * whose `hour_utc` matches the current UTC hour, and whose `last_auto_sync_at`
 * is either unset or more than 20 hours old. Triggers a full Drive backup for
 * each qualifying company via the shared `performSync()` helper.
 *
 * Uses the service role client — no user session, no RLS. Each row in
 * `extension_data` carries its own `user_id` (the user who configured the
 * schedule), which we use as the "actor" when writing back the sync result.
 */
export async function GET(request: Request) {
  const authError = verifyCronSecret(request)
  if (authError) return authError

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'Missing Supabase configuration' },
      { status: 500 }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const currentHourUtc = new Date().getUTCHours()
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const { data: rows, error } = await supabase
    .from('extension_data')
    .select('company_id, user_id, value')
    .eq('extension_id', 'cloud-backup')
    .eq('key', SCHEDULE_KEY)

  if (error) {
    console.error('[cloud-backup-cron] Failed to fetch schedules', {
      message: error.message,
      code: error.code,
    })
    return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 })
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ message: 'No schedules configured', processed: 0 })
  }

  const candidates = rows.filter((r) => {
    const schedule = r.value as GoogleDriveSchedule | null
    if (!schedule || !schedule.enabled) return false
    if (schedule.hour_utc !== currentHourUtc) return false
    if (schedule.last_auto_sync_at) {
      const ageMs = Date.now() - new Date(schedule.last_auto_sync_at).getTime()
      if (ageMs < 20 * 60 * 60 * 1000) return false
    }
    return true
  })

  if (candidates.length === 0) {
    return NextResponse.json({
      message: 'No companies due this hour',
      checked: rows.length,
      processed: 0,
    })
  }

  const startTime = Date.now()
  const TIME_BUDGET_MS = 250_000 // 4m10s — leaves 50s margin below Vercel's 300s Pro limit

  const results: {
    companyId: string
    status: 'success' | 'error' | 'skipped'
    error?: string
  }[] = []

  for (const row of candidates) {
    if (Date.now() - startTime > TIME_BUDGET_MS) {
      console.log(
        `[cloud-backup-cron] Time budget reached after ${results.length} companies; ${candidates.length - results.length} skipped until next run`
      )
      break
    }

    const companyId = row.company_id as string
    const userId = row.user_id as string
    const schedule = row.value as GoogleDriveSchedule

    try {
      const syncResult = await performSync({
        supabase,
        companyId,
        userId,
        origin,
        includeDocuments: true,
      })

      const updated: GoogleDriveSchedule = {
        ...schedule,
        last_auto_sync_at: new Date().toISOString(),
        last_auto_sync_status: syncResult.ok ? 'success' : 'error',
        last_auto_sync_error: syncResult.ok ? null : syncResult.message,
      }
      await saveExtensionData(supabase, companyId, userId, SCHEDULE_KEY, updated)

      results.push({
        companyId,
        status: syncResult.ok ? 'success' : 'error',
        error: syncResult.ok ? undefined : syncResult.message,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('[cloud-backup-cron] Sync failed for company', {
        companyId,
        message,
      })

      const updated: GoogleDriveSchedule = {
        ...schedule,
        last_auto_sync_at: new Date().toISOString(),
        last_auto_sync_status: 'error',
        last_auto_sync_error: message.slice(0, 200),
      }
      await saveExtensionData(supabase, companyId, userId, SCHEDULE_KEY, updated).catch(
        (persistErr) => {
          console.error('[cloud-backup-cron] Failed to persist failure state', persistErr)
        }
      )

      results.push({ companyId, status: 'error', error: message })
    }
  }

  const successCount = results.filter((r) => r.status === 'success').length
  const errorCount = results.filter((r) => r.status === 'error').length

  console.log(
    `[cloud-backup-cron] Processed ${results.length} companies: ${successCount} succeeded, ${errorCount} failed`
  )

  return NextResponse.json({
    checked: rows.length,
    candidates: candidates.length,
    processed: results.length,
    successes: successCount,
    errors: errorCount,
    results,
  })
}
