import { describe, it, expect } from 'vitest'
import {
  calculateRotDeduction,
  calculateCustomerQuotas,
  filterJobsByYear,
  generateRotCsvContent,
  MAX_ROT_YEARLY,
  ROT_RATE,
  type RotJob,
} from '../rot-calculator'

describe('calculateRotDeduction', () => {
  it('calculates 30% of labor as ROT deduction', () => {
    const result = calculateRotDeduction(100000, 40000, 0)

    // Labor = 100000 - 40000 = 60000
    // ROT = 60000 * 0.30 = 18000
    expect(result.labor).toBe(60000)
    expect(result.rotDeduction).toBe(18000)
    expect(result.customerPays).toBe(82000)
    expect(result.remainingQuota).toBe(MAX_ROT_YEARLY - 18000)
  })

  it('caps ROT deduction at remaining yearly quota', () => {
    // Customer has already used 45000 of 50000 quota
    const result = calculateRotDeduction(100000, 40000, 45000)

    // Labor = 60000, raw ROT = 18000, but only 5000 remaining
    expect(result.rotDeduction).toBe(5000)
    expect(result.customerPays).toBe(95000)
    expect(result.remainingQuota).toBe(0)
  })

  it('returns zero deduction when labor is zero (material equals total)', () => {
    const result = calculateRotDeduction(50000, 50000, 0)

    expect(result.labor).toBe(0)
    expect(result.rotDeduction).toBe(0)
    expect(result.customerPays).toBe(50000)
    expect(result.remainingQuota).toBe(MAX_ROT_YEARLY)
  })

  it('returns zero deduction when quota is already exhausted', () => {
    const result = calculateRotDeduction(80000, 30000, MAX_ROT_YEARLY)

    expect(result.labor).toBe(50000)
    expect(result.rotDeduction).toBe(0)
    expect(result.customerPays).toBe(80000)
    expect(result.remainingQuota).toBe(0)
  })

  it('calculates customerPays as total minus rotDeduction', () => {
    const result = calculateRotDeduction(75000, 25000, 0)

    // Labor = 50000, ROT = 15000
    expect(result.customerPays).toBe(75000 - result.rotDeduction)
    expect(result.customerPays).toBe(60000)
  })

  it('handles monetary rounding correctly', () => {
    // total=10001, material=3333 -> labor=6668
    // ROT = 6668 * 0.30 = 2000.4
    const result = calculateRotDeduction(10001, 3333, 0)

    expect(result.labor).toBe(6668)
    expect(result.rotDeduction).toBe(2000.4)
    expect(result.customerPays).toBe(8000.6)
    expect(result.remainingQuota).toBe(Math.round((MAX_ROT_YEARLY - 2000.4) * 100) / 100)
  })
})

describe('calculateCustomerQuotas', () => {
  const baseJob: RotJob = {
    id: 'job-1',
    customerId: 'cust-1',
    total: 100000,
    material: 40000,
    labor: 60000,
    rotDeduction: 18000,
    date: '2025-03-15',
    status: 'completed',
  }

  it('calculates used quota from completed jobs for a customer', () => {
    const jobs: RotJob[] = [
      { ...baseJob, id: 'job-1', rotDeduction: 10000 },
      { ...baseJob, id: 'job-2', rotDeduction: 15000 },
    ]

    const quotas = calculateCustomerQuotas(jobs, 2025)

    expect(quotas.get('cust-1')).toBe(25000)
  })

  it('does not count draft jobs toward quota', () => {
    const jobs: RotJob[] = [
      { ...baseJob, id: 'job-1', rotDeduction: 10000, status: 'completed' },
      { ...baseJob, id: 'job-2', rotDeduction: 15000, status: 'draft' },
    ]

    const quotas = calculateCustomerQuotas(jobs, 2025)

    expect(quotas.get('cust-1')).toBe(10000)
  })

  it('tracks multiple customers with different quotas', () => {
    const jobs: RotJob[] = [
      { ...baseJob, id: 'job-1', customerId: 'cust-1', rotDeduction: 12000 },
      { ...baseJob, id: 'job-2', customerId: 'cust-2', rotDeduction: 8000 },
      { ...baseJob, id: 'job-3', customerId: 'cust-1', rotDeduction: 5000 },
    ]

    const quotas = calculateCustomerQuotas(jobs, 2025)

    expect(quotas.get('cust-1')).toBe(17000)
    expect(quotas.get('cust-2')).toBe(8000)
  })
})

describe('filterJobsByYear', () => {
  it('returns only jobs from the specified year', () => {
    const jobs: RotJob[] = [
      { id: '1', customerId: 'c1', total: 50000, material: 20000, labor: 30000, rotDeduction: 9000, date: '2025-06-01', status: 'completed' },
      { id: '2', customerId: 'c1', total: 60000, material: 25000, labor: 35000, rotDeduction: 10500, date: '2024-11-15', status: 'completed' },
      { id: '3', customerId: 'c1', total: 70000, material: 30000, labor: 40000, rotDeduction: 12000, date: '2025-12-31', status: 'completed' },
    ]

    const filtered = filterJobsByYear(jobs, 2025)

    expect(filtered).toHaveLength(2)
    expect(filtered.map(j => j.id)).toEqual(['1', '3'])
  })
})

describe('generateRotCsvContent', () => {
  it('generates CSV with correct columns for completed jobs only', () => {
    const jobs: RotJob[] = [
      { id: '1', customerId: 'c1', total: 80000, material: 30000, labor: 50000, rotDeduction: 15000, date: '2025-04-10', status: 'completed' },
      { id: '2', customerId: 'c2', total: 60000, material: 20000, labor: 40000, rotDeduction: 12000, date: '2025-05-20', status: 'draft' },
      { id: '3', customerId: 'c1', total: 40000, material: 15000, labor: 25000, rotDeduction: 7500, date: '2025-06-15', status: 'completed' },
    ]

    const customers = new Map([
      ['c1', { name: 'Anna Svensson', personalNumber: '198501011234' }],
      ['c2', { name: 'Erik Johansson', personalNumber: '199003025678' }],
    ])

    const csv = generateRotCsvContent(jobs, customers)
    const lines = csv.split('\n')

    expect(lines[0]).toBe('PersonalNumber,CustomerName,Labor,RotDeduction,Date')
    // Draft job (id=2) should be excluded
    expect(lines).toHaveLength(3)
    expect(lines[1]).toBe('198501011234,Anna Svensson,50000,15000,2025-04-10')
    expect(lines[2]).toBe('198501011234,Anna Svensson,25000,7500,2025-06-15')
  })
})

describe('constants', () => {
  it('has correct ROT rate and yearly maximum', () => {
    expect(ROT_RATE).toBe(0.30)
    expect(MAX_ROT_YEARLY).toBe(50000)
  })
})
