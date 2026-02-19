'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/components/ui/use-toast'
import { EmployeeForm } from '@/components/payroll/EmployeeForm'
import { EmployeeSalaryHistory } from '@/components/payroll/EmployeeSalaryHistory'
import { AbsenceCalendar } from '@/components/payroll/AbsenceCalendar'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Pencil, ArrowLeft, User, Briefcase, Banknote, Calendar } from 'lucide-react'
import type { Employee } from '@/types/payroll'
import { EMPLOYMENT_TYPE_LABELS } from '@/types/payroll'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ABSENCE_TYPE_LABELS } from '@/types/payroll'
import type { AbsenceType } from '@/types/payroll'

export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showEditForm, setShowEditForm] = useState(false)
  const [showAbsenceForm, setShowAbsenceForm] = useState(false)
  const [absenceForm, setAbsenceForm] = useState({
    absence_type: 'vacation' as AbsenceType,
    start_date: '',
    end_date: '',
    days_count: 1,
    notes: '',
  })
  const [isSubmittingAbsence, setIsSubmittingAbsence] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchEmployee()
  }, [id])

  async function fetchEmployee() {
    setIsLoading(true)
    const res = await fetch(`/api/employees/${id}`)
    const data = await res.json()

    if (res.ok) {
      setEmployee(data.data)
    } else {
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta anställd',
        variant: 'destructive',
      })
    }
    setIsLoading(false)
  }

  async function submitAbsence() {
    if (!employee) return
    setIsSubmittingAbsence(true)
    try {
      const res = await fetch('/api/absence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employee.id,
          absence_type: absenceForm.absence_type,
          start_date: absenceForm.start_date,
          end_date: absenceForm.end_date,
          days_count: absenceForm.days_count,
          notes: absenceForm.notes || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Kunde inte registrera frånvaro')
      }

      toast({ title: 'Frånvaro registrerad' })
      setShowAbsenceForm(false)
      setAbsenceForm({
        absence_type: 'vacation',
        start_date: '',
        end_date: '',
        days_count: 1,
        notes: '',
      })
    } catch (err) {
      toast({
        title: 'Fel',
        description: err instanceof Error ? err.message : 'Något gick fel',
        variant: 'destructive',
      })
    } finally {
      setIsSubmittingAbsence(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-4 bg-muted rounded w-96" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    )
  }

  if (!employee) {
    return (
      <div className="space-y-6">
        <p>Anställd hittades inte</p>
        <Link href="/payroll/employees">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Tillbaka
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/payroll/employees">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Tillbaka
          </Button>
        </Link>
      </div>

      <PageHeader
        title={`${employee.first_name} ${employee.last_name}`}
        description={`${EMPLOYMENT_TYPE_LABELS[employee.employment_type]} ${employee.title ? `- ${employee.title}` : ''}`}
        action={
          <Button onClick={() => setShowEditForm(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Redigera
          </Button>
        }
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Översikt</TabsTrigger>
          <TabsTrigger value="salary">Lönehistorik</TabsTrigger>
          <TabsTrigger value="absence">Frånvaro</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Personal info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Personuppgifter
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="Anställningsnr" value={employee.employee_number} />
                <InfoRow label="Personnummer" value={employee.personal_number ? `${employee.personal_number.substring(0, 8)}-****` : '-'} />
                <InfoRow label="E-post" value={employee.email || '-'} />
                <InfoRow label="Telefon" value={employee.phone || '-'} />
                <InfoRow
                  label="Adress"
                  value={
                    [employee.address_line1, employee.postal_code, employee.city]
                      .filter(Boolean)
                      .join(', ') || '-'
                  }
                />
              </CardContent>
            </Card>

            {/* Employment info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Anställning
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow
                  label="Anställningsform"
                  value={EMPLOYMENT_TYPE_LABELS[employee.employment_type]}
                />
                <InfoRow label="Avdelning" value={employee.department || '-'} />
                <InfoRow label="Titel" value={employee.title || '-'} />
                <InfoRow label="Startdatum" value={formatDate(employee.employment_start_date)} />
                <InfoRow
                  label="Slutdatum"
                  value={employee.employment_end_date ? formatDate(employee.employment_end_date) : 'Tillsvidare'}
                />
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={employee.is_active ? 'default' : 'secondary'}>
                    {employee.is_active ? 'Aktiv' : 'Inaktiv'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Salary info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Banknote className="h-4 w-4" />
                  Lön & Skatt
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="Månadslön" value={formatCurrency(employee.monthly_salary)} />
                <InfoRow label="Timlön" value={employee.hourly_rate > 0 ? formatCurrency(employee.hourly_rate) : '-'} />
                <InfoRow label="Skattetabell" value={employee.tax_table ? `Tabell ${employee.tax_table}` : '-'} />
                <InfoRow label="Kolumn" value={employee.tax_column ? `${employee.tax_column}` : '-'} />
                <InfoRow label="Kommun" value={employee.tax_municipality || '-'} />
              </CardContent>
            </Card>

            {/* Vacation & Bank */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Semester & Bank
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow
                  label="Semesterdagar"
                  value={`${employee.vacation_days_used} / ${employee.vacation_days_total} använda`}
                />
                <InfoRow
                  label="Kvar"
                  value={`${employee.vacation_days_total - employee.vacation_days_used} dagar`}
                />
                <InfoRow label="Clearing" value={employee.bank_clearing || '-'} />
                <InfoRow label="Kontonummer" value={employee.bank_account || '-'} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="salary" className="space-y-6">
          <EmployeeSalaryHistory employeeId={id} />
        </TabsContent>

        <TabsContent value="absence" className="space-y-6">
          <AbsenceCalendar
            employeeId={id}
            onAddAbsence={() => setShowAbsenceForm(true)}
          />
        </TabsContent>
      </Tabs>

      {/* Edit form */}
      <EmployeeForm
        open={showEditForm}
        onOpenChange={setShowEditForm}
        employee={employee}
        onSaved={fetchEmployee}
      />

      {/* Add absence dialog */}
      <Dialog open={showAbsenceForm} onOpenChange={setShowAbsenceForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrera frånvaro</DialogTitle>
            <DialogDescription>
              Lägg till frånvaro för {employee.first_name} {employee.last_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Frånvarotyp</Label>
              <Select
                value={absenceForm.absence_type}
                onValueChange={(value) => setAbsenceForm(prev => ({ ...prev, absence_type: value as AbsenceType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ABSENCE_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Startdatum</Label>
                <Input
                  type="date"
                  value={absenceForm.start_date}
                  onChange={(e) => setAbsenceForm(prev => ({ ...prev, start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Slutdatum</Label>
                <Input
                  type="date"
                  value={absenceForm.end_date}
                  onChange={(e) => setAbsenceForm(prev => ({ ...prev, end_date: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Antal dagar</Label>
              <Input
                type="number"
                min={0.5}
                step={0.5}
                value={absenceForm.days_count}
                onChange={(e) => setAbsenceForm(prev => ({ ...prev, days_count: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Anteckning</Label>
              <Input
                value={absenceForm.notes}
                onChange={(e) => setAbsenceForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Valfritt"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAbsenceForm(false)}>
              Avbryt
            </Button>
            <Button onClick={submitAbsence} disabled={isSubmittingAbsence || !absenceForm.start_date || !absenceForm.end_date}>
              {isSubmittingAbsence ? 'Sparar...' : 'Registrera'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}
