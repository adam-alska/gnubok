import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, parseJsonResponse } from '@/tests/helpers'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { GET } from '../route'

const mockCreateClient = vi.mocked(createClient)
const mockCreateServiceClient = vi.mocked(createServiceClient)

function mockAuth(user: { id: string } | null) {
  mockCreateClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

/**
 * Service-role mock. Returns a match only if the incoming `.eq('org_number', X)`
 * value matches `existing`. Anything else (or empty `existing`) returns null.
 */
function mockService(existing?: string) {
  let lastOrgNumber: string | null = null
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'is', 'limit', 'maybeSingle']
  for (const m of methods) {
    chain[m] = (...args: unknown[]) => {
      if (m === 'eq' && args[0] === 'org_number') {
        lastOrgNumber = String(args[1])
      }
      if (m === 'maybeSingle') {
        return Promise.resolve({
          data: existing && lastOrgNumber === existing ? { id: 'other' } : null,
          error: null,
        })
      }
      return chain
    }
  }
  mockCreateServiceClient.mockReturnValue({
    from: vi.fn().mockReturnValue(chain),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/company/check-org-number', () => {
  it('returns 401 when unauthenticated', async () => {
    mockAuth(null)
    mockService()
    const req = createMockRequest('/api/company/check-org-number?org_number=5566778899')
    const { status } = await parseJsonResponse(await GET(req))
    expect(status).toBe(401)
  })

  it('returns 400 when org_number is missing', async () => {
    mockAuth({ id: 'user-1' })
    mockService()
    const req = createMockRequest('/api/company/check-org-number')
    const { status } = await parseJsonResponse(await GET(req))
    expect(status).toBe(400)
  })

  it('returns exists=false when the org number is not registered', async () => {
    mockAuth({ id: 'user-1' })
    mockService(undefined) // no existing match
    const req = createMockRequest('/api/company/check-org-number?org_number=5566778899')
    const { status, body } = await parseJsonResponse(await GET(req))
    expect(status).toBe(200)
    expect((body as { data: { exists: boolean } }).data.exists).toBe(false)
  })

  it('returns exists=true when the org number is already registered', async () => {
    mockAuth({ id: 'user-1' })
    mockService('5566778899')
    const req = createMockRequest('/api/company/check-org-number?org_number=5566778899')
    const { status, body } = await parseJsonResponse(await GET(req))
    expect(status).toBe(200)
    expect((body as { data: { exists: boolean } }).data.exists).toBe(true)
  })

  it('normalizes formatted org numbers before lookup (strips hyphens/spaces)', async () => {
    mockAuth({ id: 'user-1' })
    mockService('5566778899')
    const req = createMockRequest('/api/company/check-org-number?org_number=556677-8899')
    const { status, body } = await parseJsonResponse(await GET(req))
    expect(status).toBe(200)
    expect((body as { data: { exists: boolean } }).data.exists).toBe(true)
  })
})
