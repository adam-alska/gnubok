'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/components/ui/use-toast'
import { SalaryRunTable } from '@/components/payroll/SalaryRunTable'
import { SalaryCalculationPreview } from '@/components/payroll/SalaryCalculationPreview'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  ArrowLeft,
  Calculator,
  CheckCircle,
  Banknote,
  UserPlus,
  Loader2,
} from 'lucide-react'
import type { SalaryRun, SalaryRunItem, Employee, SalaryRunCalculationResult } from '@/types/payroll'
import { SALARY_RUN_STATUS_LABELS, SWEDISH_MONTHS } from '@/types/payroll'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive'> = {
  draft: 'secondary',
  calculated: 'default',
  approved: 'default',
  paid: 'default',
  reported: 'default',
}

const statusSteps = [
  { key: 'draft', label: 'Utkast', step: 1 },
  { key: 'calculated', label: 'Beräknad', step: 2 },
  { key: 'approved', label: 'Godkänd', step: 3 },
  { key: 'paid', label: 'Utbetald', step: 4 },
  { key: 'reported', label: 'Rapporterad', step: 5 },
]

export default function SalaryRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [run, setRun] = useState<SalaryRun | null>(null)
  const [items, setItems] = useState<(SalaryRunItem & { employee: Employee })[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCalculating, setIsCalculating] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [isMarkingPaid, setIsMarkingPaid] = useState(false)
  const [calcResult, setCalcResult] = useState<SalaryRunCalculationResult | null>(null)
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  const [availableEmployees, setAvailableEmployees] = useState<Employee[]>([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [isAddingEmployee, setIsAddingEmployee] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchRun()
  }, [id])

  async function fetchRun() {
    setIsLoading(true)
    const res = await fetch(`/api/salary-runs/${id}`)
    const data = await res.json()

    if (res.ok) {
      setRun(data.data)
      setItems(data.data.items || [])
    } else {
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta lönekörning',
        variant: 'destructive',
      })
    }
    setIsLoading(false)
  }

  async function handleCalculate() {
    setIsCalculating(true)
    setCalcResult(null)
    try {
      const res = await fetch(`/api/salary-runs/${id}/calculate`, { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Beräkning misslyckades')
      }

      setCalcResult(data.data)
      toast({ title: 'Beräkning klar', description: 'Alla löner har beräknats' })
      fetchRun() // Refresh to get updated items
    } catch (err) {
      toast({
        title: 'Fel',
        description: err instanceof Error ? err.message : 'Något gick fel',
        variant: 'destructive',
      })
    } finally {
      setIsCalculating(false)
    }
  }

  async function handleApprove() {
    setIsApproving(true)
    try {
      const res = await fetch(`/api/salary-runs/${id}/approve`, { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Godkännande misslyckades')
      }

      toast({
        title: 'Lönekörning godkänd',
        description: 'Verifikation har skapats i bokföringen',
      })
      fetchRun()
    } catch (err) {
      toast({
        title: 'Fel',
        description: err instanceof Error ? err.message : 'Något gick fel',
        variant: 'destructive',
      })
    } finally {
      setIsApproving(false)
    }
  }

  async function handleMarkPaid() {
    setIsMarkingPaid(true)
    try {
      const res = await fetch(`/api/salary-runs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paid' }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Kunde inte markera som utbetald')
      }

      toast({ title: 'Markerad som utbetald' })
      fetchRun()
    } catch (err) {
      toast({
        title: 'Fel',
        description: err instanceof Error ? err.message : 'Något gick fel',
        variant: 'destructive',
      })
    } finally {
      setIsMarkingPaid(false)
    }
  }

  async function openAddEmployee() {
    // Fetch employees not in this run
    const res = await fetch('/api/employees?per_page=100')
    const data = await res.json()
    if (res.ok) {
      const currentEmployeeIds = new Set(items.map(i => i.employee_id))
      setAvailableEmployees(
        (data.data || []).filter((e: Employee) => !currentEmployeeIds.has(e.id))
      )
    }
    setShowAddEmployee(true)
  }

  async function addEmployeeToRun() {
    if (!selectedEmployeeId) return
    setIsAddingEmployee(true)
    try {
      const res = await fetch(`/api/salary-runs/${id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: selectedEmployeeId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Kunde inte lägga till')
      }

      toast({ title: 'Anställd tillagd i lönekörningen' })
      setShowAddEmployee(false)
      setSelectedEmployeeId('')
      fetchRun()
    } catch (err) {
      toast({
        title: 'Fel',
        description: err instanceof Error ? err.message : 'Något gick fel',
        variant: 'destructive',
      })
    } finally {
      setIsAddingEmployee(false)
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

  if (!run) {
    return (
      <div className="space-y-6">
        <p>Lönekörning hittades inte</p>
        <Link href="/payroll">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Tillbaka
          </Button>
        </Link>
      </div>
    )
  }

  const currentStep = statusSteps.find(s => s.key === run.status)?.step || 1
  const isEditable = run.status === 'draft' || run.status === 'calculated'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/payroll">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Tillbaka
          </Button>
        </Link>
      </div>

      <PageHeader
        title={run.run_name}
        description={`${SWEDISH_MONTHS[run.period_month]} ${run.period_year} - Utbetalning ${formatDate(run.payment_date)}`}
        action={
          <Badge variant={statusVariant[run.status] || 'secondary'} className="text-sm">
            {SALARY_RUN_STATUS_LABELS[run.status]}
          </Badge>
        }
      />

      {/* Step indicator */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            {statusSteps.map((step, index) => (
              <div key={step.key} className="flex items-center">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      currentStep >= step.step
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {currentStep > step.step ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      step.step
                    )}
                  </div>
                  <span className={`text-xs ${currentStep >= step.step ? 'font-medium' : 'text-muted-foreground'}`}>
                    {step.label}
                  </span>
                </div>
                {index < statusSteps.length - 1 && (
                  <div
                    className={`h-0.5 w-full mx-2 ${
                      currentStep > step.step ? 'bg-primary' : 'bg-muted'
                    }`}
                    style={{ minWidth: '40px' }}
                  />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      {Number(run.total_gross) > 0 && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Bruttolöner</p>
              <p className="text-xl font-bold tabular-nums">{formatCurrency(Number(run.total_gross))}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Preliminär skatt</p>
              <p className="text-xl font-bold tabular-nums">{formatCurrency(Number(run.total_preliminary_tax))}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Nettolöner</p>
              <p className="text-xl font-bold tabular-nums text-success">{formatCurrency(Number(run.total_net))}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Arbetsgivaravgifter</p>
              <p className="text-xl font-bold tabular-nums">{formatCurrency(Number(run.total_employer_tax))}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        {isEditable && (
          <>
            <Button onClick={openAddEmployee} variant="outline">
              <UserPlus className="mr-2 h-4 w-4" />
              Lägg till anställd
            </Button>
            <Button onClick={handleCalculate} disabled={isCalculating || items.length === 0}>
              {isCalculating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Calculator className="mr-2 h-4 w-4" />
              )}
              Beräkna löner
            </Button>
          </>
        )}

        {run.status === 'calculated' && (
          <Button onClick={handleApprove} disabled={isApproving}>
            {isApproving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="mr-2 h-4 w-4" />
            )}
            Godkänn lönekörning
          </Button>
        )}

        {run.status === 'approved' && (
          <Button onClick={handleMarkPaid} disabled={isMarkingPaid}>
            {isMarkingPaid ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Banknote className="mr-2 h-4 w-4" />
            )}
            Markera som utbetald
          </Button>
        )}
      </div>

      {/* Calculation preview */}
      {calcResult && (
        <SalaryCalculationPreview result={calcResult} />
      )}

      {/* Salary run items table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Löneposter ({items.length} anställda)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">Inga anställda tillagda ännu</p>
              <Button className="mt-4" variant="outline" onClick={openAddEmployee}>
                <UserPlus className="mr-2 h-4 w-4" />
                Lägg till anställd
              </Button>
            </div>
          ) : (
            <SalaryRunTable
              items={items}
              salaryRunId={id}
              isEditable={isEditable}
              onItemUpdated={fetchRun}
            />
          )}
        </CardContent>
      </Card>

      {/* Journal entry link */}
      {run.journal_entry_id && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Verifikation skapad</p>
                <p className="text-sm text-muted-foreground">
                  Lönebokföring har skapats i bokföringen
                </p>
              </div>
              <Link href="/bookkeeping">
                <Button variant="outline" size="sm">
                  Visa i bokföringen
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add employee dialog */}
      <Dialog open={showAddEmployee} onOpenChange={setShowAddEmployee}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lägg till anställd</DialogTitle>
            <DialogDescription>
              Välj en anställd att lägga till i lönekörningen
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Anställd</Label>
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj anställd..." />
                </SelectTrigger>
                <SelectContent>
                  {availableEmployees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name} (#{emp.employee_number})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {availableEmployees.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Alla aktiva anställda finns redan i lönekörningen.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddEmployee(false)}>
              Avbryt
            </Button>
            <Button
              onClick={addEmployeeToRun}
              disabled={isAddingEmployee || !selectedEmployeeId}
            >
              {isAddingEmployee ? 'Lägger till...' : 'Lägg till'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
