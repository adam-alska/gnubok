'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Save } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { getErrorMessage } from '@/lib/errors/get-error-message'

export default function NewEmployeePage() {
  const router = useRouter()
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)

    const form = new FormData(e.currentTarget)
    const body = {
      first_name: form.get('first_name') as string,
      last_name: form.get('last_name') as string,
      personnummer: (form.get('personnummer') as string).replace(/\D/g, ''),
      employment_type: form.get('employment_type') as string,
      employment_start: form.get('employment_start') as string,
      employment_degree: parseFloat(form.get('employment_degree') as string) || 100,
      salary_type: form.get('salary_type') as string,
      monthly_salary: parseFloat(form.get('monthly_salary') as string) || undefined,
      hourly_rate: parseFloat(form.get('hourly_rate') as string) || undefined,
      tax_table_number: parseInt(form.get('tax_table_number') as string) || undefined,
      tax_column: parseInt(form.get('tax_column') as string) || 1,
      tax_municipality: form.get('tax_municipality') as string || undefined,
      email: form.get('email') as string || undefined,
      phone: form.get('phone') as string || undefined,
      clearing_number: form.get('clearing_number') as string || undefined,
      bank_account_number: form.get('bank_account_number') as string || undefined,
    }

    const res = await fetch('/api/salary/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      toast({ title: 'Anställd skapad' })
      router.push('/salary/employees')
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8">
          <Link href="/salary/employees"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="font-display text-2xl md:text-3xl font-medium tracking-tight">Ny anställd</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Personal info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personuppgifter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">Förnamn</Label>
                <Input id="first_name" name="first_name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Efternamn</Label>
                <Input id="last_name" name="last_name" required />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="personnummer">Personnummer (12 siffror)</Label>
                <Input id="personnummer" name="personnummer" placeholder="ÅÅÅÅMMDDNNNN" required maxLength={13} />
                <p className="text-xs text-muted-foreground">Krypteras vid lagring</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-post</Label>
                <Input id="email" name="email" type="email" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefon</Label>
              <Input id="phone" name="phone" className="max-w-xs" />
            </div>
          </CardContent>
        </Card>

        {/* Employment */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Anställning</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="employment_type">Typ</Label>
                <select id="employment_type" name="employment_type" defaultValue="employee"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  <option value="employee">Anställd</option>
                  <option value="company_owner">Företagsledare</option>
                  <option value="board_member">Styrelseledamot</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="employment_start">Anställningsdatum</Label>
                <Input id="employment_start" name="employment_start" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employment_degree">Sysselsättningsgrad (%)</Label>
                <Input id="employment_degree" name="employment_degree" type="number" defaultValue="100" min="1" max="100" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Salary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lön</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="salary_type">Löneform</Label>
                <select id="salary_type" name="salary_type" defaultValue="monthly"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  <option value="monthly">Månadslön</option>
                  <option value="hourly">Timlön</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="monthly_salary">Månadslön (brutto, SEK)</Label>
                <Input id="monthly_salary" name="monthly_salary" type="number" step="1" min="0" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hourly_rate">Timlön (SEK)</Label>
                <Input id="hourly_rate" name="hourly_rate" type="number" step="0.01" min="0" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tax */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Skatt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tax_table_number">Skattetabell (29-42)</Label>
                <Input id="tax_table_number" name="tax_table_number" type="number" min="29" max="42" />
                <p className="text-xs text-muted-foreground">Baseras på folkbokföringskommun</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax_column">Kolumn (1-6)</Label>
                <Input id="tax_column" name="tax_column" type="number" defaultValue="1" min="1" max="6" />
                <p className="text-xs text-muted-foreground">1 = standard under 66 år</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax_municipality">Folkbokföringskommun</Label>
                <Input id="tax_municipality" name="tax_municipality" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bank */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bankkonto</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clearing_number">Clearingnummer</Label>
                <Input id="clearing_number" name="clearing_number" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank_account_number">Kontonummer</Label>
                <Input id="bank_account_number" name="bank_account_number" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" asChild>
            <Link href="/salary/employees">Avbryt</Link>
          </Button>
          <Button type="submit" disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Sparar...' : 'Spara'}
          </Button>
        </div>
      </form>
    </div>
  )
}
