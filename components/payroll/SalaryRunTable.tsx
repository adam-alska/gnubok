'use client'

import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency } from '@/lib/utils'
import { Pencil, Check, X } from 'lucide-react'
import type { SalaryRunItem, Employee } from '@/types/payroll'
import { SALARY_TYPE_LABELS } from '@/types/payroll'

interface SalaryRunTableProps {
  items: (SalaryRunItem & { employee: Employee })[]
  salaryRunId: string
  isEditable: boolean
  onItemUpdated: () => void
}

export function SalaryRunTable({ items, salaryRunId, isEditable, onItemUpdated }: SalaryRunTableProps) {
  const { toast } = useToast()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<{
    hours_worked: number
    overtime_hours: number
    overtime_rate: number
  }>({ hours_worked: 0, overtime_hours: 0, overtime_rate: 0 })

  function startEditing(item: SalaryRunItem) {
    setEditingId(item.id)
    setEditValues({
      hours_worked: item.hours_worked || 0,
      overtime_hours: item.overtime_hours || 0,
      overtime_rate: item.overtime_rate || 0,
    })
  }

  async function saveEdit(itemId: string) {
    try {
      const res = await fetch(`/api/salary-runs/${salaryRunId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editValues),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Kunde inte uppdatera')
      }

      setEditingId(null)
      onItemUpdated()
      toast({ title: 'Uppdaterad', description: 'Lönepost uppdaterad' })
    } catch (err) {
      toast({
        title: 'Fel',
        description: err instanceof Error ? err.message : 'Något gick fel',
        variant: 'destructive',
      })
    }
  }

  // Calculate totals
  const totals = items.reduce(
    (acc, item) => ({
      gross: acc.gross + Number(item.gross_salary),
      tax: acc.tax + Number(item.preliminary_tax),
      net: acc.net + Number(item.net_salary),
      employer: acc.employer + Number(item.employer_tax),
      vacation: acc.vacation + Number(item.vacation_pay_accrued),
    }),
    { gross: 0, tax: 0, net: 0, employer: 0, vacation: 0 }
  )

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Anställd</TableHead>
          <TableHead>Typ</TableHead>
          <TableHead className="text-right">Brutto</TableHead>
          <TableHead className="text-right">Prel. skatt</TableHead>
          <TableHead className="text-right">Netto</TableHead>
          <TableHead className="text-right">Arb.avg.</TableHead>
          <TableHead className="text-right">Sem.lön</TableHead>
          {isEditable && <TableHead className="text-right">OB/Övertid</TableHead>}
          {isEditable && <TableHead className="w-20"></TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const employee = item.employee
          const isEditing = editingId === item.id

          return (
            <TableRow key={item.id}>
              <TableCell>
                <div>
                  <p className="font-medium">
                    {employee?.first_name} {employee?.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    #{employee?.employee_number}
                  </p>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className="text-xs">
                  {SALARY_TYPE_LABELS[item.salary_type] || item.salary_type}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(Number(item.gross_salary))}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(Number(item.preliminary_tax))}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {formatCurrency(Number(item.net_salary))}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(Number(item.employer_tax))}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(Number(item.vacation_pay_accrued))}
              </TableCell>
              {isEditable && (
                <TableCell className="text-right">
                  {isEditing ? (
                    <div className="flex gap-1 justify-end">
                      <Input
                        type="number"
                        value={editValues.overtime_hours}
                        onChange={(e) =>
                          setEditValues(prev => ({ ...prev, overtime_hours: Number(e.target.value) }))
                        }
                        className="w-16 h-8 text-xs"
                        placeholder="Tim"
                      />
                      <Input
                        type="number"
                        value={editValues.overtime_rate}
                        onChange={(e) =>
                          setEditValues(prev => ({ ...prev, overtime_rate: Number(e.target.value) }))
                        }
                        className="w-20 h-8 text-xs"
                        placeholder="Kr/tim"
                      />
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {item.overtime_hours > 0
                        ? `${item.overtime_hours}h x ${formatCurrency(item.overtime_rate)}`
                        : '-'}
                    </span>
                  )}
                </TableCell>
              )}
              {isEditable && (
                <TableCell className="text-right">
                  {isEditing ? (
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => saveEdit(item.id)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => startEditing(item)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              )}
            </TableRow>
          )
        })}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={2} className="font-bold">
            Totalt ({items.length} anställda)
          </TableCell>
          <TableCell className="text-right font-bold tabular-nums">
            {formatCurrency(totals.gross)}
          </TableCell>
          <TableCell className="text-right font-bold tabular-nums">
            {formatCurrency(totals.tax)}
          </TableCell>
          <TableCell className="text-right font-bold tabular-nums">
            {formatCurrency(totals.net)}
          </TableCell>
          <TableCell className="text-right font-bold tabular-nums">
            {formatCurrency(totals.employer)}
          </TableCell>
          <TableCell className="text-right font-bold tabular-nums">
            {formatCurrency(totals.vacation)}
          </TableCell>
          {isEditable && <TableCell></TableCell>}
          {isEditable && <TableCell></TableCell>}
        </TableRow>
      </TableFooter>
    </Table>
  )
}
