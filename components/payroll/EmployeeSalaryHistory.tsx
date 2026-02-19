'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { History } from 'lucide-react'
import { SALARY_RUN_STATUS_LABELS, SWEDISH_MONTHS } from '@/types/payroll'
import type { SalaryRunItem, SalaryRun } from '@/types/payroll'

interface EmployeeSalaryHistoryProps {
  employeeId: string
}

interface SalaryHistoryEntry extends SalaryRunItem {
  salary_run: SalaryRun
}

export function EmployeeSalaryHistory({ employeeId }: EmployeeSalaryHistoryProps) {
  const [history, setHistory] = useState<SalaryHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    fetchHistory()
  }, [employeeId])

  async function fetchHistory() {
    setIsLoading(true)

    const { data, error } = await supabase
      .from('salary_run_items')
      .select('*, salary_run:salary_runs(*)')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })
      .limit(24)

    if (!error && data) {
      setHistory(data as SalaryHistoryEntry[])
    }
    setIsLoading(false)
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">Laddar lonehistorik...</p>
        </CardContent>
      </Card>
    )
  }

  if (history.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-2">
            <History className="h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">Ingen lonehistorik annu</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" />
          Lonehistorik
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Brutto</TableHead>
              <TableHead className="text-right">Skatt</TableHead>
              <TableHead className="text-right">Netto</TableHead>
              <TableHead className="text-right">Arb.avg.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((entry) => {
              const run = entry.salary_run
              return (
                <TableRow key={entry.id}>
                  <TableCell>
                    <p className="font-medium">
                      {SWEDISH_MONTHS[run.period_month]} {run.period_year}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Utbet: {formatDate(run.payment_date)}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {SALARY_RUN_STATUS_LABELS[run.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(Number(entry.gross_salary))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(Number(entry.preliminary_tax))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatCurrency(Number(entry.net_salary))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(Number(entry.employer_tax))}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
