import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eventBus } from '@/lib/events/bus'
import { makeDocumentAttachment } from '@/tests/helpers'

// ============================================================
// Mock — separate client (no .then) from query builder (thenable)
// ============================================================

let resultIdx: number
let results: Array<{ data?: unknown; error?: unknown }>

function makeBuilder() {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'insert', 'update', 'delete', 'lte', 'gte', 'in', 'not', 'or', 'order', 'limit', 'is']) {
    b[m] = vi.fn().mockReturnValue(b)
  }
  b.single = vi.fn().mockImplementation(async () => results[resultIdx++] ?? { data: null, error: null })
  b.maybeSingle = vi.fn().mockImplementation(async () => results[resultIdx++] ?? { data: null, error: null })
  b.then = (resolve: (v: unknown) => void) => resolve(results[resultIdx++] ?? { data: null, error: null })
  return b
}

function makeClient(storageOverrides: Record<string, unknown> = {}) {
  return {
    from: vi.fn().mockImplementation(() => makeBuilder()),
    rpc: vi.fn().mockImplementation(async () => results[resultIdx++] ?? { data: null, error: null }),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
        download: vi.fn().mockResolvedValue({
          data: new Blob(['test content']),
          error: null,
        }),
        remove: vi.fn().mockResolvedValue({ data: [], error: null }),
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: 'https://example.com/file.pdf' },
        }),
        ...storageOverrides,
      }),
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => makeClient()),
}))

import { uploadDocument, createNewVersion, verifyIntegrity } from '../document-service'
import { createClient } from '@/lib/supabase/server'

beforeEach(() => {
  vi.clearAllMocks()
  eventBus.clear()
  resultIdx = 0
  results = []
  // Reset the mock to use default makeClient
  vi.mocked(createClient).mockImplementation(async () => makeClient() as never)
})

describe('uploadDocument', () => {
  it('computes SHA-256 hash, stores metadata, emits document.uploaded', async () => {
    const doc = makeDocumentAttachment({
      id: 'doc-1',
      file_name: 'test.pdf',
      sha256_hash: 'computed-hash',
    })

    results = [
      { data: doc, error: null }, // insert record
    ]

    const handler = vi.fn()
    eventBus.on('document.uploaded', handler)

    const buffer = new TextEncoder().encode('test content').buffer
    const result = await uploadDocument('user-1', {
      name: 'test.pdf',
      buffer: buffer as ArrayBuffer,
      type: 'application/pdf',
    })

    expect(result.id).toBe('doc-1')
    expect(result.file_name).toBe('test.pdf')
    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        document: expect.objectContaining({ id: 'doc-1' }),
        userId: 'user-1',
      })
    )
  })
})

describe('createNewVersion', () => {
  it('increments version and supersedes previous', async () => {
    const current = makeDocumentAttachment({
      id: 'doc-1',
      version: 1,
      is_current_version: true,
      original_id: null,
    })
    const newVersion = makeDocumentAttachment({
      id: 'doc-2',
      version: 2,
      is_current_version: true,
      original_id: 'doc-1',
    })

    results = [
      { data: current, error: null },     // fetch current
      { data: newVersion, error: null },   // insert new version
    ]

    const buffer = new TextEncoder().encode('new content').buffer
    const result = await createNewVersion('user-1', 'doc-1', {
      name: 'test-v2.pdf',
      buffer: buffer as ArrayBuffer,
      type: 'application/pdf',
    })

    expect(result.version).toBe(2)
    expect(result.original_id).toBe('doc-1')
    expect(result.is_current_version).toBe(true)
  })
})

describe('verifyIntegrity', () => {
  it('returns valid when hashes match', async () => {
    const content = 'test content for integrity check'
    const buffer = new TextEncoder().encode(content)
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const expectedHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')

    results = [
      { data: { storage_path: 'docs/test.pdf', sha256_hash: expectedHash }, error: null },
    ]

    // Override createClient to provide matching download content
    vi.mocked(createClient).mockImplementation(async () =>
      makeClient({
        download: vi.fn().mockResolvedValue({
          data: new Blob([content]),
          error: null,
        }),
      }) as never
    )

    const result = await verifyIntegrity('user-1', 'doc-1')
    expect(result.valid).toBe(true)
    expect(result.storedHash).toBe(expectedHash)
    expect(result.computedHash).toBe(expectedHash)
  })

  it('returns invalid when hashes do not match', async () => {
    results = [
      { data: { storage_path: 'docs/test.pdf', sha256_hash: 'stored-hash-abc' }, error: null },
    ]

    vi.mocked(createClient).mockImplementation(async () =>
      makeClient({
        download: vi.fn().mockResolvedValue({
          data: new Blob(['different content']),
          error: null,
        }),
      }) as never
    )

    const result = await verifyIntegrity('user-1', 'doc-1')
    expect(result.valid).toBe(false)
    expect(result.storedHash).toBe('stored-hash-abc')
    expect(result.computedHash).not.toBe('stored-hash-abc')
  })
})
