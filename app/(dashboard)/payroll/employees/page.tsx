'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/components/ui/use-toast'
import { EmployeeForm } from '@/components/payroll/EmployeeForm'
import { formatCurrency } from '@/lib/utils'
import { Plus, Search, Users } from 'lucide-react'
import type { Employee } from '@/types/payroll'
import { EMPLOYMENT_TYPE_LABELS } from '@/types/payroll'

const employmentVariant: Record<string, 'default' | 'secondary'> = {
  permanent: 'default',
  temporary: 'secondary',
  hourly: 'secondary',
  intern: 'secondary',
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchEmployees()
  }, [])

  async function fetchEmployees() {
    setIsLoading(true)
    const res = await fetch('/api/employees?per_page=100')
    const data = await res.json()

    if (res.ok) {
      setEmployees(data.data || [])
    } else {
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta anställda',
        variant: 'destructive',
      })
    }
    setIsLoading(false)
  }

  const filteredEmployees = employees.filter(emp => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      emp.first_name.toLowerCase().includes(term) ||
      emp.last_name.toLowerCase().includes(term) ||
      emp.employee_number.toLowerCase().includes(term) ||
      (emp.department || '').toLowerCase().includes(term)
    )
  })

  // Get unique departments for stats
  const departments = [...new Set(employees.map(e => e.department).filter(Boolean))]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Personalregister"
        description="Hantera dina anställda"
        action={
          <Button onClick={() => { setEditEmployee(null); setShowForm(true) }}>
            <Plus className="mr-2 h-4 w-4" />
            Ny anställd
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Aktiva anställda</p>
                <p className="text-2xl font-bold tabular-nums">{employees.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Avdelningar</p>
            <p className="text-2xl font-bold tabular-nums">{departments.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total lönekostnad/månad</p>
            <p className="text-2xl font-bold tabular-nums">
              {formatCurrency(
                employees.reduce((sum, e) => sum + (Number(e.monthly_salary) || 0), 0)
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Sök på namn, nummer eller avdelning..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Employee table */}
      {isLoading ? (
        <Card>
          <CardContent className="py-8">
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="animate-pulse flex items-center gap-4 py-2">
                  <div className="h-4 bg-muted rounded w-24" />
                  <div className="h-4 bg-muted rounded w-32" />
                  <div className="h-4 bg-muted rounded w-20" />
                  <div className="h-4 bg-muted rounded w-16" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : filteredEmployees.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">
                {searchTerm ? 'Inga träffar' : 'Inga anställda ännu'}
              </h3>
              <p className="text-muted-foreground text-center mt-1 mb-4">
                {searchTerm
                  ? `Inga anställda matchar "${searchTerm}"`
                  : 'Lägg till din första anställda för att börja hantera löner.'
                }
              </p>
              {!searchTerm && (
                <Button onClick={() => { setEditEmployee(null); setShowForm(true) }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Lägg till anställd
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nr</TableHead>
                  <TableHead>Namn</TableHead>
                  <TableHead>Anställning</TableHead>
                  <TableHead>Avdelning</TableHead>
                  <TableHead className="text-right">Lön</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.map(employee => (
                  <TableRow
                    key={employee.id}
                    className="cursor-pointer"
                    onClick={() => { setEditEmployee(employee); setShowForm(true) }}
                  >
                    <TableCell className="font-mono text-sm">
                      {employee.employee_number}
                    </TableCell>
                    <TableCell>
                      <Link href={`/payroll/employees/${employee.id}`} className="hover:underline">
                        <p className="font-medium">
                          {employee.first_name} {employee.last_name}
                        </p>
                        {employee.title && (
                          <p className="text-xs text-muted-foreground">{employee.title}</p>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={employmentVariant[employee.employment_type] || 'secondary'} className="text-xs">
                        {EMPLOYMENT_TYPE_LABELS[employee.employment_type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {employee.department || '-'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {employee.employment_type === 'hourly'
                        ? `${formatCurrency(employee.hourly_rate)}/tim`
                        : formatCurrency(employee.monthly_salary)
                      }
                    </TableCell>
                    <TableCell>
                      <Badge variant={employee.is_active ? 'default' : 'secondary'} className="text-xs">
                        {employee.is_active ? 'Aktiv' : 'Inaktiv'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Employee form dialog */}
      <EmployeeForm
        open={showForm}
        onOpenChange={setShowForm}
        employee={editEmployee}
        onSaved={fetchEmployees}
      />
    </div>
  )
}
