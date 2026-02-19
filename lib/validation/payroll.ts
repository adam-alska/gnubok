import { z } from 'zod'

// =============================================================================
// Employee Schemas
// =============================================================================

export const CreateEmployeeInputSchema = z.object({
  employee_number: z.string().min(1, 'Anställningsnummer krävs').max(20),
  first_name: z.string().min(1, 'Förnamn krävs').max(100),
  last_name: z.string().min(1, 'Efternamn krävs').max(100),
  personal_number: z.string().max(13).optional(),
  email: z.string().email('Ogiltig e-postadress').max(254).optional(),
  phone: z.string().max(30).optional(),
  address_line1: z.string().max(200).optional(),
  postal_code: z.string().max(10).optional(),
  city: z.string().max(100).optional(),
  employment_type: z.enum(['permanent', 'temporary', 'hourly', 'intern']),
  employment_start_date: z.string().min(1, 'Startdatum krävs'),
  employment_end_date: z.string().optional(),
  department: z.string().max(100).optional(),
  title: z.string().max(100).optional(),
  monthly_salary: z.number().min(0).optional(),
  hourly_rate: z.number().min(0).optional(),
  tax_table: z.number().int().min(29).max(40).optional(),
  tax_column: z.number().int().min(1).max(6).optional(),
  tax_municipality: z.string().max(100).optional(),
  bank_clearing: z.string().max(10).optional(),
  bank_account: z.string().max(20).optional(),
  vacation_days_total: z.number().int().min(0).max(50).optional(),
})

export const UpdateEmployeeInputSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  personal_number: z.string().max(13).nullish(),
  email: z.string().email().max(254).nullish(),
  phone: z.string().max(30).nullish(),
  address_line1: z.string().max(200).nullish(),
  postal_code: z.string().max(10).nullish(),
  city: z.string().max(100).nullish(),
  employment_type: z.enum(['permanent', 'temporary', 'hourly', 'intern']).optional(),
  employment_start_date: z.string().optional(),
  employment_end_date: z.string().nullish(),
  department: z.string().max(100).nullish(),
  title: z.string().max(100).nullish(),
  monthly_salary: z.number().min(0).optional(),
  hourly_rate: z.number().min(0).optional(),
  tax_table: z.number().int().min(29).max(40).nullish(),
  tax_column: z.number().int().min(1).max(6).nullish(),
  tax_municipality: z.string().max(100).nullish(),
  bank_clearing: z.string().max(10).nullish(),
  bank_account: z.string().max(20).nullish(),
  vacation_days_total: z.number().int().min(0).max(50).optional(),
  vacation_days_used: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
})

// =============================================================================
// Salary Run Schemas
// =============================================================================

export const CreateSalaryRunInputSchema = z.object({
  run_name: z.string().min(1, 'Namn krävs').max(200),
  period_year: z.number().int().min(2020).max(2100),
  period_month: z.number().int().min(1).max(12),
  payment_date: z.string().min(1, 'Utbetalningsdatum krävs'),
  notes: z.string().max(2000).optional(),
})

export const UpdateSalaryRunInputSchema = z.object({
  run_name: z.string().min(1).max(200).optional(),
  payment_date: z.string().optional(),
  notes: z.string().max(2000).nullish(),
  status: z.enum(['draft', 'calculated', 'approved', 'paid', 'reported']).optional(),
})

export const AddSalaryRunItemSchema = z.object({
  employee_id: z.string().uuid(),
  salary_type: z.enum(['monthly', 'hourly', 'bonus', 'commission', 'vacation_payout']).optional(),
  hours_worked: z.number().min(0).optional(),
  overtime_hours: z.number().min(0).optional(),
  overtime_rate: z.number().min(0).optional(),
  deductions: z.array(z.object({
    type: z.string(),
    amount: z.number(),
    description: z.string(),
  })).optional(),
  additions: z.array(z.object({
    type: z.string(),
    amount: z.number(),
    description: z.string(),
  })).optional(),
  is_tax_free: z.boolean().optional(),
  notes: z.string().max(500).optional(),
})

export const UpdateSalaryRunItemSchema = z.object({
  salary_type: z.enum(['monthly', 'hourly', 'bonus', 'commission', 'vacation_payout']).optional(),
  hours_worked: z.number().min(0).optional(),
  overtime_hours: z.number().min(0).optional(),
  overtime_rate: z.number().min(0).optional(),
  deductions: z.array(z.object({
    type: z.string(),
    amount: z.number(),
    description: z.string(),
  })).optional(),
  additions: z.array(z.object({
    type: z.string(),
    amount: z.number(),
    description: z.string(),
  })).optional(),
  is_tax_free: z.boolean().optional(),
  notes: z.string().max(500).nullish(),
})

// =============================================================================
// Absence Schemas
// =============================================================================

export const CreateAbsenceInputSchema = z.object({
  employee_id: z.string().uuid(),
  absence_type: z.enum(['sick_leave', 'parental_leave', 'vacation', 'child_care', 'unpaid_leave', 'other']),
  start_date: z.string().min(1, 'Startdatum krävs'),
  end_date: z.string().min(1, 'Slutdatum krävs'),
  days_count: z.number().min(0.5, 'Antal dagar måste vara minst 0.5'),
  hours_per_day: z.number().min(1).max(24).optional(),
  deduction_percentage: z.number().min(0).max(100).optional(),
  notes: z.string().max(1000).optional(),
})

export const UpdateAbsenceInputSchema = z.object({
  absence_type: z.enum(['sick_leave', 'parental_leave', 'vacation', 'child_care', 'unpaid_leave', 'other']).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  days_count: z.number().min(0.5).optional(),
  hours_per_day: z.number().min(1).max(24).optional(),
  deduction_percentage: z.number().min(0).max(100).optional(),
  notes: z.string().max(1000).nullish(),
  approved: z.boolean().optional(),
})

// =============================================================================
// AGI Schemas
// =============================================================================

export const GenerateAGIInputSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
})

export const UpdateAGIInputSchema = z.object({
  status: z.enum(['draft', 'submitted', 'confirmed']).optional(),
})
