import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createMockRequest,
  parseJsonResponse,
  createQueuedMockSupabase,
  makeExtensionToggle,
} from '@/tests/helpers'

const { supabase: mockSupabase, enqueue, reset } = createQueuedMockSupabase()
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(mockSupabase),
}))

import { GET, POST } from '../route'

describe('GET /api/extensions/toggles', () => {
  const mockUser = { id: 'user-1', email: 'test@test.se' }

  beforeEach(() => {
    vi.clearAllMocks()
    reset()
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
  })

  it('returns 401 when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } })

    const response = await GET()
    const { status, body } = await parseJsonResponse(response)

    expect(status).toBe(401)
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('returns enabled toggles for user', async () => {
    const toggles = [
      makeExtensionToggle({ extension_slug: 'receipt-ocr' }),
      makeExtensionToggle({ extension_slug: 'ai-chat' }),
    ]
    enqueue({ data: toggles, error: null })

    const response = await GET()
    const { status, body } = await parseJsonResponse<{ data: unknown[] }>(response)

    expect(status).toBe(200)
    expect(body.data).toEqual(toggles)
    expect(mockSupabase.from).toHaveBeenCalledWith('extension_toggles')
  })
})

describe('POST /api/extensions/toggles', () => {
  const mockUser = { id: 'user-1', email: 'test@test.se' }

  beforeEach(() => {
    vi.clearAllMocks()
    reset()
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
  })

  it('returns 401 when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } })

    const request = createMockRequest('/api/extensions/toggles', {
      method: 'POST',
      body: { sector_slug: 'general', extension_slug: 'receipt-ocr', enabled: true },
    })
    const response = await POST(request)
    const { status, body } = await parseJsonResponse(response)

    expect(status).toBe(401)
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('returns 400 when missing fields', async () => {
    const request = createMockRequest('/api/extensions/toggles', {
      method: 'POST',
      body: { sector_slug: 'general' },
    })
    const response = await POST(request)
    const { status, body } = await parseJsonResponse<{ error: string }>(response)

    expect(status).toBe(400)
    expect(body.error).toBe('sector_slug, extension_slug, and enabled are required')
  })

  it('upserts toggle and returns data', async () => {
    const toggle = makeExtensionToggle({
      sector_slug: 'general',
      extension_slug: 'receipt-ocr',
      enabled: true,
    })
    enqueue({ data: toggle, error: null })

    const request = createMockRequest('/api/extensions/toggles', {
      method: 'POST',
      body: { sector_slug: 'general', extension_slug: 'receipt-ocr', enabled: true },
    })
    const response = await POST(request)
    const { status, body } = await parseJsonResponse<{ data: unknown }>(response)

    expect(status).toBe(200)
    expect(body.data).toEqual(toggle)
    expect(mockSupabase.from).toHaveBeenCalledWith('extension_toggles')
  })
})
