import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateCsrfToken, buildAuthUrl, isOAuthProvider } from '../oauth'

beforeEach(() => {
  vi.stubEnv('FORTNOX_CLIENT_ID', 'test-fortnox-id')
  vi.stubEnv('FORTNOX_CLIENT_SECRET', 'test-fortnox-secret')
  vi.stubEnv('VISMA_CLIENT_ID', 'test-visma-id')
  vi.stubEnv('VISMA_CLIENT_SECRET', 'test-visma-secret')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com')
})

describe('oauth', () => {
  describe('generateCsrfToken', () => {
    it('generates a 64-character hex string', () => {
      const token = generateCsrfToken()
      expect(token).toMatch(/^[0-9a-f]{64}$/)
    })

    it('generates unique tokens', () => {
      const a = generateCsrfToken()
      const b = generateCsrfToken()
      expect(a).not.toBe(b)
    })
  })

  describe('buildAuthUrl', () => {
    it('builds Fortnox auth URL with correct params', () => {
      const url = buildAuthUrl('fortnox', 'test-state')
      expect(url).toContain('apps.fortnox.se/oauth-v1/auth')
      expect(url).toContain('client_id=test-fortnox-id')
      expect(url).toContain('state=test-state')
      expect(url).toContain('scope=bookkeeping+companyinformation')
      expect(url).toContain('redirect_uri=')
    })

    it('builds Visma auth URL with correct params', () => {
      const url = buildAuthUrl('visma', 'test-state')
      expect(url).toContain('identity.vismaonline.com/connect/authorize')
      expect(url).toContain('client_id=test-visma-id')
      expect(url).toContain('scope=ea')
      expect(url).toContain('offline_access')
    })

    it('includes callback redirect URI', () => {
      const url = buildAuthUrl('fortnox', 'state')
      expect(url).toContain(encodeURIComponent('https://app.example.com/api/connections/oauth/callback'))
    })
  })

  describe('isOAuthProvider', () => {
    it('returns true for fortnox', () => {
      expect(isOAuthProvider('fortnox')).toBe(true)
    })

    it('returns true for visma', () => {
      expect(isOAuthProvider('visma')).toBe(true)
    })

    it('returns false for briox', () => {
      expect(isOAuthProvider('briox')).toBe(false)
    })

    it('returns false for bokio', () => {
      expect(isOAuthProvider('bokio')).toBe(false)
    })

    it('returns false for bjorn_lunden', () => {
      expect(isOAuthProvider('bjorn_lunden')).toBe(false)
    })
  })
})
