import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eventBus } from '@/lib/events/bus'
import { createMockSupabase } from '@/tests/helpers'

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('../lib/invoice-analyzer', () => ({
  analyzeInvoice: vi.fn(),
}))

vi.mock('../lib/supplier-matcher', () => ({
  matchSupplier: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { invoiceInboxExtension, getSettings, saveSettings } from '../index'

const mockCreateClient = vi.mocked(createClient)

describe('Invoice Inbox Extension', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventBus.clear()
  })

  describe('Extension metadata', () => {
    it('has correct id and version', () => {
      expect(invoiceInboxExtension.id).toBe('invoice-inbox')
      expect(invoiceInboxExtension.name).toBe('Invoice Inbox')
      expect(invoiceInboxExtension.version).toBe('1.0.0')
    })

    it('has event handler for document.uploaded', () => {
      expect(invoiceInboxExtension.eventHandlers).toHaveLength(1)
      expect(invoiceInboxExtension.eventHandlers![0].eventType).toBe('document.uploaded')
    })

    it('has settings panel', () => {
      expect(invoiceInboxExtension.settingsPanel).toEqual({
        label: 'Invoice Inbox',
        path: '/settings/extensions/invoice-inbox',
      })
    })

    it('has onInstall hook', () => {
      expect(invoiceInboxExtension.onInstall).toBeDefined()
    })
  })

  describe('getSettings', () => {
    it('returns default settings when no data exists', async () => {
      const { supabase, mockResult } = createMockSupabase()
      mockCreateClient.mockResolvedValue(supabase as never)
      mockResult({ data: null, error: null })

      const settings = await getSettings('user-1')

      expect(settings).toEqual({
        autoProcessEnabled: true,
        autoMatchSupplierEnabled: true,
        supplierMatchThreshold: 0.7,
        inboxEmail: null,
      })
    })

    it('merges stored settings with defaults', async () => {
      const { supabase, mockResult } = createMockSupabase()
      mockCreateClient.mockResolvedValue(supabase as never)
      mockResult({
        data: { value: { inboxEmail: 'test@inbox.example.com' } },
        error: null,
      })

      const settings = await getSettings('user-1')

      expect(settings.inboxEmail).toBe('test@inbox.example.com')
      expect(settings.autoProcessEnabled).toBe(true) // default
    })
  })

  describe('saveSettings', () => {
    it('merges partial settings with current', async () => {
      const { supabase, mockResult } = createMockSupabase()
      mockCreateClient.mockResolvedValue(supabase as never)

      // First call for getSettings (inside saveSettings)
      mockResult({ data: null, error: null })

      const settings = await saveSettings('user-1', { inboxEmail: 'new@inbox.com' })

      expect(settings.inboxEmail).toBe('new@inbox.com')
      expect(settings.autoProcessEnabled).toBe(true)
    })
  })
})
