import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { loadTaxTableRates, lookupTaxAmount } from '@/lib/salary/tax-tables'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString())
  const tableNumber = parseInt(searchParams.get('table') || '0')
  const column = parseInt(searchParams.get('column') || '1')
  const income = parseFloat(searchParams.get('income') || '0')

  if (!tableNumber || tableNumber < 29 || tableNumber > 42) {
    return NextResponse.json({ error: 'Skattetabell måste vara 29-42' }, { status: 400 })
  }

  const rates = await loadTaxTableRates(supabase, year, tableNumber, column)

  if (rates.length === 0) {
    return NextResponse.json({
      data: {
        year,
        tableNumber,
        column,
        income,
        taxAmount: Math.round(income * 0.30 * 100) / 100,
        source: 'fallback_30pct',
      },
    })
  }

  const taxAmount = lookupTaxAmount(tableNumber, column, income, rates)

  return NextResponse.json({
    data: {
      year,
      tableNumber,
      column,
      income,
      taxAmount,
      source: 'tax_table',
    },
  })
}
