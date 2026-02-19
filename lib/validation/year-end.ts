import { z } from 'zod'

export const StartYearEndClosingSchema = z.object({
  fiscal_period_id: z.string().uuid(),
})

export const ToggleChecklistItemSchema = z.object({
  key: z.string().min(1),
  isCompleted: z.boolean(),
})

export const UpdateYearEndClosingSchema = z.object({
  status: z
    .enum(['not_started', 'checklist', 'adjustments', 'review', 'closing', 'completed'])
    .optional(),
  notes: z.string().optional(),
  result_account: z.string().optional(),
})

export const GenerateAnnualReportSchema = z.object({
  year_end_closing_id: z.string().uuid(),
})

export const UpdateAnnualReportSchema = z.object({
  management_report: z.string().optional(),
  notes_data: z.array(z.object({
    noteNumber: z.number(),
    title: z.string(),
    content: z.string(),
    type: z.enum(['accounting_principles', 'assets', 'equity', 'liabilities', 'other']),
  })).optional(),
  status: z.enum(['draft', 'review', 'approved', 'filed']).optional(),
  board_members: z.array(z.object({
    name: z.string(),
    role: z.enum(['ordforande', 'ledamot', 'suppleant', 'vd']),
    personalNumber: z.string().optional(),
  })).optional(),
  auditor_info: z.object({
    name: z.string(),
    firm: z.string(),
    memberNumber: z.string().optional(),
  }).nullable().optional(),
  filing_reference: z.string().optional(),
})
