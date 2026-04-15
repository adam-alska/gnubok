import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ensureInitialized } from '@/lib/init'
import { requireCompanyId } from '@/lib/company/context'
import { eventBus } from '@/lib/events'

ensureInitialized()

/**
 * Submit AGI to Skatteverket via the extension API.
 *
 * This route orchestrates the AGI submission flow:
 * 1. Validates the salary run is in a submittable state
 * 2. Ensures AGI has been generated (in agi_declarations table)
 * 3. Calls the Skatteverket extension to save draft + lock for signing
 * 4. Returns the signeringslänk for BankID signing
 *
 * The user then signs on Skatteverket's site. The frontend polls
 * GET /api/extensions/ext/skatteverket/agi/submitted to detect completion.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await requireCompanyId(supabase, user.id)

  // Load salary run
  const { data: run, error: runError } = await supabase
    .from('salary_runs')
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)
    .single()

  if (runError || !run) {
    return NextResponse.json({ error: 'Lönekörning hittades inte' }, { status: 404 })
  }

  if (!['review', 'approved', 'paid', 'booked'].includes(run.status)) {
    return NextResponse.json(
      { error: 'AGI kan bara skickas till Skatteverket efter granskning' },
      { status: 400 }
    )
  }

  // Ensure AGI has been generated
  const { data: agiDeclaration } = await supabase
    .from('agi_declarations')
    .select('id, status')
    .eq('company_id', companyId)
    .eq('salary_run_id', id)
    .single()

  if (!agiDeclaration) {
    return NextResponse.json(
      { error: 'AGI har inte genererats ännu. Generera AGI XML först.' },
      { status: 400 }
    )
  }

  if (agiDeclaration.status === 'submitted' || agiDeclaration.status === 'accepted') {
    return NextResponse.json(
      { error: 'AGI har redan skickats till Skatteverket för denna period' },
      { status: 409 }
    )
  }

  // The actual submission is done via the Skatteverket extension routes.
  // This route provides the salary_run_id for the extension to load data from.
  // The frontend should call:
  //   1. POST /api/extensions/ext/skatteverket/agi/draft   { salaryRunId }
  //   2. PUT  /api/extensions/ext/skatteverket/agi/lock    ?arbetsgivare=...&period=...
  //   3. User signs with BankID via signeringslänk
  //   4. GET  /api/extensions/ext/skatteverket/agi/submitted ?arbetsgivare=...&period=...
  //
  // This endpoint kicks off step 1 and returns the info needed for step 2+.

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  try {
    // Call the extension's draft endpoint internally
    const draftResponse = await fetch(
      `${appUrl}/api/extensions/ext/skatteverket/agi/draft`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': request.headers.get('Cookie') || '',
        },
        body: JSON.stringify({ salaryRunId: id }),
      }
    )

    if (!draftResponse.ok) {
      const errorData = await draftResponse.json().catch(() => ({ error: 'Okänt fel' }))
      return NextResponse.json(
        { error: errorData.error || `Kunde inte spara AGI-utkast (${draftResponse.status})` },
        { status: draftResponse.status }
      )
    }

    const draftData = await draftResponse.json()

    // Update submission timestamp on salary run
    await supabase
      .from('salary_runs')
      .update({ agi_submitted_at: new Date().toISOString() })
      .eq('id', id)

    await eventBus.emit({
      type: 'agi.submitted',
      payload: {
        salaryRunId: id,
        periodYear: run.period_year,
        periodMonth: run.period_month,
        userId: user.id,
        companyId,
      },
    })

    return NextResponse.json({
      data: {
        ...draftData.data,
        salaryRunId: id,
        periodYear: run.period_year,
        periodMonth: run.period_month,
        message: 'AGI sparad som utkast hos Skatteverket. Lås och signera med BankID för att slutföra.',
      },
    })
  } catch (err) {
    console.error('[salary/agi/submit] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Kunde inte skicka AGI till Skatteverket' },
      { status: 500 }
    )
  }
}
