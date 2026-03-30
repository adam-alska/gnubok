import { describe, it, expect, vi } from 'vitest'

// Mock server-only
vi.mock('server-only', () => ({}))

import { parseInboundPayload, extractAttachments, resolveUserFromEmail } from '../email-handler'
import type { ResendInboundPayload } from '../../types'

describe('Email Handler', () => {
  describe('parseInboundPayload', () => {
    it('returns null for null input', () => {
      expect(parseInboundPayload(null)).toBeNull()
    })

    it('returns null for non-object input', () => {
      expect(parseInboundPayload('string')).toBeNull()
    })

    it('returns null when from is missing', () => {
      expect(parseInboundPayload({ to: 'test@example.com' })).toBeNull()
    })

    it('returns null when to is missing', () => {
      expect(parseInboundPayload({ from: 'test@example.com' })).toBeNull()
    })

    it('parses valid payload', () => {
      const result = parseInboundPayload({
        from: 'supplier@example.com',
        to: 'inbox@mycompany.com',
        subject: 'Faktura F-001',
        html: '<p>Attached</p>',
        text: 'Attached',
        attachments: [{ filename: 'invoice.pdf', content_type: 'application/pdf', content: 'base64data' }],
        created_at: '2024-06-15T10:00:00Z',
      })

      expect(result).not.toBeNull()
      expect(result!.from).toBe('supplier@example.com')
      expect(result!.to).toBe('inbox@mycompany.com')
      expect(result!.subject).toBe('Faktura F-001')
      expect(result!.attachments).toHaveLength(1)
    })

    it('handles missing optional fields', () => {
      const result = parseInboundPayload({
        from: 'a@b.com',
        to: 'c@d.com',
      })

      expect(result).not.toBeNull()
      expect(result!.subject).toBe('')
      expect(result!.html).toBeNull()
      expect(result!.text).toBeNull()
      expect(result!.attachments).toEqual([])
    })
  })

  describe('extractAttachments', () => {
    it('filters to supported file types only', () => {
      const payload: ResendInboundPayload = {
        from: 'a@b.com',
        to: 'c@d.com',
        subject: 'Test',
        html: null,
        text: null,
        created_at: '2024-06-15T10:00:00Z',
        attachments: [
          { filename: 'invoice.pdf', content_type: 'application/pdf', content: 'base64' },
          { filename: 'photo.jpg', content_type: 'image/jpeg', content: 'base64' },
          { filename: 'doc.docx', content_type: 'application/vnd.openxmlformats', content: 'base64' },
          { filename: 'sheet.xlsx', content_type: 'application/vnd.ms-excel', content: 'base64' },
          { filename: 'scan.png', content_type: 'image/png', content: 'base64' },
        ],
      }

      const result = extractAttachments(payload)
      expect(result).toHaveLength(3)
      expect(result.map(a => a.content_type)).toEqual([
        'application/pdf',
        'image/jpeg',
        'image/png',
      ])
    })

    it('filters out attachments without content', () => {
      const payload: ResendInboundPayload = {
        from: 'a@b.com',
        to: 'c@d.com',
        subject: 'Test',
        html: null,
        text: null,
        created_at: '2024-06-15T10:00:00Z',
        attachments: [
          { filename: 'invoice.pdf', content_type: 'application/pdf', content: '' },
          { filename: 'photo.jpg', content_type: 'image/jpeg', content: 'base64data' },
        ],
      }

      const result = extractAttachments(payload)
      expect(result).toHaveLength(1)
    })
  })

  describe('resolveUserFromEmail', () => {
    it('returns null when no extension data found', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
            }),
          }),
        }),
      }

      const result = await resolveUserFromEmail('test@inbox.com', mockClient)
      expect(result).toBeNull()
    })

    it('returns user_id when email matches', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  { user_id: 'user-1', company_id: 'company-1', value: { inboxEmail: 'test@inbox.com' } },
                  { user_id: 'user-2', company_id: 'company-2', value: { inboxEmail: 'other@inbox.com' } },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }

      const result = await resolveUserFromEmail('test@inbox.com', mockClient)
      expect(result).toEqual({ userId: 'user-1', companyId: 'company-1' })
    })

    it('handles case-insensitive email matching', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  { user_id: 'user-1', company_id: 'company-1', value: { inboxEmail: 'Test@Inbox.Com' } },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }

      const result = await resolveUserFromEmail('test@inbox.com', mockClient)
      expect(result).toEqual({ userId: 'user-1', companyId: 'company-1' })
    })

    it('returns null when no matching email', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  { user_id: 'user-1', value: { inboxEmail: 'other@inbox.com' } },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }

      const result = await resolveUserFromEmail('notfound@inbox.com', mockClient)
      expect(result).toBeNull()
    })
  })
})
