import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRevenueAccount, getOutputVatAccount } from '../invoice-entries'
import type { Invoice, InvoiceItem, CreateJournalEntryInput } from '@/types'

// Mock the engine so we can capture the input passed to createJournalEntry
vi.mock('../engine', () => ({
  findFiscalPeriod: vi.fn().mockResolvedValue('period-1'),
  createJournalEntry: vi.fn().mockImplementation(
    async (_supabase: unknown, _userId: string, input: CreateJournalEntryInput) => ({
      id: 'entry-1',
      ...input,
      lines: input.lines,
    })
  ),
}))

// Mock vat-entries to avoid indirect dependency issues
vi.mock('../vat-entries', () => ({
  generateSalesVatLines: vi.fn().mockImplementation(({ vatTreatment, baseAmount }: { vatTreatment: string; baseAmount: number }) => {
    const rate = vatTreatment === 'standard_25' ? 0.25
      : vatTreatment === 'reduced_12' ? 0.12
      : vatTreatment === 'reduced_6' ? 0.06 : 0
    if (rate === 0) return []
    const account = vatTreatment === 'standard_25' ? '2611'
      : vatTreatment === 'reduced_12' ? '2621' : '2631'
    return [{
      account_number: account,
      debit_amount: 0,
      credit_amount: Math.round(baseAmount * rate * 100) / 100,
      line_description: `Utgående moms`,
    }]
  }),
  generateReverseChargeLines: vi.fn().mockReturnValue([]),
}))

const { createJournalEntry } = await import('../engine')
const mockedCreateEntry = vi.mocked(createJournalEntry)

// Import functions under test AFTER mocks are set up
const {
  createInvoiceJournalEntry,
  createCreditNoteJournalEntry,
  createInvoiceCashEntry,
} = await import('../invoice-entries')

// Helper to build a minimal Invoice with items
function makeInvoice(overrides: Partial<Invoice> & { items?: InvoiceItem[] }): Invoice {
  return {
    id: 'inv-1',
    user_id: 'user-1',
    customer_id: 'cust-1',
    invoice_number: '1001',
    invoice_date: '2024-06-15',
    due_date: '2024-07-15',
    currency: 'SEK',
    exchange_rate: null,
    exchange_rate_date: null,
    subtotal: 1000,
    subtotal_sek: null,
    vat_amount: 250,
    vat_amount_sek: null,
    total: 1250,
    total_sek: null,
    vat_treatment: 'standard_25',
    vat_rate: 25,
    moms_ruta: '05',
    reverse_charge_text: null,
    your_reference: null,
    our_reference: null,
    notes: null,
    status: 'sent',
    sent_at: null,
    paid_at: null,
    payment_date: null,
    credited_invoice_id: null,
    journal_entry_id: null,
    payment_journal_entry_id: null,
    document_type: 'invoice',
    created_at: '2024-06-15T00:00:00Z',
    updated_at: '2024-06-15T00:00:00Z',
    items: [],
    ...overrides,
  } as Invoice
}

function makeItem(overrides: Partial<InvoiceItem> = {}): InvoiceItem {
  return {
    id: 'item-1',
    invoice_id: 'inv-1',
    sort_order: 0,
    description: 'Service',
    quantity: 1,
    unit: 'st',
    unit_price: 1000,
    line_total: 1000,
    vat_rate: 25,
    vat_amount: 250,
    created_at: '2024-06-15T00:00:00Z',
    ...overrides,
  }
}

describe('getRevenueAccount', () => {
  it('standard_25 returns 3001', () => {
    expect(getRevenueAccount('standard_25')).toBe('3001')
  })

  it('reduced_12 returns 3002', () => {
    expect(getRevenueAccount('reduced_12')).toBe('3002')
  })

  it('reduced_6 returns 3003', () => {
    expect(getRevenueAccount('reduced_6')).toBe('3003')
  })

  it('reverse_charge returns 3308', () => {
    expect(getRevenueAccount('reverse_charge')).toBe('3308')
  })

  it('export returns 3305', () => {
    expect(getRevenueAccount('export')).toBe('3305')
  })

  it('exempt defaults to 3100 for enskild_firma', () => {
    expect(getRevenueAccount('exempt')).toBe('3100')
    expect(getRevenueAccount('exempt', 'enskild_firma')).toBe('3100')
  })

  it('exempt returns 3004 for aktiebolag', () => {
    expect(getRevenueAccount('exempt', 'aktiebolag')).toBe('3004')
  })

  it('entityType does not affect non-exempt treatments', () => {
    expect(getRevenueAccount('standard_25', 'aktiebolag')).toBe('3001')
    expect(getRevenueAccount('reduced_12', 'aktiebolag')).toBe('3002')
    expect(getRevenueAccount('export', 'aktiebolag')).toBe('3305')
  })
})

describe('getOutputVatAccount', () => {
  it('standard_25 returns 2611', () => {
    expect(getOutputVatAccount('standard_25')).toBe('2611')
  })

  it('reduced_12 returns 2621', () => {
    expect(getOutputVatAccount('reduced_12')).toBe('2621')
  })

  it('reduced_6 returns 2631', () => {
    expect(getOutputVatAccount('reduced_6')).toBe('2631')
  })
})

describe('createInvoiceJournalEntry — per-line VAT', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('single-rate invoice creates one revenue + one VAT line', async () => {
    const invoice = makeInvoice({
      subtotal: 1000,
      vat_amount: 250,
      total: 1250,
      vat_treatment: 'standard_25',
      items: [
        makeItem({ description: 'A', quantity: 2, unit_price: 300, line_total: 600, vat_rate: 25, vat_amount: 150 }),
        makeItem({ id: 'item-2', description: 'B', quantity: 1, unit_price: 400, line_total: 400, vat_rate: 25, vat_amount: 100 }),
      ],
    })

    await createInvoiceJournalEntry(null as never, 'user-1', invoice)

    expect(mockedCreateEntry).toHaveBeenCalledOnce()
    const input = mockedCreateEntry.mock.calls[0][2]

    // Should have 3 lines: 1510 debit, 3001 credit, 2611 credit
    expect(input.lines).toHaveLength(3)

    // Debit 1510 = total
    const debit1510 = input.lines.find((l) => l.account_number === '1510')
    expect(debit1510?.debit_amount).toBe(1250)
    expect(debit1510?.credit_amount).toBe(0)

    // Credit 3001 = subtotal
    const credit3001 = input.lines.find((l) => l.account_number === '3001')
    expect(credit3001?.debit_amount).toBe(0)
    expect(credit3001?.credit_amount).toBe(1000)

    // Credit 2611 = VAT
    const credit2611 = input.lines.find((l) => l.account_number === '2611')
    expect(credit2611?.debit_amount).toBe(0)
    expect(credit2611?.credit_amount).toBe(250)
  })

  it('mixed 25%/12% creates two revenue + two VAT lines', async () => {
    const invoice = makeInvoice({
      subtotal: 1000,
      vat_amount: 184, // 600*0.25 + 400*0.12 = 150 + 48 = 198... let's recalc
      total: 1198,
      vat_treatment: 'standard_25',
      vat_rate: null as unknown as number,
      items: [
        makeItem({ description: 'Consulting', quantity: 1, unit_price: 600, line_total: 600, vat_rate: 25, vat_amount: 150 }),
        makeItem({ id: 'item-2', description: 'Food service', quantity: 1, unit_price: 400, line_total: 400, vat_rate: 12, vat_amount: 48 }),
      ],
    })
    invoice.vat_amount = 198
    invoice.total = 1198

    await createInvoiceJournalEntry(null as never, 'user-1', invoice)

    expect(mockedCreateEntry).toHaveBeenCalledOnce()
    const input = mockedCreateEntry.mock.calls[0][2]

    // Should have 5 lines: 1510, 3001(25%), 2611(25%), 3002(12%), 2621(12%)
    expect(input.lines).toHaveLength(5)

    // Debit 1510 = total
    const debit1510 = input.lines.find((l) => l.account_number === '1510')
    expect(debit1510?.debit_amount).toBe(1198)

    // Revenue 3001 (25% group)
    const credit3001 = input.lines.find((l) => l.account_number === '3001')
    expect(credit3001?.credit_amount).toBe(600)

    // VAT 2611 (25% group)
    const credit2611 = input.lines.find((l) => l.account_number === '2611')
    expect(credit2611?.credit_amount).toBe(150)

    // Revenue 3002 (12% group)
    const credit3002 = input.lines.find((l) => l.account_number === '3002')
    expect(credit3002?.credit_amount).toBe(400)

    // VAT 2621 (12% group)
    const credit2621 = input.lines.find((l) => l.account_number === '2621')
    expect(credit2621?.credit_amount).toBe(48)
  })

  it('reverse charge creates single 3308, no VAT lines', async () => {
    const invoice = makeInvoice({
      subtotal: 5000,
      vat_amount: 0,
      total: 5000,
      vat_treatment: 'reverse_charge',
      vat_rate: 0,
      items: [
        makeItem({ quantity: 1, unit_price: 5000, line_total: 5000, vat_rate: 0, vat_amount: 0 }),
      ],
    })

    await createInvoiceJournalEntry(null as never, 'user-1', invoice)

    expect(mockedCreateEntry).toHaveBeenCalledOnce()
    const input = mockedCreateEntry.mock.calls[0][2]

    // Should have 2 lines: 1510 debit, 3308 credit (no VAT)
    expect(input.lines).toHaveLength(2)

    const debit1510 = input.lines.find((l) => l.account_number === '1510')
    expect(debit1510?.debit_amount).toBe(5000)

    const credit3308 = input.lines.find((l) => l.account_number === '3308')
    expect(credit3308?.credit_amount).toBe(5000)

    // No VAT lines
    const vatLines = input.lines.filter((l) =>
      l.account_number.startsWith('26')
    )
    expect(vatLines).toHaveLength(0)
  })

  it('balance: debit(1510) = sum(revenue + VAT credits)', async () => {
    const invoice = makeInvoice({
      subtotal: 2000,
      vat_amount: 380, // 1200*0.25 + 500*0.12 + 300*0.06 = 300 + 60 + 18 = 378
      total: 2378,
      vat_treatment: 'standard_25',
      vat_rate: null as unknown as number,
      items: [
        makeItem({ description: 'A', quantity: 1, unit_price: 1200, line_total: 1200, vat_rate: 25, vat_amount: 300 }),
        makeItem({ id: 'item-2', description: 'B', quantity: 1, unit_price: 500, line_total: 500, vat_rate: 12, vat_amount: 60 }),
        makeItem({ id: 'item-3', description: 'C', quantity: 1, unit_price: 300, line_total: 300, vat_rate: 6, vat_amount: 18 }),
      ],
    })
    invoice.vat_amount = 378
    invoice.total = 2378

    await createInvoiceJournalEntry(null as never, 'user-1', invoice)

    const input = mockedCreateEntry.mock.calls[0][2]

    const totalDebit = input.lines.reduce((sum, l) => sum + l.debit_amount, 0)
    const totalCredit = input.lines.reduce((sum, l) => sum + l.credit_amount, 0)

    expect(totalDebit).toBe(totalCredit)
    expect(totalDebit).toBe(2378)
  })
})

describe('createCreditNoteJournalEntry — per-line VAT', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reverses per-rate lines correctly for mixed rates', async () => {
    const creditNote = makeInvoice({
      invoice_number: 'KR-1001',
      subtotal: -1000,
      vat_amount: -198,
      total: -1198,
      vat_treatment: 'standard_25',
      items: [
        makeItem({ quantity: -1, unit_price: 600, line_total: -600, vat_rate: 25, vat_amount: -150 }),
        makeItem({ id: 'item-2', quantity: -1, unit_price: 400, line_total: -400, vat_rate: 12, vat_amount: -48 }),
      ],
    })

    await createCreditNoteJournalEntry(null as never, 'user-1', creditNote)

    expect(mockedCreateEntry).toHaveBeenCalledOnce()
    const input = mockedCreateEntry.mock.calls[0][2]

    // Revenue and VAT lines should be debits (reversed)
    const debit3001 = input.lines.find((l) => l.account_number === '3001')
    expect(debit3001?.debit_amount).toBe(600)
    expect(debit3001?.credit_amount).toBe(0)

    const debit2611 = input.lines.find((l) => l.account_number === '2611')
    expect(debit2611?.debit_amount).toBe(150)

    const debit3002 = input.lines.find((l) => l.account_number === '3002')
    expect(debit3002?.debit_amount).toBe(400)

    const debit2621 = input.lines.find((l) => l.account_number === '2621')
    expect(debit2621?.debit_amount).toBe(48)

    // 1510 should be credit
    const credit1510 = input.lines.find((l) => l.account_number === '1510')
    expect(credit1510?.credit_amount).toBe(1198)
    expect(credit1510?.debit_amount).toBe(0)

    // Balance check
    const totalDebit = input.lines.reduce((sum, l) => sum + l.debit_amount, 0)
    const totalCredit = input.lines.reduce((sum, l) => sum + l.credit_amount, 0)
    expect(totalDebit).toBe(totalCredit)
  })
})

describe('createInvoiceCashEntry — per-line VAT', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('cash method with mixed rates creates per-rate revenue + VAT', async () => {
    const invoice = makeInvoice({
      subtotal: 1000,
      vat_amount: 198,
      total: 1198,
      vat_treatment: 'standard_25',
      items: [
        makeItem({ quantity: 1, unit_price: 600, line_total: 600, vat_rate: 25, vat_amount: 150 }),
        makeItem({ id: 'item-2', quantity: 1, unit_price: 400, line_total: 400, vat_rate: 12, vat_amount: 48 }),
      ],
    })

    await createInvoiceCashEntry(null as never, 'user-1', invoice, '2024-07-01')

    expect(mockedCreateEntry).toHaveBeenCalledOnce()
    const input = mockedCreateEntry.mock.calls[0][2]

    // Debit 1930 (bank account) instead of 1510
    const debit1930 = input.lines.find((l) => l.account_number === '1930')
    expect(debit1930?.debit_amount).toBe(1198)

    // Same per-rate credits as accrual
    const credit3001 = input.lines.find((l) => l.account_number === '3001')
    expect(credit3001?.credit_amount).toBe(600)

    const credit2611 = input.lines.find((l) => l.account_number === '2611')
    expect(credit2611?.credit_amount).toBe(150)

    const credit3002 = input.lines.find((l) => l.account_number === '3002')
    expect(credit3002?.credit_amount).toBe(400)

    // Balance
    const totalDebit = input.lines.reduce((sum, l) => sum + l.debit_amount, 0)
    const totalCredit = input.lines.reduce((sum, l) => sum + l.credit_amount, 0)
    expect(totalDebit).toBe(totalCredit)
  })
})
