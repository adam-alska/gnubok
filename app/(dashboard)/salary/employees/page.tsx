'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, ArrowLeft, UserCircle } from 'lucide-react'
import { useCanWrite } from '@/lib/hooks/use-can-write'
import { formatCurrency } from '@/lib/utils'
import type { Employee } from '@/types'

const EMPLOYMENT_LABELS: Record<string, string> = {
  employee: 'Anställd',
  company_owner: 'Företagsledare',
  board_member: 'Styrelseledamot',
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const canWrite = useCanWrite()

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/salary/employees')
      if (res.ok) {
        const { data } = await res.json()
        setEmployees(data || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8">
            <Link href="/salary"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-medium tracking-tight">Anställda</h1>
            <p className="text-sm text-muted-foreground mt-1">{employees.length} registrerade</p>
          </div>
        </div>
        {canWrite && (
          <Button asChild>
            <Link href="/salary/employees/new">
              <Plus className="mr-2 h-4 w-4" />
              Ny anställd
            </Link>
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : employees.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <UserCircle className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-4">Inga anställda registrerade</p>
            {canWrite && (
              <Button asChild size="sm">
                <Link href="/salary/employees/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Lägg till anställd
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Namn</th>
                  <th className="px-4 py-2 font-medium">Personnummer</th>
                  <th className="px-4 py-2 font-medium">Typ</th>
                  <th className="px-4 py-2 font-medium text-right">Månadslön</th>
                  <th className="px-4 py-2 font-medium text-right">Sysselsättningsgrad</th>
                  <th className="px-4 py-2 font-medium">Skattetabell</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/salary/employees/${emp.id}`} className="text-sm font-medium hover:underline">
                        {emp.first_name} {emp.last_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">
                      {emp.personnummer}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {EMPLOYMENT_LABELS[emp.employment_type] || emp.employment_type}
                    </td>
                    <td className="px-4 py-3 text-sm text-right tabular-nums">
                      {emp.monthly_salary ? formatCurrency(emp.monthly_salary) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right tabular-nums">
                      {emp.employment_degree}%
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">
                      {emp.tax_table_number ? `Tabell ${emp.tax_table_number}, kol ${emp.tax_column}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
