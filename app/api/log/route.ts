import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { message, extra } = await request.json()

    // This console.error runs server-side → visible in Vercel Logs
    console.error('[onboarding]', message, extra ? JSON.stringify(extra) : '')

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
}
