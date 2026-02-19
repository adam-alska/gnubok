import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { aggregateBalancesBySRU } from '@/extensions/sru-export/sru-engine'
import {
  generateGenericSRU,
  getGenericSRUFilename,
  sruFileToString,
  validateSRUFile,
  SRU_CODE_DESCRIPTIONS,
} from '@/extensions/sru-export/sru-generator'
import type { SRUFormType } from '@/extensions/sru-export/sru-generator'
import type { EntityType } from '@/types'

/**
 * GET /api/extensions/sru-export
 *
 * Generate SRU export from chart_of_accounts sru_code mappings.
 *
 * Query parameters:
 * - period_id: Fiscal period ID (required)
 * - format: 'json' (default) or 'sru' for downloadable file
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const periodId = searchParams.get('period_id')
  const format = searchParams.get('format') || 'json'

  if (!periodId) {
    return NextResponse.json(
      { error: 'period_id is required' },
      { status: 400 }
    )
  }

  try {
    // Fetch company settings to determine entity type
    const { data: settings } = await supabase
      .from('company_settings')
      .select('entity_type, company_name, org_number')
      .eq('user_id', user.id)
      .single()

    if (!settings) {
      return NextResponse.json(
        { error: 'Company settings not found. Complete onboarding first.' },
        { status: 400 }
      )
    }

    // Determine form type from entity type
    const formType: SRUFormType = settings.entity_type === 'aktiebolag' ? 'INK2' : 'NE'

    // Fetch fiscal period for date range
    const { data: period } = await supabase
      .from('fiscal_periods')
      .select('*')
      .eq('id', periodId)
      .eq('user_id', user.id)
      .single()

    if (!period) {
      return NextResponse.json(
        { error: 'Fiscal period not found' },
        { status: 404 }
      )
    }

    // Aggregate balances by SRU code
    const sruBalances = await aggregateBalancesBySRU(user.id, periodId)

    if (format === 'sru') {
      // Generate and return SRU file
      const sruFile = generateGenericSRU({
        formType,
        orgNumber: settings.org_number,
        companyName: settings.company_name || 'Okänt företag',
        fiscalYearStart: period.period_start,
        fiscalYearEnd: period.period_end,
        sruBalances,
      })

      const validation = validateSRUFile(sruFile)
      if (!validation.isValid) {
        return NextResponse.json(
          { error: 'SRU validation failed', details: validation.errors },
          { status: 500 }
        )
      }

      const sruContent = sruFileToString(sruFile)
      const filename = getGenericSRUFilename(formType, settings.org_number, period.period_start)

      return new NextResponse(sruContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    // Default: return JSON preview
    const balancesArray = Array.from(sruBalances.values())
      .sort((a, b) => a.sruCode.localeCompare(b.sruCode))
      .map((b) => ({
        sruCode: b.sruCode,
        description: SRU_CODE_DESCRIPTIONS[b.sruCode] || `SRU ${b.sruCode}`,
        amount: b.amount,
        accounts: b.accounts,
      }))

    const warnings: string[] = []
    if (!period.is_closed) {
      warnings.push('Räkenskapsåret är inte stängt. Siffrorna kan ändras.')
    }
    if (balancesArray.length === 0) {
      warnings.push('Inga konton med SRU-koder har bokförda poster i denna period.')
    }

    return NextResponse.json({
      data: {
        formType,
        entityType: settings.entity_type as EntityType,
        companyName: settings.company_name,
        orgNumber: settings.org_number,
        fiscalYear: {
          id: period.id,
          name: period.name,
          start: period.period_start,
          end: period.period_end,
        },
        balances: balancesArray,
        warnings,
      },
    })
  } catch (err) {
    console.error('Error generating SRU export:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate SRU export' },
      { status: 500 }
    )
  }
}
