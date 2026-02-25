import { NextResponse } from 'next/server'

/**
 * Legacy route — redirects to /api/reports/sru-export/coverage
 */
export async function GET(request: Request) {
  return NextResponse.redirect(new URL('/api/reports/sru-export/coverage', request.url), 308)
}
