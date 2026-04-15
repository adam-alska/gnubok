'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Save, Trash2 } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { useCanWrite } from '@/lib/hooks/use-can-write'
import { getErrorMessage } from '@/lib/errors/get-error-message'
import { formatCurrency } from '@/lib/utils'
import type { Employee } from '@/types'

const EMPLOYMENT_LABELS: Record<string, string> = {
  employee: 'Anställd',
  company_owner: 'Företagsledare',
  board_member: 'Styrelseledamot',
}

export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { toast } = useToast()
  const canWrite = useCanWrite()
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [employmentType, setEmploymentType] = useState('employee')

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/salary/employees/${id}`)
      if (res.ok) {
        const { data } = await res.json()
        setEmployee(data)
        setEmploymentType(data.employment_type)
      }
      setLoading(false)
    }
    load()
  }, [id])

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)

    const form = new FormData(e.currentTarget)
    const body = {
      first_name: form.get('first_name') as string,
      last_name: form.get('last_name') as string,
      employment_type: employmentType,
      employment_degree: parseFloat(form.get('employment_degree') as string) || 100,
      monthly_salary: parseFloat(form.get('monthly_salary') as string) || undefined,
      hourly_rate: parseFloat(form.get('hourly_rate') as string) || undefined,
      tax_table_number: parseInt(form.get('tax_table_number') as string) || undefined,
      tax_column: parseInt(form.get('tax_column') as string) || 1,
      email: form.get('email') as string || undefined,
      phone: form.get('phone') as string || undefined,
      clearing_number: form.get('clearing_number') as string || undefined,
      bank_account_number: form.get('bank_account_number') as string || undefined,
    }

    const res = await fetch(`/api/salary/employees/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      const { data } = await res.json()
      setEmployee(data)
      toast({ title: 'Anställd uppdaterad' })
    } else {
      const result = await res.json()
      toast({
        title: 'Fel',
        description: getErrorMessage(result, { context: 'salary', statusCode: res.status }),
        variant: 'destructive',
      })
    }

    setSaving(false)
  }

  async function handleDeactivate() {
    if (!confirm('Vill du inaktivera denna anställd?')) return

    const res = await fetch(`/api/salary/employees/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast({ title: 'Anställd inaktiverad' })
      router.push('/salary/employees')
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-60 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted rounded-lg animate-pulse" />
      </div>
    )
  }

  if (!employee) {
    return <p className="text-muted-foreground">Anställd hittades inte</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8">
            <Link href="/salary/employees"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-medium tracking-tight">
              {employee.first_name} {employee.last_name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {employee.personnummer} · {EMPLOYMENT_LABELS[employee.employment_type]}
            </p>
          </div>
        </div>
        {canWrite && (
          <Button variant="outline" size="sm" onClick={handleDeactivate} className="text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Inaktivera
          </Button>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Uppgifter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">Förnamn</Label>
                <Input id="first_name" name="first_name" defaultValue={employee.first_name} required disabled={!canWrite} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Efternamn</Label>
                <Input id="last_name" name="last_name" defaultValue={employee.last_name} required disabled={!canWrite} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="employment_type">Typ</Label>
                <Select value={employmentType} onValueChange={setEmploymentType} disabled={!canWrite}>
                  <SelectTrigger id="employment_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Anställd</SelectItem>
                    <SelectItem value="company_owner">Företagsledare</SelectItem>
                    <SelectItem value="board_member">Styrelseledamot</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="employment_degree">Sysselsättningsgrad (%)</Label>
                <Input id="employment_degree" name="employment_degree" type="number" defaultValue={employee.employment_degree} disabled={!canWrite} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="monthly_salary">Månadslön</Label>
                <Input id="monthly_salary" name="monthly_salary" type="number" defaultValue={employee.monthly_salary || ''} disabled={!canWrite} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="hourly_rate">Timlön</Label>
                <Input id="hourly_rate" name="hourly_rate" type="number" step="0.01" defaultValue={employee.hourly_rate || ''} disabled={!canWrite} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax_table_number">Skattetabell</Label>
                <Input id="tax_table_number" name="tax_table_number" type="number" defaultValue={employee.tax_table_number || ''} disabled={!canWrite} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax_column">Kolumn</Label>
                <Input id="tax_column" name="tax_column" type="number" defaultValue={employee.tax_column} disabled={!canWrite} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-post</Label>
                <Input id="email" name="email" type="email" defaultValue={employee.email || ''} disabled={!canWrite} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefon</Label>
                <Input id="phone" name="phone" defaultValue={employee.phone || ''} disabled={!canWrite} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clearing_number">Clearingnummer</Label>
                <Input id="clearing_number" name="clearing_number" defaultValue={employee.clearing_number || ''} disabled={!canWrite} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank_account_number">Kontonummer</Label>
                <Input id="bank_account_number" name="bank_account_number" defaultValue={employee.bank_account_number || ''} disabled={!canWrite} />
              </div>
            </div>
          </CardContent>
        </Card>

        {canWrite && (
          <div className="flex justify-end gap-3">
            <Button variant="outline" asChild>
              <Link href="/salary/employees">Avbryt</Link>
            </Button>
            <Button type="submit" disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Sparar...' : 'Spara ändringar'}
            </Button>
          </div>
        )}
      </form>
    </div>
  )
}
