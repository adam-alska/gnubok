'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft, Plus, Calculator, Eye, Check, CreditCard, BookOpen,
  ArrowLeftCircle, Loader2,
} from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { useCanWrite } from '@/lib/hooks/use-can-write'
import { formatCurrency } from '@/lib/utils'
import { getErrorMessage } from '@/lib/errors/get-error-message'
import type { SalaryRun, SalaryRunEmployee, Employee, CreateJournalEntryLineInput } from '@/types'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Utkast',
  review: 'Granskning',
  approved: 'Godkänd',
  paid: 'Betald',
  booked: 'Bokförd',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  review: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  booked: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
}

interface EntryPreview {
  description: string
  lines: CreateJournalEntryLineInput[]
}

interface PreviewData {
  salaryEntry: EntryPreview
  avgifterEntry: EntryPreview
  vacationEntry: EntryPreview | null
}

export default function SalaryRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { toast } = useToast()
  const canWrite = useCanWrite()

  const [run, setRun] = useState<SalaryRun | null>(null)
  const [availableEmployees, setAvailableEmployees] = useState<Employee[]>([])
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  async function loadRun() {
    const res = await fetch(`/api/salary/runs/${id}`)
    if (res.ok) {
      const { data } = await res.json()
      setRun(data)
    }
  }

  useEffect(() => {
    async function load() {
      await loadRun()
      const empRes = await fetch('/api/salary/employees')
      if (empRes.ok) {
        const { data } = await empRes.json()
        setAvailableEmployees(data || [])
      }
      setLoading(false)
    }
    load()
  }, [id])

  async function handleAction(action: string, method: string = 'POST') {
    setActionLoading(action)
    const res = await fetch(`/api/salary/runs/${id}/${action}`, { method })
    if (res.ok) {
      await loadRun()
      toast({ title: 'Status uppdaterad' })
    } else {
      const result = await res.json()
      toast({
        title: 'Fel',
        description: getErrorMessage(result, { context: 'salary', statusCode: res.status }),
        variant: 'destructive',
      })
    }
    setActionLoading(null)
  }

  async function handleAddEmployee(employeeId: string) {
    setActionLoading('add-employee')
    const res = await fetch(`/api/salary/runs/${id}/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: employeeId }),
    })
    if (res.ok) {
      await loadRun()
      toast({ title: 'Anställd tillagd' })
    } else {
      const result = await res.json()
      toast({
        title: 'Fel',
        description: getErrorMessage(result, { context: 'salary', statusCode: res.status }),
        variant: 'destructive',
      })
    }
    setActionLoading(null)
  }

  async function handleCalculate() {
    setActionLoading('calculate')
    const res = await fetch(`/api/salary/runs/${id}/calculate`, { method: 'POST' })
    if (res.ok) {
      await loadRun()
      toast({ title: 'Beräkning klar' })
    } else {
      const result = await res.json()
      toast({
        title: 'Beräkningsfel',
        description: getErrorMessage(result, { context: 'salary', statusCode: res.status }),
        variant: 'destructive',
      })
    }
    setActionLoading(null)
  }

  async function handlePreview() {
    setActionLoading('preview')
    const res = await fetch(`/api/salary/runs/${id}/preview`)
    if (res.ok) {
      const { data } = await res.json()
      setPreview(data)
    }
    setActionLoading(null)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-60 bg-muted rounded animate-pulse" />
        <div className="h-48 bg-muted rounded-lg animate-pulse" />
      </div>
    )
  }

  if (!run) {
    return <p className="text-muted-foreground">Lönekörning hittades inte</p>
  }

  const periodLabel = `${run.period_year}-${String(run.period_month).padStart(2, '0')}`
  const employees = (run.employees || []) as SalaryRunEmployee[]
  const addedEmployeeIds = new Set(employees.map(e => e.employee_id))
  const notAdded = availableEmployees.filter(e => !addedEmployeeIds.has(e.id))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8">
            <Link href="/salary"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-medium tracking-tight">
              Lönekörning {periodLabel}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Utbetalning: {run.payment_date}
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[run.status]}`}>
          {STATUS_LABELS[run.status]}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Brutto', value: run.total_gross },
          { label: 'Skatt', value: run.total_tax },
          { label: 'Netto', value: run.total_net },
          { label: 'Avgifter', value: run.total_avgifter },
          { label: 'Total kostnad', value: run.total_employer_cost },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold tabular-nums">{formatCurrency(value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Employees */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Anställda ({employees.length})</CardTitle>
          {run.status === 'draft' && canWrite && notAdded.length > 0 && (
            <div className="flex gap-2">
              <select
                id="add-employee-select"
                className="text-sm border rounded px-2 py-1"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) handleAddEmployee(e.target.value)
                  e.target.value = ''
                }}
              >
                <option value="" disabled>Lägg till anställd...</option>
                {notAdded.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                ))}
              </select>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {employees.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 py-6 text-center">
              Inga anställda tillagda ännu
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Anställd</th>
                  <th className="px-4 py-2 font-medium text-right">Brutto</th>
                  <th className="px-4 py-2 font-medium text-right">Skatt</th>
                  <th className="px-4 py-2 font-medium text-right">Netto</th>
                  <th className="px-4 py-2 font-medium text-right">Avgifter</th>
                  <th className="px-4 py-2 font-medium text-right">Semester</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(sre => (
                  <tr key={sre.id} className="border-b last:border-0">
                    <td className="px-4 py-3 text-sm font-medium">
                      {(sre as SalaryRunEmployee & { employee?: { first_name: string; last_name: string; personnummer: string } }).employee
                        ? `${(sre as SalaryRunEmployee & { employee: { first_name: string; last_name: string } }).employee.first_name} ${(sre as SalaryRunEmployee & { employee: { first_name: string; last_name: string } }).employee.last_name}`
                        : `Anställd ${sre.employee_id.slice(0, 8)}...`}
                    </td>
                    <td className="px-4 py-3 text-sm text-right tabular-nums">{formatCurrency(sre.gross_salary)}</td>
                    <td className="px-4 py-3 text-sm text-right tabular-nums">{formatCurrency(sre.tax_withheld)}</td>
                    <td className="px-4 py-3 text-sm text-right tabular-nums">{formatCurrency(sre.net_salary)}</td>
                    <td className="px-4 py-3 text-sm text-right tabular-nums">{formatCurrency(sre.avgifter_amount)}</td>
                    <td className="px-4 py-3 text-sm text-right tabular-nums">{formatCurrency(sre.vacation_accrual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Calculation breakdown (if available) */}
      {employees.some(e => e.calculation_breakdown) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Beräkningsdetaljer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {employees.filter(e => e.calculation_breakdown).map(sre => {
              const breakdown = sre.calculation_breakdown as { steps?: Array<{ label: string; formula: string; output: number }> }
              return (
                <div key={sre.id} className="space-y-2">
                  <h4 className="text-sm font-medium">
                    {(sre as SalaryRunEmployee & { employee?: { first_name: string; last_name: string } }).employee
                      ? `${(sre as SalaryRunEmployee & { employee: { first_name: string; last_name: string } }).employee.first_name} ${(sre as SalaryRunEmployee & { employee: { first_name: string; last_name: string } }).employee.last_name}`
                      : sre.employee_id.slice(0, 8)}
                  </h4>
                  <div className="text-xs space-y-1 bg-muted/50 rounded-lg p-3">
                    {(breakdown?.steps || []).map((step, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-muted-foreground">{step.label}: <span className="font-mono">{step.formula}</span></span>
                        <span className="font-medium tabular-nums">{formatCurrency(step.output)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Journal preview */}
      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Förhandsgranskning — verifikationer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {[preview.salaryEntry, preview.avgifterEntry, preview.vacationEntry, (preview as unknown as Record<string, EntryPreview | null>).pensionEntry].filter(Boolean).map((entry, idx) => (
              <div key={idx} className="space-y-2">
                <h4 className="text-sm font-medium">{entry!.description}</h4>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="text-left py-1">Konto</th>
                      <th className="text-left py-1">Beskrivning</th>
                      <th className="text-right py-1">Debet</th>
                      <th className="text-right py-1">Kredit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry!.lines.map((line, li) => (
                      <tr key={li} className="border-t border-border/30">
                        <td className="py-1.5 tabular-nums font-mono">{line.account_number}</td>
                        <td className="py-1.5 text-muted-foreground">{line.line_description}</td>
                        <td className="py-1.5 text-right tabular-nums">{line.debit_amount ? formatCurrency(line.debit_amount) : ''}</td>
                        <td className="py-1.5 text-right tabular-nums">{line.credit_amount ? formatCurrency(line.credit_amount) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      {canWrite && (
        <div className="flex flex-wrap gap-3 justify-end">
          {run.status === 'draft' && (
            <>
              <Button variant="outline" onClick={handleCalculate} disabled={!!actionLoading || employees.length === 0}>
                {actionLoading === 'calculate' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
                Beräkna
              </Button>
              <Button variant="outline" onClick={handlePreview} disabled={!!actionLoading || run.total_gross === 0}>
                {actionLoading === 'preview' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                Förhandsgranska
              </Button>
              <Button onClick={() => handleAction('review')} disabled={!!actionLoading || run.total_gross === 0}>
                Till granskning
              </Button>
            </>
          )}
          {run.status === 'review' && (
            <>
              <Button variant="outline" onClick={() => handleAction('revert')} disabled={!!actionLoading}>
                <ArrowLeftCircle className="mr-2 h-4 w-4" />
                Tillbaka till utkast
              </Button>
              <Button variant="outline" onClick={handlePreview} disabled={!!actionLoading}>
                <Eye className="mr-2 h-4 w-4" />
                Förhandsgranska
              </Button>
              <Button onClick={() => handleAction('approve')} disabled={!!actionLoading}>
                <Check className="mr-2 h-4 w-4" />
                Godkänn
              </Button>
            </>
          )}
          {run.status === 'approved' && (
            <Button onClick={() => handleAction('paid')} disabled={!!actionLoading}>
              <CreditCard className="mr-2 h-4 w-4" />
              Markera som betald
            </Button>
          )}
          {run.status === 'paid' && (
            <Button onClick={() => handleAction('book')} disabled={!!actionLoading}>
              {actionLoading === 'book' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BookOpen className="mr-2 h-4 w-4" />}
              Bokför
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
