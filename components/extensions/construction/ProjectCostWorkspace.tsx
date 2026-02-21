'use client'

import { useState, useMemo } from 'react'
import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import { useExtensionData } from '@/lib/extensions/use-extension-data'
import KPICard from '@/components/extensions/shared/KPICard'
import ExtensionLoadingSkeleton from '@/components/extensions/shared/ExtensionLoadingSkeleton'
import ConfirmDeleteDialog from '@/components/extensions/shared/ConfirmDeleteDialog'
import EditEntryDialog from '@/components/extensions/shared/EditEntryDialog'
import DateRangeFilter from '@/components/extensions/shared/DateRangeFilter'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Pencil, Plus, ChevronDown, ChevronUp, Trash2, AlertTriangle, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Project {
  id: string
  name: string
  budget: number
  status: 'active' | 'completed'
  startDate: string
}

interface CostEntry {
  id: string
  projectId: string
  description: string
  amount: number
  date: string
  category: string
}

interface RevenueEntry {
  id: string
  projectId: string
  description: string
  amount: number
  date: string
}

const COST_CATEGORIES = ['Material', 'Arbetskraft', 'Underentreprenor', 'Maskiner', 'Ovrigt']

function getBudgetStatus(totalCost: number, budget: number): 'ok' | 'warning' | 'danger' {
  if (budget <= 0) return 'ok'
  const ratio = totalCost / budget
  if (ratio >= 1) return 'danger'
  if (ratio >= 0.8) return 'warning'
  return 'ok'
}

function getProgressColor(status: 'ok' | 'warning' | 'danger'): string {
  switch (status) {
    case 'danger': return '[&>div]:bg-red-500'
    case 'warning': return '[&>div]:bg-amber-500'
    default: return ''
  }
}

export default function ProjectCostWorkspace({}: WorkspaceComponentProps) {
  const { data, save, remove, refresh, isLoading } = useExtensionData('construction', 'project-cost')

  // --- Date range filter ---
  const now = new Date()
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null)

  // --- Parse data ---
  const projects = useMemo(() =>
    data.filter(d => d.key.startsWith('project:'))
      .map(d => ({ id: d.key.replace('project:', ''), ...(d.value as Omit<Project, 'id'>) }))
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
  , [data])

  const allCosts = useMemo(() =>
    data.filter(d => d.key.startsWith('cost:'))
      .map(d => ({ id: d.key.replace('cost:', ''), ...(d.value as Omit<CostEntry, 'id'>) }))
      .sort((a, b) => b.date.localeCompare(a.date))
  , [data])

  const allRevenues = useMemo(() =>
    data.filter(d => d.key.startsWith('revenue:'))
      .map(d => ({ id: d.key.replace('revenue:', ''), ...(d.value as Omit<RevenueEntry, 'id'>) }))
      .sort((a, b) => b.date.localeCompare(a.date))
  , [data])

  // Filtered costs/revenues based on date range
  const costs = useMemo(() => {
    if (!dateRange) return allCosts
    return allCosts.filter(c => c.date >= dateRange.start && c.date <= dateRange.end)
  }, [allCosts, dateRange])

  const revenues = useMemo(() => {
    if (!dateRange) return allRevenues
    return allRevenues.filter(r => r.date >= dateRange.start && r.date <= dateRange.end)
  }, [allRevenues, dateRange])

  // --- UI state ---
  const [expandedProject, setExpandedProject] = useState<string | null>(null)
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectBudget, setNewProjectBudget] = useState('')

  // Cost/Revenue entry forms
  const [costDesc, setCostDesc] = useState('')
  const [costAmount, setCostAmount] = useState('')
  const [costCategory, setCostCategory] = useState(COST_CATEGORIES[0])
  const [revDesc, setRevDesc] = useState('')
  const [revAmount, setRevAmount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'cost' | 'revenue' | 'project'
    id: string
    label: string
  } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Edit cost/revenue entry state
  const [editEntry, setEditEntry] = useState<{
    type: 'cost' | 'revenue'
    id: string
    projectId: string
    description: string
    amount: string
    date: string
    category?: string
  } | null>(null)
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // Edit project state
  const [editProject, setEditProject] = useState<{
    id: string
    name: string
    budget: string
  } | null>(null)
  const [isSavingProject, setIsSavingProject] = useState(false)

  // Complete project confirmation state
  const [completeProjectId, setCompleteProjectId] = useState<string | null>(null)

  // --- Computed stats ---
  const projectStats = useMemo(() => {
    return projects.map(p => {
      const projectCosts = costs.filter(c => c.projectId === p.id)
      const projectRevenues = revenues.filter(r => r.projectId === p.id)
      const totalCost = projectCosts.reduce((s, c) => s + c.amount, 0)
      const totalRevenue = projectRevenues.reduce((s, r) => s + r.amount, 0)
      const margin = totalRevenue > 0 ? Math.round(((totalRevenue - totalCost) / totalRevenue) * 100) : 0
      const budgetUsed = p.budget > 0 ? Math.round((totalCost / p.budget) * 100) : 0
      const budgetStatus = getBudgetStatus(totalCost, p.budget)

      // Cost category breakdown
      const categoryTotals = COST_CATEGORIES.map(cat => {
        const catTotal = projectCosts
          .filter(c => c.category === cat)
          .reduce((s, c) => s + c.amount, 0)
        return {
          category: cat,
          total: catTotal,
          pct: totalCost > 0 ? Math.round((catTotal / totalCost) * 100) : 0,
        }
      }).filter(ct => ct.total > 0)

      return {
        ...p,
        totalCost,
        totalRevenue,
        margin,
        budgetUsed,
        budgetStatus,
        costs: projectCosts,
        revenues: projectRevenues,
        categoryTotals,
      }
    })
  }, [projects, costs, revenues])

  const activeProjects = projectStats.filter(p => p.status === 'active')
  const completedProjects = projectStats.filter(p => p.status === 'completed')
  const totalRevenue = projectStats.reduce((s, p) => s + p.totalRevenue, 0)
  const totalCosts = projectStats.reduce((s, p) => s + p.totalCost, 0)
  const avgMargin = totalRevenue > 0 ? Math.round(((totalRevenue - totalCosts) / totalRevenue) * 100) : 0

  // --- Handlers ---
  const handleAddProject = async () => {
    if (!newProjectName.trim()) return
    const id = crypto.randomUUID()
    await save(`project:${id}`, {
      name: newProjectName.trim(),
      budget: Math.round((parseFloat(newProjectBudget) || 0) * 100) / 100,
      status: 'active',
      startDate: new Date().toISOString().slice(0, 10),
    })
    setNewProjectName('')
    setNewProjectBudget('')
    setShowNewProject(false)
    await refresh()
  }

  const handleAddCost = async (projectId: string) => {
    const amt = parseFloat(costAmount)
    if (isNaN(amt) || amt <= 0) return
    setIsSubmitting(true)
    const id = crypto.randomUUID()
    await save(`cost:${id}`, {
      projectId,
      description: costDesc,
      amount: Math.round(amt * 100) / 100,
      date: new Date().toISOString().slice(0, 10),
      category: costCategory,
    })
    setCostDesc('')
    setCostAmount('')
    await refresh()
    setIsSubmitting(false)
  }

  const handleAddRevenue = async (projectId: string) => {
    const amt = parseFloat(revAmount)
    if (isNaN(amt) || amt <= 0) return
    setIsSubmitting(true)
    const id = crypto.randomUUID()
    await save(`revenue:${id}`, {
      projectId,
      description: revDesc,
      amount: Math.round(amt * 100) / 100,
      date: new Date().toISOString().slice(0, 10),
    })
    setRevDesc('')
    setRevAmount('')
    await refresh()
    setIsSubmitting(false)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    if (deleteTarget.type === 'project') {
      // Delete all costs and revenues for the project, then the project itself
      const projectCosts = allCosts.filter(c => c.projectId === deleteTarget.id)
      const projectRevenues = allRevenues.filter(r => r.projectId === deleteTarget.id)
      for (const c of projectCosts) {
        await remove(`cost:${c.id}`)
      }
      for (const r of projectRevenues) {
        await remove(`revenue:${r.id}`)
      }
      await remove(`project:${deleteTarget.id}`)
    } else if (deleteTarget.type === 'cost') {
      await remove(`cost:${deleteTarget.id}`)
    } else {
      await remove(`revenue:${deleteTarget.id}`)
    }
    await refresh()
    setIsDeleting(false)
    setDeleteTarget(null)
  }

  const handleSaveEditEntry = async () => {
    if (!editEntry) return
    const amt = parseFloat(editEntry.amount)
    if (isNaN(amt) || amt <= 0) return
    setIsSavingEdit(true)
    if (editEntry.type === 'cost') {
      await save(`cost:${editEntry.id}`, {
        projectId: editEntry.projectId,
        description: editEntry.description,
        amount: Math.round(amt * 100) / 100,
        date: editEntry.date,
        category: editEntry.category || COST_CATEGORIES[0],
      })
    } else {
      await save(`revenue:${editEntry.id}`, {
        projectId: editEntry.projectId,
        description: editEntry.description,
        amount: Math.round(amt * 100) / 100,
        date: editEntry.date,
      })
    }
    await refresh()
    setIsSavingEdit(false)
    setEditEntry(null)
  }

  const handleSaveEditProject = async () => {
    if (!editProject) return
    const project = projects.find(p => p.id === editProject.id)
    if (!project) return
    setIsSavingProject(true)
    await save(`project:${editProject.id}`, {
      name: editProject.name.trim(),
      budget: Math.round((parseFloat(editProject.budget) || 0) * 100) / 100,
      status: project.status,
      startDate: project.startDate,
    })
    await refresh()
    setIsSavingProject(false)
    setEditProject(null)
  }

  const handleCompleteProject = async () => {
    if (!completeProjectId) return
    const project = projects.find(p => p.id === completeProjectId)
    if (!project) return
    await save(`project:${completeProjectId}`, {
      name: project.name,
      budget: project.budget,
      status: 'completed' as const,
      startDate: project.startDate,
    })
    await refresh()
    setCompleteProjectId(null)
  }

  if (isLoading) return <ExtensionLoadingSkeleton />

  // --- Render helper for budget alert banner ---
  const renderBudgetAlert = (p: (typeof projectStats)[number]) => {
    if (p.budget <= 0) return null
    if (p.budgetStatus === 'danger') {
      return (
        <div className="flex items-center gap-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Kostnaden overskrider budgeten ({p.budgetUsed}% anvant)</span>
        </div>
      )
    }
    if (p.budgetStatus === 'warning') {
      return (
        <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Budgetvarning: {p.budgetUsed}% av budgeten anvand</span>
        </div>
      )
    }
    return null
  }

  // --- Render helper for category breakdown ---
  const renderCategoryBreakdown = (categoryTotals: { category: string; total: number; pct: number }[]) => {
    if (categoryTotals.length === 0) return null
    return (
      <div>
        <h4 className="text-sm font-medium mb-2">Kostnadsfordelning per kategori</h4>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kategori</TableHead>
                <TableHead className="text-right">Belopp</TableHead>
                <TableHead className="text-right">Andel</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categoryTotals.map(ct => (
                <TableRow key={ct.category}>
                  <TableCell className="font-medium">{ct.category}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {ct.total.toLocaleString('sv-SE')} kr
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{ct.pct}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  // --- Render project card for the Projects tab ---
  const renderProjectCard = (p: (typeof projectStats)[number]) => {
    const isExpanded = expandedProject === p.id
    return (
      <Card key={p.id}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div
              className="flex items-center gap-2 cursor-pointer flex-1"
              onClick={() => setExpandedProject(isExpanded ? null : p.id)}
            >
              <CardTitle className="text-base flex items-center gap-2">
                {p.name}
                <Badge variant={p.status === 'active' ? 'default' : 'secondary'}>
                  {p.status === 'active' ? 'Aktiv' : 'Avslutad'}
                </Badge>
              </CardTitle>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  setEditProject({
                    id: p.id,
                    name: p.name,
                    budget: String(p.budget),
                  })
                }}
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  setDeleteTarget({ type: 'project', id: p.id, label: p.name })
                }}
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
              <div
                className="cursor-pointer p-1"
                onClick={() => setExpandedProject(isExpanded ? null : p.id)}
              >
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>
          </div>
        </CardHeader>
        {isExpanded && (
          <CardContent className="space-y-4">
            {/* Budget alert banner */}
            {renderBudgetAlert(p)}

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Kostnad</p>
                <p className="font-semibold tabular-nums">{p.totalCost.toLocaleString('sv-SE')} kr</p>
              </div>
              <div>
                <p className="text-muted-foreground">Intakt</p>
                <p className="font-semibold tabular-nums">{p.totalRevenue.toLocaleString('sv-SE')} kr</p>
              </div>
              <div>
                <p className="text-muted-foreground">Marginal</p>
                <p className="font-semibold tabular-nums">{p.margin}%</p>
              </div>
            </div>

            {/* Budget progress */}
            {p.budget > 0 && (
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Budget anvand</span>
                  <span>{p.budgetUsed}% av {p.budget.toLocaleString('sv-SE')} kr</span>
                </div>
                <Progress
                  value={Math.min(p.budgetUsed, 100)}
                  className={cn('h-2', getProgressColor(p.budgetStatus))}
                />
              </div>
            )}

            {/* Category breakdown */}
            {renderCategoryBreakdown(p.categoryTotals)}

            {/* Cost entries */}
            <div>
              <h4 className="text-sm font-medium mb-2">Kostnader</h4>
              <div className="flex gap-2 mb-2 flex-wrap">
                <Input placeholder="Beskrivning" value={costDesc} onChange={e => setCostDesc(e.target.value)} className="max-w-xs" />
                <Input type="number" placeholder="Belopp" value={costAmount} onChange={e => setCostAmount(e.target.value)} className="w-28" />
                <Select value={costCategory} onValueChange={setCostCategory}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COST_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={() => handleAddCost(p.id)} disabled={isSubmitting}>Lagg till</Button>
              </div>
              {p.costs.length > 0 && (
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Datum</TableHead>
                        <TableHead>Beskrivning</TableHead>
                        <TableHead>Kategori</TableHead>
                        <TableHead className="text-right">Belopp</TableHead>
                        <TableHead className="w-20"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {p.costs.map(c => (
                        <TableRow key={c.id}>
                          <TableCell>{c.date}</TableCell>
                          <TableCell>{c.description}</TableCell>
                          <TableCell>{c.category}</TableCell>
                          <TableCell className="text-right tabular-nums">{c.amount.toLocaleString('sv-SE')} kr</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-0.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditEntry({
                                  type: 'cost',
                                  id: c.id,
                                  projectId: c.projectId,
                                  description: c.description,
                                  amount: String(c.amount),
                                  date: c.date,
                                  category: c.category,
                                })}
                              >
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteTarget({
                                  type: 'cost',
                                  id: c.id,
                                  label: c.description || 'kostnad',
                                })}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Revenue entries */}
            <div>
              <h4 className="text-sm font-medium mb-2">Intakter</h4>
              <div className="flex gap-2 mb-2 flex-wrap">
                <Input placeholder="Beskrivning" value={revDesc} onChange={e => setRevDesc(e.target.value)} className="max-w-xs" />
                <Input type="number" placeholder="Belopp" value={revAmount} onChange={e => setRevAmount(e.target.value)} className="w-28" />
                <Button size="sm" onClick={() => handleAddRevenue(p.id)} disabled={isSubmitting}>Lagg till</Button>
              </div>
              {p.revenues.length > 0 && (
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Datum</TableHead>
                        <TableHead>Beskrivning</TableHead>
                        <TableHead className="text-right">Belopp</TableHead>
                        <TableHead className="w-20"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {p.revenues.map(r => (
                        <TableRow key={r.id}>
                          <TableCell>{r.date}</TableCell>
                          <TableCell>{r.description}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.amount.toLocaleString('sv-SE')} kr</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-0.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditEntry({
                                  type: 'revenue',
                                  id: r.id,
                                  projectId: r.projectId,
                                  description: r.description,
                                  amount: String(r.amount),
                                  date: r.date,
                                })}
                              >
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteTarget({
                                  type: 'revenue',
                                  id: r.id,
                                  label: r.description || 'intakt',
                                })}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Complete project button (active only) */}
            {p.status === 'active' && (
              <div className="pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCompleteProjectId(p.id)}
                  className="text-green-700 dark:text-green-400 border-green-300 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-950/30"
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Avsluta projekt
                </Button>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Oversikt</TabsTrigger>
          <TabsTrigger value="projects">Projekt</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          <DateRangeFilter onRangeChange={(start, end) => setDateRange({ start, end })} />

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <KPICard label="Aktiva projekt" value={activeProjects.length} />
            <KPICard label="Total intakt" value={totalRevenue.toLocaleString('sv-SE')} suffix="kr" />
            <KPICard label="Total kostnad" value={totalCosts.toLocaleString('sv-SE')} suffix="kr" />
            <KPICard label="Snittmarginal" value={avgMargin} suffix="%" />
          </div>

          {/* Active projects */}
          {activeProjects.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Aktiva projekt</h3>
              {activeProjects.map(p => (
                <Card key={p.id}>
                  <CardContent className="pt-4">
                    {/* Budget alert */}
                    {renderBudgetAlert(p)}

                    <div className="flex items-center justify-between mb-2 mt-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{p.name}</p>
                        <Badge variant="default">Aktiv</Badge>
                      </div>
                      <div className="text-right text-sm">
                        <span className="text-muted-foreground">Marginal: </span>
                        <span className="font-medium tabular-nums">{p.margin}%</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                      <span>Kostnad: {p.totalCost.toLocaleString('sv-SE')} kr</span>
                      <span>Intakt: {p.totalRevenue.toLocaleString('sv-SE')} kr</span>
                      {p.budget > 0 && <span>Budget: {p.budget.toLocaleString('sv-SE')} kr</span>}
                    </div>
                    {p.budget > 0 && (
                      <Progress
                        value={Math.min(p.budgetUsed, 100)}
                        className={cn('h-2', getProgressColor(p.budgetStatus))}
                      />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Completed projects */}
          {completedProjects.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Avslutade projekt</h3>
              {completedProjects.map(p => (
                <Card key={p.id} className="border-muted">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{p.name}</p>
                        <Badge variant="secondary">Avslutad</Badge>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          'text-lg font-bold tabular-nums',
                          p.margin >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                        )}>
                          {p.margin}% marginal
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Kostnad: {p.totalCost.toLocaleString('sv-SE')} kr</span>
                      <span>Intakt: {p.totalRevenue.toLocaleString('sv-SE')} kr</span>
                      <span>Resultat: {(Math.round((p.totalRevenue - p.totalCost) * 100) / 100).toLocaleString('sv-SE')} kr</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="projects" className="space-y-6 mt-4">
          {!showNewProject ? (
            <Button size="sm" variant="outline" onClick={() => setShowNewProject(true)}>
              <Plus className="h-4 w-4 mr-1" /> Nytt projekt
            </Button>
          ) : (
            <Card>
              <CardContent className="pt-4">
                <div className="flex gap-2 flex-wrap">
                  <Input placeholder="Projektnamn" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} className="max-w-xs" />
                  <Input type="number" placeholder="Budget (kr)" value={newProjectBudget} onChange={e => setNewProjectBudget(e.target.value)} className="max-w-xs" />
                  <Button size="sm" onClick={handleAddProject} disabled={!newProjectName.trim()}>Skapa</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowNewProject(false)}>Avbryt</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeProjects.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Aktiva projekt</h3>
              {activeProjects.map(p => renderProjectCard(p))}
            </div>
          )}

          {completedProjects.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground">Avslutade projekt</h3>
              {completedProjects.map(p => renderProjectCard(p))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete confirmation dialog */}
      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title={
          deleteTarget?.type === 'project'
            ? 'Ta bort projekt'
            : deleteTarget?.type === 'cost'
              ? 'Ta bort kostnad'
              : 'Ta bort intakt'
        }
        description={
          deleteTarget?.type === 'project'
            ? `Vill du ta bort projektet "${deleteTarget?.label}"? Alla kostnader och intakter kopplade till projektet tas ocksa bort. Atgarden kan inte angras.`
            : `Vill du ta bort "${deleteTarget?.label}"? Atgarden kan inte angras.`
        }
        onConfirm={handleDelete}
        isDeleting={isDeleting}
      />

      {/* Edit cost/revenue entry dialog */}
      <EditEntryDialog
        open={editEntry !== null}
        onOpenChange={(open) => { if (!open) setEditEntry(null) }}
        title={editEntry?.type === 'cost' ? 'Redigera kostnad' : 'Redigera intakt'}
        description="Andra uppgifterna och klicka Spara."
        onSave={handleSaveEditEntry}
        isSaving={isSavingEdit}
      >
        {editEntry && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-desc">Beskrivning</Label>
              <Input
                id="edit-desc"
                value={editEntry.description}
                onChange={e => setEditEntry({ ...editEntry, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-amount">Belopp (kr)</Label>
              <Input
                id="edit-amount"
                type="number"
                value={editEntry.amount}
                onChange={e => setEditEntry({ ...editEntry, amount: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-date">Datum</Label>
              <Input
                id="edit-date"
                type="date"
                value={editEntry.date}
                onChange={e => setEditEntry({ ...editEntry, date: e.target.value })}
              />
            </div>
            {editEntry.type === 'cost' && (
              <div className="space-y-2">
                <Label>Kategori</Label>
                <Select
                  value={editEntry.category || COST_CATEGORIES[0]}
                  onValueChange={val => setEditEntry({ ...editEntry, category: val })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COST_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}
      </EditEntryDialog>

      {/* Edit project dialog */}
      <EditEntryDialog
        open={editProject !== null}
        onOpenChange={(open) => { if (!open) setEditProject(null) }}
        title="Redigera projekt"
        description="Andra projektnamn och budget."
        onSave={handleSaveEditProject}
        isSaving={isSavingProject}
      >
        {editProject && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-proj-name">Projektnamn</Label>
              <Input
                id="edit-proj-name"
                value={editProject.name}
                onChange={e => setEditProject({ ...editProject, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-proj-budget">Budget (kr)</Label>
              <Input
                id="edit-proj-budget"
                type="number"
                value={editProject.budget}
                onChange={e => setEditProject({ ...editProject, budget: e.target.value })}
              />
            </div>
          </div>
        )}
      </EditEntryDialog>

      {/* Complete project confirmation dialog */}
      <ConfirmDeleteDialog
        open={completeProjectId !== null}
        onOpenChange={(open) => { if (!open) setCompleteProjectId(null) }}
        title="Avsluta projekt"
        description={`Vill du markera projektet som avslutat? Projektet flyttas till "Avslutade" och kan inte ateraktiveras.`}
        onConfirm={handleCompleteProject}
      />
    </div>
  )
}
