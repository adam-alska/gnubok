'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { EMPLOYMENT_TYPE_LABELS } from '@/types/payroll'
import type { Employee, EmploymentType } from '@/types/payroll'

interface EmployeeFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee?: Employee | null
  onSaved: () => void
}

export function EmployeeForm({ open, onOpenChange, employee, onSaved }: EmployeeFormProps) {
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [form, setForm] = useState({
    employee_number: employee?.employee_number || '',
    first_name: employee?.first_name || '',
    last_name: employee?.last_name || '',
    personal_number: employee?.personal_number || '',
    email: employee?.email || '',
    phone: employee?.phone || '',
    address_line1: employee?.address_line1 || '',
    postal_code: employee?.postal_code || '',
    city: employee?.city || '',
    employment_type: (employee?.employment_type || 'permanent') as EmploymentType,
    employment_start_date: employee?.employment_start_date || new Date().toISOString().split('T')[0],
    employment_end_date: employee?.employment_end_date || '',
    department: employee?.department || '',
    title: employee?.title || '',
    monthly_salary: employee?.monthly_salary || 0,
    hourly_rate: employee?.hourly_rate || 0,
    tax_table: employee?.tax_table || 33,
    tax_column: employee?.tax_column || 1,
    tax_municipality: employee?.tax_municipality || '',
    bank_clearing: employee?.bank_clearing || '',
    bank_account: employee?.bank_account || '',
    vacation_days_total: employee?.vacation_days_total ?? 25,
  })

  function updateField(field: string, value: string | number) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const url = employee ? `/api/employees/${employee.id}` : '/api/employees'
      const method = employee ? 'PATCH' : 'POST'

      const body: Record<string, unknown> = {
        ...form,
        monthly_salary: Number(form.monthly_salary) || 0,
        hourly_rate: Number(form.hourly_rate) || 0,
        tax_table: Number(form.tax_table) || undefined,
        tax_column: Number(form.tax_column) || undefined,
        vacation_days_total: Number(form.vacation_days_total),
      }

      // Remove empty optional fields
      if (!body.personal_number) delete body.personal_number
      if (!body.email) delete body.email
      if (!body.phone) delete body.phone
      if (!body.employment_end_date) delete body.employment_end_date
      if (!body.department) delete body.department
      if (!body.title) delete body.title
      if (!body.tax_municipality) delete body.tax_municipality
      if (!body.bank_clearing) delete body.bank_clearing
      if (!body.bank_account) delete body.bank_account

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Något gick fel')
      }

      toast({
        title: employee ? 'Anställd uppdaterad' : 'Anställd skapad',
        description: `${form.first_name} ${form.last_name} har sparats.`,
      })

      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast({
        title: 'Fel',
        description: err instanceof Error ? err.message : 'Kunde inte spara',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{employee ? 'Redigera anställd' : 'Ny anställd'}</DialogTitle>
          <DialogDescription>
            {employee ? 'Uppdatera uppgifter för den anställde.' : 'Lägg till en ny anställd i personalregistret.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Personal Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Personuppgifter</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="employee_number">Anstallningsnummer *</Label>
                <Input
                  id="employee_number"
                  value={form.employee_number}
                  onChange={(e) => updateField('employee_number', e.target.value)}
                  placeholder="001"
                  required
                  disabled={!!employee}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="personal_number">Personnummer</Label>
                <Input
                  id="personal_number"
                  value={form.personal_number}
                  onChange={(e) => updateField('personal_number', e.target.value)}
                  placeholder="YYYYMMDD-XXXX"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">Fornamn *</Label>
                <Input
                  id="first_name"
                  value={form.first_name}
                  onChange={(e) => updateField('first_name', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Efternamn *</Label>
                <Input
                  id="last_name"
                  value={form.last_name}
                  onChange={(e) => updateField('last_name', e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-post</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefon</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2 col-span-1">
                <Label htmlFor="address_line1">Adress</Label>
                <Input
                  id="address_line1"
                  value={form.address_line1}
                  onChange={(e) => updateField('address_line1', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="postal_code">Postnummer</Label>
                <Input
                  id="postal_code"
                  value={form.postal_code}
                  onChange={(e) => updateField('postal_code', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">Ort</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => updateField('city', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Employment Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Anstallning</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="employment_type">Anstallningsform *</Label>
                <Select
                  value={form.employment_type}
                  onValueChange={(value) => updateField('employment_type', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">Avdelning</Label>
                <Input
                  id="department"
                  value={form.department}
                  onChange={(e) => updateField('department', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="employment_start_date">Startdatum *</Label>
                <Input
                  id="employment_start_date"
                  type="date"
                  value={form.employment_start_date}
                  onChange={(e) => updateField('employment_start_date', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employment_end_date">Slutdatum</Label>
                <Input
                  id="employment_end_date"
                  type="date"
                  value={form.employment_end_date}
                  onChange={(e) => updateField('employment_end_date', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Titel</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(e) => updateField('title', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Salary Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Lon & Skatt</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="monthly_salary">Manadslon (SEK)</Label>
                <Input
                  id="monthly_salary"
                  type="number"
                  value={form.monthly_salary}
                  onChange={(e) => updateField('monthly_salary', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hourly_rate">Timlon (SEK)</Label>
                <Input
                  id="hourly_rate"
                  type="number"
                  value={form.hourly_rate}
                  onChange={(e) => updateField('hourly_rate', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tax_table">Skattetabell</Label>
                <Input
                  id="tax_table"
                  type="number"
                  min={29}
                  max={40}
                  value={form.tax_table}
                  onChange={(e) => updateField('tax_table', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax_column">Kolumn</Label>
                <Input
                  id="tax_column"
                  type="number"
                  min={1}
                  max={6}
                  value={form.tax_column}
                  onChange={(e) => updateField('tax_column', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax_municipality">Kommun</Label>
                <Input
                  id="tax_municipality"
                  value={form.tax_municipality}
                  onChange={(e) => updateField('tax_municipality', e.target.value)}
                  placeholder="Stockholm"
                />
              </div>
            </div>
          </div>

          {/* Bank & Vacation */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Bank & Semester</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bank_clearing">Clearingnummer</Label>
                <Input
                  id="bank_clearing"
                  value={form.bank_clearing}
                  onChange={(e) => updateField('bank_clearing', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank_account">Kontonummer</Label>
                <Input
                  id="bank_account"
                  value={form.bank_account}
                  onChange={(e) => updateField('bank_account', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vacation_days_total">Semesterdagar</Label>
                <Input
                  id="vacation_days_total"
                  type="number"
                  min={0}
                  max={50}
                  value={form.vacation_days_total}
                  onChange={(e) => updateField('vacation_days_total', e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Sparar...' : employee ? 'Uppdatera' : 'Skapa anstalld'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
