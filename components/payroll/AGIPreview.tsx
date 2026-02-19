'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency } from '@/lib/utils'
import { FileText } from 'lucide-react'
import type { AGIDeclaration, AGIEmployeeData } from '@/types/payroll'
import { AGI_STATUS_LABELS, SWEDISH_MONTHS } from '@/types/payroll'

interface AGIPreviewProps {
  declaration: AGIDeclaration
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive'> = {
  draft: 'secondary',
  submitted: 'default',
  confirmed: 'default',
}

export function AGIPreview({ declaration }: AGIPreviewProps) {
  const employees = (declaration.declaration_data || []) as AGIEmployeeData[]
  const monthName = SWEDISH_MONTHS[declaration.period_month] || ''

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Arbetsgivardeklaration - {monthName} {declaration.period_year}
            </CardTitle>
            <Badge variant={statusVariant[declaration.status] || 'secondary'}>
              {AGI_STATUS_LABELS[declaration.status]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Bruttolöner</p>
              <p className="font-medium tabular-nums">{formatCurrency(declaration.total_gross_salaries)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Arbetsgivaravgifter</p>
              <p className="font-medium tabular-nums">{formatCurrency(declaration.total_employer_tax)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Preliminär skatt</p>
              <p className="font-medium tabular-nums">{formatCurrency(declaration.total_preliminary_tax)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Att betala totalt</p>
              <p className="font-bold tabular-nums text-lg">{formatCurrency(declaration.total_payable)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-employee breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Individuppgifter (per anställd)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Anställd</TableHead>
                <TableHead>Personnummer</TableHead>
                <TableHead className="text-right">Bruttolöner</TableHead>
                <TableHead className="text-right">Prel. skatt</TableHead>
                <TableHead className="text-right">Arb.avg.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((emp) => (
                <TableRow key={emp.employee_id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{emp.first_name} {emp.last_name}</p>
                      <p className="text-xs text-muted-foreground">#{emp.employee_number}</p>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {emp.personal_number_masked}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(emp.total_gross)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(emp.total_preliminary_tax)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(emp.total_employer_tax)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="font-bold">
                  Totalt ({employees.length} anställda)
                </TableCell>
                <TableCell className="text-right font-bold tabular-nums">
                  {formatCurrency(declaration.total_gross_salaries)}
                </TableCell>
                <TableCell className="text-right font-bold tabular-nums">
                  {formatCurrency(declaration.total_preliminary_tax)}
                </TableCell>
                <TableCell className="text-right font-bold tabular-nums">
                  {formatCurrency(declaration.total_employer_tax)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      {/* Submission info */}
      {declaration.submitted_at && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Inskickad: {new Date(declaration.submitted_at).toLocaleString('sv-SE')}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
