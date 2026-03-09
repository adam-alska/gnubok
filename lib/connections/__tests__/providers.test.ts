import { describe, it, expect } from 'vitest'
import { getProvider, PROVIDERS } from '../providers'

describe('providers', () => {
  describe('PROVIDERS', () => {
    it('contains 5 providers', () => {
      expect(PROVIDERS).toHaveLength(5)
    })

    it('has unique IDs', () => {
      const ids = PROVIDERS.map((p) => p.id)
      expect(new Set(ids).size).toBe(ids.length)
    })
  })

  describe('getProvider', () => {
    it('returns Fortnox provider', () => {
      const p = getProvider('fortnox')
      expect(p).toBeDefined()
      expect(p!.name).toBe('Fortnox')
      expect(p!.authStrategy).toBe('oauth2')
    })

    it('returns Visma provider', () => {
      const p = getProvider('visma')
      expect(p).toBeDefined()
      expect(p!.name).toBe('Visma eEkonomi')
      expect(p!.authStrategy).toBe('oauth2')
    })

    it('returns Briox provider', () => {
      const p = getProvider('briox')
      expect(p).toBeDefined()
      expect(p!.authStrategy).toBe('application_token')
    })

    it('returns Bokio provider', () => {
      const p = getProvider('bokio')
      expect(p).toBeDefined()
      expect(p!.authStrategy).toBe('static_api_key')
    })

    it('returns Björn Lundén provider', () => {
      const p = getProvider('bjorn_lunden')
      expect(p).toBeDefined()
      expect(p!.authStrategy).toBe('client_credentials')
    })

    it('returns undefined for unknown provider', () => {
      expect(getProvider('unknown')).toBeUndefined()
    })
  })
})
