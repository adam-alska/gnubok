'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { ArrowLeft, Plus, Lock, Unlock, BarChart3, Loader2, Copy } from 'lucide-react'
import Link from 'next/link'
import BudgetSpreadsheet from '@/components/budget/BudgetSpreadsheet'
import { BUDGET_STATUS_LABELS } from '@/types/budget-costcenters'
import type { Budget, BudgetEntry, BudgetStatus, CostCenter, Project } from '@/types/budget-costcenters'
import type { FiscalPeriod, BASAccount } from '@/types'

const statusBadgeVariant: Record<BudgetStatus, 'default' | 'success' | 'secondary' | 'destructive' | 'warning'> = {
  draft: 'secondary',
  active: 'default',
  locked: 'warning',
}

export default function BudgetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: budgetId } = use(params)
  const [budget, setBudget] = useState<Budget | null>(null)
  const [entries, setEntries] = useState<BudgetEntry[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [accounts, setAccounts] = useState<BASAccount[]>([])
  const [fiscalPeriods, setFiscalPeriods] = useState<FiscalPeriod[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Filters
  const [filterCostCenter, setFilterCostCenter] = useState<string>('all')
  const [filterProject, setFilterProject] = useState<string>('all')

  // Add entry dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addAccountNumber, setAddAccountNumber] = useState('')
  const [addCostCenterId, setAddCostCenterId] = useState('')
  const [addProjectId, setAddProjectId] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  // Copy from actual dialog
  const [copyDialogOpen, setCopyDialogOpen] = useState(false)
  const [copySourcePeriodId, setCopySourcePeriodId] = useState('')
  const [copyAdjustment, setCopyAdjustment] = useState('0')
  const [isCopying, setIsCopying] = useState(false)

  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    fetchAll()
  }, [budgetId])

  async function fetchAll() {
    setIsLoading(true)
    await Promise.all([
      fetchBudget(),
      fetchEntries(),
      fetchCostCenters(),
      fetchProjects(),
      fetchAccounts(),
      fetchFiscalPeriods(),
    ])
    setIsLoading(false)
  }

  async function fetchBudget() {
    const response = await fetch(`/api/budgets/${budgetId}`)
    if (response.ok) {
      const result = await response.json()
      setBudget(result.data)
    }
  }

  async function fetchEntries() {
    const params = new URLSearchParams()
    if (filterCostCenter !== 'all') params.set('cost_center_id', filterCostCenter)
    if (filterProject !== 'all') params.set('project_id', filterProject)

    const response = await fetch(`/api/budgets/${budgetId}/entries?${params}`)
    if (response.ok) {
      const result = await response.json()
      setEntries(result.data || [])
    }
  }

  async function fetchCostCenters() {
    const { data } = await supabase
      .from('cost_centers')
      .select('*')
      .eq('is_active', true)
      .order('code')

    setCostCenters(data || [])
  }

  async function fetchProjects() {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('is_active', true)
      .order('project_number')

    setProjects(data || [])
  }

  async function fetchAccounts() {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .eq('is_active', true)
      .gte('account_class', 3)
      .lte('account_class', 8)
      .order('account_number')

    setAccounts(data || [])
  }

  async function fetchFiscalPeriods() {
    const { data } = await supabase
      .from('fiscal_periods')
      .select('*')
      .order('period_start', { ascending: false })

    setFiscalPeriods(data || [])
  }

  // Re-fetch entries when filters change
  useEffect(() => {
    if (!isLoading) {
      fetchEntries()
    }
  }, [filterCostCenter, filterProject])

  async function handleSave(entriesToSave: Array<{ id: string; [key: string]: unknown }>) {
    const response = await fetch(`/api/budgets/${budgetId}/entries`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: entriesToSave }),
    })

    if (!response.ok) {
      throw new Error('Kunde inte spara')
    }
  }

  async function handleAddEntry() {
    if (!addAccountNumber) {
      toast({ title: 'Fel', description: 'Välj ett konto', variant: 'destructive' })
      return
    }

    setIsAdding(true)

    const response = await fetch(`/api/budgets/${budgetId}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_number: addAccountNumber,
        cost_center_id: addCostCenterId || null,
        project_id: addProjectId || null,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      toast({ title: 'Fel', description: result.error, variant: 'destructive' })
    } else {
      toast({ title: 'Rad tillagd', description: `Konto ${addAccountNumber} har lagts till` })
      setAddDialogOpen(false)
      setAddAccountNumber('')
      setAddCostCenterId('')
      setAddProjectId('')
      fetchEntries()
    }

    setIsAdding(false)
  }

  async function handleToggleLock() {
    if (!budget) return
    const newStatus = budget.status === 'locked' ? 'active' : 'locked'

    const response = await fetch(`/api/budgets/${budgetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })

    if (response.ok) {
      const result = await response.json()
      setBudget(result.data)
      toast({
        title: newStatus === 'locked' ? 'Budget låst' : 'Budget upplåst',
        description: newStatus === 'locked'
          ? 'Budgeten kan inte längre redigeras'
          : 'Budgeten kan nu redigeras',
      })
    }
  }

  async function handleCopyFromActual() {
    if (!copySourcePeriodId) {
      toast({ title: 'Fel', description: 'Välj en källperiod', variant: 'destructive' })
      return
    }

    setIsCopying(true)

    const response = await fetch(`/api/budgets/${budgetId}/copy-from-actual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_fiscal_period_id: copySourcePeriodId,
        adjustment_percent: parseFloat(copyAdjustment) || 0,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      toast({ title: 'Fel', description: result.error, variant: 'destructive' })
    } else {
      toast({ title: 'Kopierat', description: result.message })
      setCopyDialogOpen(false)
      fetchEntries()
    }

    setIsCopying(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!budget) {
    return (
      <div className="space-y-4">
        <Link href="/budgets" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Tillbaka
        </Link>
        <p>Budgeten hittades inte.</p>
      </div>
    )
  }

  const isLocked = budget.status === 'locked'
  const fp = budget.fiscal_period as { name?: string; period_start?: string; period_end?: string } | null

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/budgets" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Alla budgetar
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold tracking-tight">{budget.name}</h1>
            <Badge variant={statusBadgeVariant[budget.status]}>
              {BUDGET_STATUS_LABELS[budget.status]}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {fp?.name || 'Okänd period'}
            {fp?.period_start && ` (${fp.period_start} - ${fp.period_end})`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isLocked && (
            <Button variant="outline" size="sm" onClick={() => setCopyDialogOpen(true)}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Kopiera fran utfall
            </Button>
          )}
          <Link href={`/budgets/${budgetId}/report`}>
            <Button variant="outline" size="sm">
              <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
              Budget vs Utfall
            </Button>
          </Link>
          <Button
            variant={isLocked ? 'default' : 'outline'}
            size="sm"
            onClick={handleToggleLock}
          >
            {isLocked ? (
              <><Unlock className="mr-1.5 h-3.5 w-3.5" /> Las upp</>
            ) : (
              <><Lock className="mr-1.5 h-3.5 w-3.5" /> Las</>
            )}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Kostnadsställe</Label>
          <Select value={filterCostCenter} onValueChange={setFilterCostCenter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Alla" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla kostnadsställen</SelectItem>
              {costCenters.map(cc => (
                <SelectItem key={cc.id} value={cc.id}>{cc.code} - {cc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Projekt</Label>
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Alla" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla projekt</SelectItem>
              {projects.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.project_number} - {p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Spreadsheet */}
      <BudgetSpreadsheet
        budgetId={budgetId}
        entries={entries}
        isLocked={isLocked}
        onSave={handleSave}
        onAddEntry={!isLocked ? () => setAddDialogOpen(true) : undefined}
      />

      {/* Add entry dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ny budgetrad</DialogTitle>
            <DialogDescription>Välj konto att lägga till i budgeten</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Konto</Label>
              <Select value={addAccountNumber} onValueChange={setAddAccountNumber}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj konto" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map(a => (
                    <SelectItem key={a.account_number} value={a.account_number}>
                      {a.account_number} - {a.account_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Kostnadsställe (valfritt)</Label>
              <Select value={addCostCenterId || '__none__'} onValueChange={(v) => setAddCostCenterId(v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Inget" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Inget</SelectItem>
                  {costCenters.map(cc => (
                    <SelectItem key={cc.id} value={cc.id}>{cc.code} - {cc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Projekt (valfritt)</Label>
              <Select value={addProjectId || '__none__'} onValueChange={(v) => setAddProjectId(v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Inget" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Inget</SelectItem>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.project_number} - {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleAddEntry} disabled={isAdding}>
              {isAdding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Lägg till
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy from actual dialog */}
      <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Kopiera fran föregaende ars utfall</DialogTitle>
            <DialogDescription>
              Skapa budgetposter baserat pa verkligt utfall fran en tidigare period
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Källperiod</Label>
              <Select value={copySourcePeriodId} onValueChange={setCopySourcePeriodId}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj period" />
                </SelectTrigger>
                <SelectContent>
                  {fiscalPeriods
                    .filter(fp => fp.id !== budget?.fiscal_period_id)
                    .map(fp => (
                      <SelectItem key={fp.id} value={fp.id}>
                        {fp.name} ({fp.period_start} - {fp.period_end})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="copy-adjustment">Justering (%)</Label>
              <Input
                id="copy-adjustment"
                type="number"
                value={copyAdjustment}
                onChange={(e) => setCopyAdjustment(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                Positivt tal ökar budgeten, negativt minskar. T.ex. 5 = 5% ökning.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleCopyFromActual} disabled={isCopying}>
              {isCopying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Kopiera
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
