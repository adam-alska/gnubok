'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useToast } from '@/components/ui/use-toast'
import { Plus, Calculator, Loader2, Pencil, Trash2, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { BUDGET_STATUS_LABELS } from '@/types/budget-costcenters'
import type { Budget, BudgetStatus } from '@/types/budget-costcenters'
import type { FiscalPeriod } from '@/types'

const statusBadgeVariant: Record<BudgetStatus, 'default' | 'success' | 'secondary' | 'destructive' | 'warning'> = {
  draft: 'secondary',
  active: 'default',
  locked: 'warning',
}

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [fiscalPeriods, setFiscalPeriods] = useState<FiscalPeriod[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Form state
  const [formName, setFormName] = useState('')
  const [formFiscalPeriodId, setFormFiscalPeriodId] = useState('')
  const [formDescription, setFormDescription] = useState('')

  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    fetchBudgets()
    fetchFiscalPeriods()
  }, [])

  async function fetchBudgets() {
    setIsLoading(true)
    const response = await fetch('/api/budgets')
    if (response.ok) {
      const result = await response.json()
      setBudgets(result.data || [])
    } else {
      toast({ title: 'Fel', description: 'Kunde inte hämta budgetar', variant: 'destructive' })
    }
    setIsLoading(false)
  }

  async function fetchFiscalPeriods() {
    const { data } = await supabase
      .from('fiscal_periods')
      .select('*')
      .order('period_start', { ascending: false })

    setFiscalPeriods(data || [])
  }

  function openCreateDialog() {
    setFormName('')
    setFormFiscalPeriodId('')
    setFormDescription('')
    setDialogOpen(true)
  }

  async function handleCreate() {
    if (!formName.trim() || !formFiscalPeriodId) {
      toast({ title: 'Fel', description: 'Namn och räkenskapsperiod krävs', variant: 'destructive' })
      return
    }

    setIsSaving(true)

    const response = await fetch('/api/budgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formName,
        fiscal_period_id: formFiscalPeriodId,
        description: formDescription || undefined,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      toast({ title: 'Fel', description: result.error, variant: 'destructive' })
    } else {
      toast({ title: 'Budget skapad', description: `${formName} har skapats` })
      setDialogOpen(false)
      fetchBudgets()
    }

    setIsSaving(false)
  }

  async function handleDelete(budget: Budget) {
    if (!confirm(`Vill du ta bort budgeten "${budget.name}"?`)) return

    const response = await fetch(`/api/budgets/${budget.id}`, { method: 'DELETE' })

    if (!response.ok) {
      const result = await response.json()
      toast({ title: 'Fel', description: result.error, variant: 'destructive' })
    } else {
      toast({ title: 'Borttaget', description: `${budget.name} har tagits bort` })
      fetchBudgets()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Budget</h1>
          <p className="text-muted-foreground">
            Skapa och hantera budgetar för dina räkenskapsperioder
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Skapa ny budget
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-4 w-4" />
            Budgetar ({budgets.length})
          </CardTitle>
          <CardDescription>
            Klicka pa en budget for att redigera
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : budgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Calculator className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">Inga budgetar</p>
              <p className="text-sm">Skapa din första budget</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Namn</TableHead>
                  <TableHead>Räkenskapsperiod</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Poster</TableHead>
                  <TableHead className="text-right">Åtgärder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {budgets.map(budget => {
                  const fp = budget.fiscal_period as { name?: string; period_start?: string; period_end?: string } | null
                  return (
                    <TableRow key={budget.id}>
                      <TableCell>
                        <Link href={`/budgets/${budget.id}`} className="font-medium hover:underline">
                          {budget.name}
                        </Link>
                        {budget.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{budget.description}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {fp?.name || '-'}
                        {fp?.period_start && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({fp.period_start} - {fp.period_end})
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant[budget.status]}>
                          {BUDGET_STATUS_LABELS[budget.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {budget.entries_count || 0}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/budgets/${budget.id}`}>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                          <Link href={`/budgets/${budget.id}/report`}>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Budget vs Utfall">
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                          {budget.status !== 'locked' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(budget)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Skapa ny budget</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="budget-name">Namn</Label>
              <Input
                id="budget-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Budget 2025"
              />
            </div>

            <div className="space-y-2">
              <Label>Räkenskapsperiod</Label>
              <Select value={formFiscalPeriodId} onValueChange={setFormFiscalPeriodId}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj period" />
                </SelectTrigger>
                <SelectContent>
                  {fiscalPeriods.map(fp => (
                    <SelectItem key={fp.id} value={fp.id}>
                      {fp.name} ({fp.period_start} - {fp.period_end})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="budget-desc">Beskrivning</Label>
              <Input
                id="budget-desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Valfri beskrivning"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={handleCreate} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Skapa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
