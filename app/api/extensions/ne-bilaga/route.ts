import { NextResponse } from 'next/server'

/**
 * Legacy route — redirects to /api/reports/ne-bilaga
 */
export async function GET(request: Request) {
  const { search } = new URL(request.url)
  return NextResponse.redirect(new URL(`/api/reports/ne-bilaga${search}`, request.url), 308)
}
