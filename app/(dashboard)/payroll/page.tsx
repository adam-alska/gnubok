'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/components/ui/use-toast'
import { PayrollSummaryCard } from '@/components/payroll/PayrollSummaryCard'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Play, Users, FileText, CalendarDays, ArrowRight } from 'lucide-react'
import type { SalaryRun } from '@/types/payroll'
import { SALARY_RUN_STATUS_LABELS, SWEDISH_MONTHS } from '@/types/payroll'
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

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive'> = {
  draft: 'secondary',
  calculated: 'default',
  approved: 'default',
  paid: 'default',
  reported: 'default',
}

export default function PayrollPage() {
  const [salaryRuns, setSalaryRuns] = useState<SalaryRun[]>([])
  const [employeeCount, setEmployeeCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [showNewRunDialog, setShowNewRunDialog] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  const now = new Date()
  const [newRunForm, setNewRunForm] = useState({
    period_year: now.getFullYear(),
    period_month: now.getMonth() + 1,
    payment_date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-25`,
  })

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setIsLoading(true)

    // Fetch salary runs
    const runsRes = await fetch('/api/salary-runs?per_page=20')
    const runsData = await runsRes.json()
    if (runsRes.ok) {
      setSalaryRuns(runsData.data || [])
    }

    // Fetch employee count
    const { count } = await supabase
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)

    setEmployeeCount(count || 0)
    setIsLoading(false)
  }

  async function createSalaryRun() {
    setIsCreating(true)
    try {
      const monthName = SWEDISH_MONTHS[newRunForm.period_month]
      const runName = `Lön ${monthName} ${newRunForm.period_year}`

      const res = await fetch('/api/salary-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          run_name: runName,
          period_year: newRunForm.period_year,
          period_month: newRunForm.period_month,
          payment_date: newRunForm.payment_date,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Kunde inte skapa lönekörning')
      }

      toast({
        title: 'Lönekörning skapad',
        description: runName,
      })

      setShowNewRunDialog(false)
      fetchData()
    } catch (err) {
      toast({
        title: 'Fel',
        description: err instanceof Error ? err.message : 'Något gick fel',
        variant: 'destructive',
      })
    } finally {
      setIsCreating(false)
    }
  }

  const currentRun = salaryRuns.find(r => r.status === 'draft' || r.status === 'calculated') || null
  const totalMonthlyCost = salaryRuns.length > 0
    ? Number(salaryRuns[0].total_gross) + Number(salaryRuns[0].total_employer_tax)
    : 0
  const nextPaymentDate = currentRun?.payment_date
    ? formatDate(currentRun.payment_date)
    : salaryRuns.length > 0
      ? formatDate(salaryRuns[0].payment_date)
      : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lönehantering"
        description="Hantera löner, anställda och arbetsgivardeklarationer"
        action={
          <Button onClick={() => setShowNewRunDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Ny lönekörning
          </Button>
        }
      />

      {/* Summary cards */}
      <PayrollSummaryCard
        currentRun={currentRun}
        employeeCount={employeeCount}
        totalMonthlyCost={totalMonthlyCost}
        nextPaymentDate={nextPaymentDate}
      />

      {/* Quick links */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/payroll/employees">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">Personalregister</p>
                    <p className="text-sm text-muted-foreground">{employeeCount} anställda</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/payroll/agi">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">Arbetsgivardeklaration</p>
                    <p className="text-sm text-muted-foreground">AGI till Skatteverket</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/calendar">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">Frånvarokalender</p>
                    <p className="text-sm text-muted-foreground">Sjukdom, semester, VAB</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent salary runs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Senaste lönekörningar</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse flex items-center justify-between py-3">
                  <div className="space-y-2">
                    <div className="h-4 bg-muted rounded w-48" />
                    <div className="h-3 bg-muted rounded w-32" />
                  </div>
                  <div className="h-6 bg-muted rounded w-20" />
                </div>
              ))}
            </div>
          ) : salaryRuns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Play className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Inga lönekörningar ännu</h3>
              <p className="text-muted-foreground text-center mt-1 mb-4">
                Skapa din första lönekörning för att börja hantera löner.
              </p>
              <Button onClick={() => setShowNewRunDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Ny lönekörning
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {salaryRuns.map(run => (
                <Link key={run.id} href={`/payroll/runs/${run.id}`}>
                  <div className="flex items-center justify-between py-3 px-4 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer border">
                    <div>
                      <p className="font-medium">{run.run_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {run.employee_count} anställda &middot; Utbetalning {formatDate(run.payment_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      {Number(run.total_gross) > 0 && (
                        <span className="text-sm font-medium tabular-nums">
                          {formatCurrency(Number(run.total_gross))}
                        </span>
                      )}
                      <Badge variant={statusVariant[run.status] || 'secondary'}>
                        {SALARY_RUN_STATUS_LABELS[run.status]}
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New salary run dialog */}
      <Dialog open={showNewRunDialog} onOpenChange={setShowNewRunDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ny lönekörning</DialogTitle>
            <DialogDescription>
              Skapa en ny lönekörning. Alla aktiva tillsvidareanställda läggs till automatiskt.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>År</Label>
                <Input
                  type="number"
                  min={2020}
                  max={2100}
                  value={newRunForm.period_year}
                  onChange={(e) => setNewRunForm(prev => ({ ...prev, period_year: parseInt(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Månad</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={newRunForm.period_month}
                  onChange={(e) => setNewRunForm(prev => ({ ...prev, period_month: parseInt(e.target.value) }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Utbetalningsdatum</Label>
              <Input
                type="date"
                value={newRunForm.payment_date}
                onChange={(e) => setNewRunForm(prev => ({ ...prev, payment_date: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewRunDialog(false)}>
              Avbryt
            </Button>
            <Button onClick={createSalaryRun} disabled={isCreating}>
              {isCreating ? 'Skapar...' : 'Skapa lönekörning'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
