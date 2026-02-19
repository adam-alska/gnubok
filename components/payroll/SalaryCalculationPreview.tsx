'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { Calculator, ArrowRight } from 'lucide-react'
import type { SalaryRunCalculationResult } from '@/types/payroll'

interface SalaryCalculationPreviewProps {
  result: SalaryRunCalculationResult
}

export function SalaryCalculationPreview({ result }: SalaryCalculationPreviewProps) {
  const { totals, items } = result

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-primary/20">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total bruttoloner</p>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(totals.totalGross)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total nettoloner (att utbetala)</p>
            <p className="text-2xl font-bold tabular-nums text-success">{formatCurrency(totals.totalNet)}</p>
          </CardContent>
        </Card>
        <Card className="border-warning/20">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total arbetsgivarkostnad</p>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(totals.totalEmployerCost)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Berakningsspecifikation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b">
              <span>Bruttoloner</span>
              <span className="font-medium tabular-nums">{formatCurrency(totals.totalGross)}</span>
            </div>
            <div className="flex justify-between py-2 border-b text-muted-foreground">
              <span className="flex items-center gap-2">
                <ArrowRight className="h-3 w-3" />
                Preliminar skatt
              </span>
              <span className="tabular-nums">- {formatCurrency(totals.totalPreliminaryTax)}</span>
            </div>
            <div className="flex justify-between py-2 border-b font-medium">
              <span>Nettoloner (utbetalning till bank)</span>
              <span className="tabular-nums text-success">{formatCurrency(totals.totalNet)}</span>
            </div>
            <div className="flex justify-between py-2 border-b text-muted-foreground">
              <span className="flex items-center gap-2">
                <ArrowRight className="h-3 w-3" />
                Arbetsgivaravgifter (31,42%)
              </span>
              <span className="tabular-nums">{formatCurrency(totals.totalEmployerTax)}</span>
            </div>
            <div className="flex justify-between py-2 border-b text-muted-foreground">
              <span className="flex items-center gap-2">
                <ArrowRight className="h-3 w-3" />
                Semesterloneskuld (12%)
              </span>
              <span className="tabular-nums">{formatCurrency(totals.totalVacationPay)}</span>
            </div>
            <div className="flex justify-between py-2 font-bold text-lg">
              <span>Total arbetsgivarkostnad</span>
              <span className="tabular-nums">{formatCurrency(totals.totalEmployerCost)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Skatteverket summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Att betala till Skatteverket</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between py-2 border-b">
              <span>Preliminar skatt (personalskatt)</span>
              <span className="font-medium tabular-nums">{formatCurrency(totals.totalPreliminaryTax)}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span>Arbetsgivaravgifter</span>
              <span className="font-medium tabular-nums">{formatCurrency(totals.totalEmployerTax)}</span>
            </div>
            <div className="flex justify-between py-2 font-bold">
              <span>Totalt till Skatteverket</span>
              <span className="tabular-nums">
                {formatCurrency(totals.totalPreliminaryTax + totals.totalEmployerTax)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-employee detail */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per anstalld</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.employeeId} className="border rounded-lg p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <p className="font-medium">{item.employeeName}</p>
                  <p className="text-sm text-muted-foreground">
                    Netto: <span className="font-medium text-foreground">{formatCurrency(item.netSalary)}</span>
                  </p>
                </div>
                <div className="grid grid-cols-4 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">Brutto</p>
                    <p className="tabular-nums">{formatCurrency(item.grossSalary)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Skatt</p>
                    <p className="tabular-nums">{formatCurrency(item.preliminaryTax)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Arb.avg.</p>
                    <p className="tabular-nums">{formatCurrency(item.employerTax)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Sem.lon</p>
                    <p className="tabular-nums">{formatCurrency(item.vacationPayAccrued)}</p>
                  </div>
                </div>
                {item.absenceDeduction > 0 && (
                  <p className="text-xs text-warning">
                    Franvaroavdrag: -{formatCurrency(item.absenceDeduction)}
                  </p>
                )}
                {item.overtimeAmount > 0 && (
                  <p className="text-xs text-success">
                    Overtid: {item.overtimeHours}h = +{formatCurrency(item.overtimeAmount)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
