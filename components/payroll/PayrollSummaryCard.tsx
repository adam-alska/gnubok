'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { Users, Banknote, Building2, CalendarDays } from 'lucide-react'
import type { SalaryRun } from '@/types/payroll'
import { SALARY_RUN_STATUS_LABELS } from '@/types/payroll'

interface PayrollSummaryCardProps {
  currentRun: SalaryRun | null
  employeeCount: number
  totalMonthlyCost: number
  nextPaymentDate: string | null
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive'> = {
  draft: 'secondary',
  calculated: 'default',
  approved: 'default',
  paid: 'default',
  reported: 'default',
}

export function PayrollSummaryCard({
  currentRun,
  employeeCount,
  totalMonthlyCost,
  nextPaymentDate,
}: PayrollSummaryCardProps) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Anstallda</p>
              <p className="text-2xl font-bold tabular-nums">{employeeCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-warning/10 flex items-center justify-center">
              <Banknote className="h-6 w-6 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total lonekostnad</p>
              <p className="text-2xl font-bold tabular-nums">{formatCurrency(totalMonthlyCost)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-success/10 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Aktuell korning</p>
              {currentRun ? (
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant[currentRun.status] || 'secondary'}>
                    {SALARY_RUN_STATUS_LABELS[currentRun.status]}
                  </Badge>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Ingen paborjad</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <CalendarDays className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Nästa utbetalning</p>
              <p className="text-lg font-semibold">
                {nextPaymentDate || 'Ej satt'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
