/**
 * ROT (Repairs, Conversion, Extension) tax deduction calculator.
 *
 * ROT deduction allows Swedish homeowners to deduct 30% of labor costs
 * for home renovation work, up to SEK 50 000 per person per year.
 *
 * All monetary values use Math.round(x * 100) / 100 to avoid
 * floating-point precision issues.
 */

export const MAX_ROT_YEARLY = 50000
export const ROT_RATE = 0.30

export interface RotJob {
  id: string
  customerId: string
  total: number
  material: number
  labor: number
  rotDeduction: number
  date: string
  status: 'draft' | 'completed'
}

export interface RotCalculation {
  labor: number
  rotDeduction: number
  customerPays: number
  remainingQuota: number
}

export interface CustomerQuota {
  customerId: string
  usedQuota: number
  remainingQuota: number
}

/**
 * Calculate ROT deduction for a job given the customer's already-used quota.
 *
 * The deduction is 30% of labor (total - material), capped by the
 * remaining yearly quota (MAX_ROT_YEARLY - usedQuota).
 */
export function calculateRotDeduction(
  total: number,
  material: number,
  usedQuota: number
): RotCalculation {
  const labor = Math.round((total - material) * 100) / 100
  const remaining = Math.max(MAX_ROT_YEARLY - usedQuota, 0)
  const rawDeduction = Math.round(labor * ROT_RATE * 100) / 100
  const rotDeduction = Math.round(Math.min(rawDeduction, remaining) * 100) / 100
  const customerPays = Math.round((total - rotDeduction) * 100) / 100
  const remainingQuota = Math.round((remaining - rotDeduction) * 100) / 100

  return {
    labor,
    rotDeduction,
    customerPays,
    remainingQuota,
  }
}

/**
 * Calculate per-customer used quota for a given year.
 * Only completed jobs count toward the quota.
 */
export function calculateCustomerQuotas(
  jobs: RotJob[],
  year: number
): Map<string, number> {
  const yearJobs = filterJobsByYear(jobs, year).filter(
    j => j.status === 'completed'
  )

  const quotas = new Map<string, number>()

  for (const job of yearJobs) {
    const current = quotas.get(job.customerId) ?? 0
    quotas.set(
      job.customerId,
      Math.round((current + job.rotDeduction) * 100) / 100
    )
  }

  return quotas
}

/**
 * Filter jobs whose date falls within the specified year.
 */
export function filterJobsByYear(jobs: RotJob[], year: number): RotJob[] {
  const yearStr = String(year)
  return jobs.filter(j => j.date.startsWith(yearStr))
}

/**
 * Generate CSV content for Skatteverket ROT deduction reporting.
 * Only completed jobs are included.
 *
 * Columns: PersonalNumber, CustomerName, Labor, RotDeduction, Date
 */
export function generateRotCsvContent(
  jobs: RotJob[],
  customers: Map<string, { name: string; personalNumber: string }>
): string {
  const header = 'PersonalNumber,CustomerName,Labor,RotDeduction,Date'
  const completedJobs = jobs.filter(j => j.status === 'completed')

  const rows = completedJobs.map(job => {
    const customer = customers.get(job.customerId)
    const personalNumber = customer?.personalNumber ?? ''
    const customerName = customer?.name ?? ''
    return `${personalNumber},${customerName},${job.labor},${job.rotDeduction},${job.date}`
  })

  return [header, ...rows].join('\n')
}
