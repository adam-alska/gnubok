import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getQuestionsForSector } from '@/lib/onboarding/sector-questions'

export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const sectorSlug = searchParams.get('sector')

  if (!sectorSlug) {
    return NextResponse.json(
      { error: 'Missing sector parameter' },
      { status: 400 }
    )
  }

  const questionSet = getQuestionsForSector(sectorSlug)

  if (!questionSet) {
    // Return empty questions for sectors without specific questions
    return NextResponse.json({
      data: {
        sectorSlug,
        sectorName: sectorSlug,
        questions: [],
      },
    })
  }

  return NextResponse.json({ data: questionSet })
}
