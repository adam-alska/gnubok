import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the tic-client functions
vi.mock('../lib/tic-client', () => ({
  searchCompanyByOrgNumber: vi.fn(),
  getBankAccounts: vi.fn(),
  getSNICodes: vi.fn(),
  getEmails: vi.fn(),
  getPhones: vi.fn(),
}))

import { ticExtension } from '../index'
import {
  searchCompanyByOrgNumber,
  getBankAccounts,
  getSNICodes,
  getEmails,
  getPhones,
} from '../lib/tic-client'
import type { TICCompanyDocument } from '../lib/tic-types'

const mockSearch = vi.mocked(searchCompanyByOrgNumber)
const mockBank = vi.mocked(getBankAccounts)
const mockSNI = vi.mocked(getSNICodes)
const mockEmails = vi.mocked(getEmails)
const mockPhones = vi.mocked(getPhones)

function makeRequest(orgNumber?: string): Request {
  const url = orgNumber
    ? `http://localhost/api/extensions/ext/tic/lookup?org_number=${encodeURIComponent(orgNumber)}`
    : 'http://localhost/api/extensions/ext/tic/lookup'
  return new Request(url)
}

const lookupHandler = ticExtension.apiRoutes![0].handler

const mockDoc: TICCompanyDocument = {
  companyId: 42,
  registrationNumber: '5560360793',
  names: [
    { nameOrIdentifier: 'Registered Name', companyNamingType: 'registeredName' },
    { nameOrIdentifier: 'Test AB', companyNamingType: 'name' },
  ],
  legalEntityType: 'AB',
  registrationDate: 0,
  mostRecentRegisteredAddress: {
    street: 'Storgatan 1',
    postalCode: '111 22',
    city: 'Stockholm',
  },
  isRegisteredForFTax: true,
  isRegisteredForVAT: true,
  activityStatus: 'active',
}

describe('TIC lookup route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when org_number is missing', async () => {
    const res = await lookupHandler(makeRequest())
    expect(res.status).toBe(400)
  })

  it('returns 404 when company not found', async () => {
    mockSearch.mockResolvedValue(null)

    const res = await lookupHandler(makeRequest('000000-0000'))
    expect(res.status).toBe(404)
  })

  it('returns full lookup result on happy path', async () => {
    mockSearch.mockResolvedValue(mockDoc)
    mockBank.mockResolvedValue([
      { bankAccountType: 1, accountNumber: '123-456', swift_BIC: undefined },
    ])
    mockSNI.mockResolvedValue([
      { sni_2007Code: '62010', sni_2007Name: 'Dataprogrammering' },
    ])
    mockEmails.mockResolvedValue([{ emailAddress: 'info@test.se' }])
    mockPhones.mockResolvedValue([{ phoneNumber: '08-1234567' }])

    const res = await lookupHandler(makeRequest('556036-0793'))
    expect(res.status).toBe(200)

    const { data } = await res.json()
    expect(data.companyName).toBe('Test AB')
    expect(data.isCeased).toBe(false)
    expect(data.address).toEqual({
      street: 'Storgatan 1',
      postalCode: '111 22',
      city: 'Stockholm',
    })
    expect(data.registration).toEqual({ fTax: true, vat: true })
    expect(data.bankAccounts).toEqual([
      { type: 'bankgiro', accountNumber: '123-456', bic: null },
    ])
    expect(data.sniCodes).toEqual([{ code: '62010', name: 'Dataprogrammering' }])
    expect(data.email).toBe('info@test.se')
    expect(data.phone).toBe('08-1234567')
  })

  it('prefers name type over other naming types', async () => {
    mockSearch.mockResolvedValue(mockDoc)
    mockBank.mockResolvedValue(null)
    mockSNI.mockResolvedValue(null)
    mockEmails.mockResolvedValue(null)
    mockPhones.mockResolvedValue(null)

    const res = await lookupHandler(makeRequest('556036-0793'))
    const { data } = await res.json()
    expect(data.companyName).toBe('Test AB')
  })

  it('handles partial Phase 2 failures gracefully', async () => {
    mockSearch.mockResolvedValue(mockDoc)
    mockBank.mockRejectedValue(new Error('timeout'))
    mockSNI.mockResolvedValue([{ sni_2007Code: '62010', sni_2007Name: 'Dataprogrammering' }])
    mockEmails.mockRejectedValue(new Error('timeout'))
    mockPhones.mockResolvedValue(null)

    const res = await lookupHandler(makeRequest('556036-0793'))
    expect(res.status).toBe(200)

    const { data } = await res.json()
    expect(data.companyName).toBe('Test AB')
    expect(data.bankAccounts).toEqual([])
    expect(data.sniCodes).toHaveLength(1)
    expect(data.email).toBeNull()
    expect(data.phone).toBeNull()
  })

  it('detects ceased companies', async () => {
    mockSearch.mockResolvedValue({ ...mockDoc, activityStatus: 'ceased' })
    mockBank.mockResolvedValue(null)
    mockSNI.mockResolvedValue(null)
    mockEmails.mockResolvedValue(null)
    mockPhones.mockResolvedValue(null)

    const res = await lookupHandler(makeRequest('556036-0793'))
    const { data } = await res.json()
    expect(data.isCeased).toBe(true)
  })
})
