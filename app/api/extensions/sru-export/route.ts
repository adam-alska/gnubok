import { NextResponse } from 'next/server'

/**
 * Legacy route — redirects to /api/reports/sru-export
 */
export async function GET(request: Request) {
  const { search } = new URL(request.url)
  return NextResponse.redirect(new URL(`/api/reports/sru-export${search}`, request.url), 308)
}
