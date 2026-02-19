'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useToast } from '@/components/ui/use-toast'
import { ArrowLeft, Pencil, Loader2, Save } from 'lucide-react'
import Link from 'next/link'
import ProjectProfitabilityCard from '@/components/budget/ProjectProfitabilityCard'
import MonthlyTrendChart from '@/components/budget/MonthlyTrendChart'
import { PROJECT_STATUS_LABELS, MONTH_NAMES_SV } from '@/types/budget-costcenters'
import type { Project, ProjectStatus, ProjectProfitability } from '@/types/budget-costcenters'

function formatSEK(amount: number): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

const statusBadgeVariant: Record<ProjectStatus, 'default' | 'success' | 'secondary' | 'destructive' | 'warning'> = {
  planning: 'secondary',
  active: 'default',
  completed: 'success',
  cancelled: 'destructive',
  on_hold: 'warning',
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [project, setProject] = useState<Project | null>(null)
  const [profitability, setProfitability] = useState<ProjectProfitability | null>(null)
  const [journalLines, setJournalLines] = useState<Array<Record<string, unknown>>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Edit form
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editStatus, setEditStatus] = useState<ProjectStatus>('planning')
  const [editBudget, setEditBudget] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')

  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    fetchProject()
    fetchProfitability()
    fetchJournalLines()
  }, [id])

  async function fetchProject() {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('projects')
      .select('*, customer:customers(id, name)')
      .eq('id', id)
      .single()

    if (error) {
      toast({ title: 'Fel', description: 'Kunde inte hämta projekt', variant: 'destructive' })
    } else {
      setProject(data)
      setEditName(data.name)
      setEditDescription(data.description || '')
      setEditStatus(data.status)
      setEditBudget(data.budget_amount?.toString() || '0')
      setEditStartDate(data.start_date || '')
      setEditEndDate(data.end_date || '')
    }
    setIsLoading(false)
  }

  async function fetchProfitability() {
    const response = await fetch(`/api/projects/${id}/profitability`)
    if (response.ok) {
      const result = await response.json()
      setProfitability(result.data)
    }
  }

  async function fetchJournalLines() {
    const { data } = await supabase
      .from('journal_entry_lines')
      .select(`
        id, account_number, debit_amount, credit_amount, line_description,
        journal_entries!inner(entry_date, description, voucher_number, status)
      `)
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .limit(100)

    setJournalLines(data || [])
  }

  async function handleSave() {
    setIsSaving(true)
    const response = await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editName,
        description: editDescription || null,
        status: editStatus,
        budget_amount: parseFloat(editBudget) || 0,
        start_date: editStartDate || null,
        end_date: editEndDate || null,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      toast({ title: 'Fel', description: result.error, variant: 'destructive' })
    } else {
      toast({ title: 'Uppdaterat', description: 'Projektet har uppdaterats' })
      setProject(result.data)
      setIsEditing(false)
    }
    setIsSaving(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="space-y-4">
        <Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Tillbaka
        </Link>
        <p>Projektet hittades inte.</p>
      </div>
    )
  }

  // Build chart data from profitability
  const chartBudgetMonths = new Array(12).fill(0)
  const chartActualMonths = new Array(12).fill(0)
  if (profitability) {
    for (const item of profitability.revenue_by_month) {
      const [, monthStr] = item.month.split('-')
      const monthIdx = parseInt(monthStr) - 1
      if (monthIdx >= 0 && monthIdx < 12) {
        chartActualMonths[monthIdx] += item.amount
      }
    }
    for (const item of profitability.expense_by_month) {
      const [, monthStr] = item.month.split('-')
      const monthIdx = parseInt(monthStr) - 1
      if (monthIdx >= 0 && monthIdx < 12) {
        chartActualMonths[monthIdx] -= item.amount
      }
    }
    // Distribute budget evenly for chart
    if (profitability.budget_amount > 0) {
      const monthly = profitability.budget_amount / 12
      chartBudgetMonths.fill(monthly)
    }
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Alla projekt
      </Link>

      {/* Project header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
            <Badge variant={statusBadgeVariant[project.status]}>
              {PROJECT_STATUS_LABELS[project.status]}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Projekt {project.project_number}
            {(project.customer as { name?: string } | null)?.name && (
              <> &middot; {(project.customer as { name: string }).name}</>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setIsEditing(!isEditing)}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          {isEditing ? 'Avbryt' : 'Redigera'}
        </Button>
      </div>

      {/* Edit form */}
      {isEditing && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Namn</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={(v) => setEditStatus(v as ProjectStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROJECT_STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Beskrivning</Label>
              <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Budget (SEK)</Label>
                <Input type="number" value={editBudget} onChange={(e) => setEditBudget(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Startdatum</Label>
                <Input type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Slutdatum</Label>
                <Input type="date" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Save className="mr-1.5 h-3.5 w-3.5" /> Spara
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Översikt</TabsTrigger>
          <TabsTrigger value="transactions">Bokningar</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Profitability card */}
          {profitability && (
            <ProjectProfitabilityCard profitability={profitability} />
          )}

          {/* Chart */}
          {profitability && (profitability.total_revenue > 0 || profitability.total_expenses > 0) && (
            <MonthlyTrendChart
              budgetMonths={chartBudgetMonths}
              actualMonths={chartActualMonths}
              title="Nettoresultat per manad"
            />
          )}

          {/* Quick info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">Budget</div>
                <div className="text-lg font-semibold">{formatSEK(project.budget_amount || 0)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">Startdatum</div>
                <div className="text-lg font-semibold">{project.start_date || '-'}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">Slutdatum</div>
                <div className="text-lg font-semibold">{project.end_date || '-'}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">Bokningar</div>
                <div className="text-lg font-semibold">{journalLines.length}</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bokföringsposter</CardTitle>
              <CardDescription>
                Alla verifikationsrader kopplade till detta projekt
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {journalLines.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  Inga bokningar kopplade till detta projekt
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Ver.nr</TableHead>
                      <TableHead>Konto</TableHead>
                      <TableHead>Beskrivning</TableHead>
                      <TableHead className="text-right">Debet</TableHead>
                      <TableHead className="text-right">Kredit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {journalLines.map((line) => {
                      const je = line.journal_entries as { entry_date: string; description: string; voucher_number: number; status: string } | null
                      return (
                        <TableRow key={line.id as string}>
                          <TableCell className="text-sm">{je?.entry_date || '-'}</TableCell>
                          <TableCell className="font-mono text-sm">{je?.voucher_number || '-'}</TableCell>
                          <TableCell className="font-mono text-sm">{line.account_number as string}</TableCell>
                          <TableCell className="text-sm">{(line.line_description as string) || je?.description || '-'}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {(line.debit_amount as number) > 0 ? formatSEK(line.debit_amount as number) : ''}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {(line.credit_amount as number) > 0 ? formatSEK(line.credit_amount as number) : ''}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
