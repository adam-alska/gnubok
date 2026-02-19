import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET /api/annual-report/[id]/pdf
 * Generate and return a PDF of the annual report.
 *
 * NOTE: The actual PDF rendering is done client-side using @react-pdf/renderer
 * due to Next.js server component constraints with react-pdf.
 * This endpoint returns the structured data needed for client-side rendering.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  // Fetch the report with all data
  const { data: report, error } = await supabase
    .from('annual_reports')
    .select('*, fiscal_period:fiscal_periods(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !report) {
    return NextResponse.json({ error: 'Årsredovisning hittades inte' }, { status: 404 })
  }

  // Fetch company settings for additional context
  const { data: settings } = await supabase
    .from('company_settings')
    .select('*')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({
    data: {
      report,
      settings: settings
        ? {
            company_name: settings.company_name,
            org_number: settings.org_number,
            address_line1: settings.address_line1,
            postal_code: settings.postal_code,
            city: settings.city,
            entity_type: settings.entity_type,
          }
        : null,
    },
  })
}
