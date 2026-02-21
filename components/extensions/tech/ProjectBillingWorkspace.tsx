'use client'

import { useState, useMemo } from 'react'
import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import { useExtensionData } from '@/lib/extensions/use-extension-data'
import KPICard from '@/components/extensions/shared/KPICard'
import ExtensionLoadingSkeleton from '@/components/extensions/shared/ExtensionLoadingSkeleton'
import ConfirmDeleteDialog from '@/components/extensions/shared/ConfirmDeleteDialog'
import EditEntryDialog from '@/components/extensions/shared/EditEntryDialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Pencil, Plus, ChevronDown, ChevronUp, Trash2, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Project {
  id: string
  name: string
  budget: number
  status: 'active' | 'completed'
  startDate: string
}

interface BillingEntry {
  id: string
  projectId: string
  description: string
  amount: number
  date: string
  invoiced: boolean
}

const COST_CATEGORIES = ['Lon', 'Material', 'Licenser', 'Ovrigt'] as const
type CostCategory = typeof COST_CATEGORIES[number]

interface CostEntry {
  id: string
  projectId: string
  description: string
  amount: number
  date: string
  category: CostCategory
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProjectBillingWorkspace({}: WorkspaceComponentProps) {
  const { data, save, remove, refresh, isLoading } = useExtensionData('tech', 'project-billing')

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const projects = useMemo(() =>
    data.filter(d => d.key.startsWith('project:'))
      .map(d => ({ id: d.key.replace('project:', ''), ...(d.value as Omit<Project, 'id'>) }))
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
  , [data])

  const billings = useMemo(() =>
    data.filter(d => d.key.startsWith('billing:'))
      .map(d => ({ id: d.key.replace('billing:', ''), ...(d.value as Omit<BillingEntry, 'id'>) }))
      .sort((a, b) => b.date.localeCompare(a.date))
  , [data])

  const costs = useMemo(() =>
    data.filter(d => d.key.startsWith('cost:'))
      .map(d => ({ id: d.key.replace('cost:', ''), ...(d.value as Omit<CostEntry, 'id'>) }))
      .sort((a, b) => b.date.localeCompare(a.date))
  , [data])

  // ---------------------------------------------------------------------------
  // UI state
  // ---------------------------------------------------------------------------

  const [expandedProject, setExpandedProject] = useState<string | null>(null)

  // New project dialog
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectBudget, setNewProjectBudget] = useState('')
  const [showNewProject, setShowNewProject] = useState(false)

  // Billing entry form (inline in expanded project)
  const [billingDesc, setBillingDesc] = useState('')
  const [billingAmount, setBillingAmount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Cost entry form (inline in expanded project)
  const [costDesc, setCostDesc] = useState('')
  const [costAmount, setCostAmount] = useState('')
  const [costCategory, setCostCategory] = useState<CostCategory>('Ovrigt')
  const [isSubmittingCost, setIsSubmittingCost] = useState(false)

  // Edit project dialog
  const [editProjectOpen, setEditProjectOpen] = useState(false)
  const [editProjectId, setEditProjectId] = useState<string | null>(null)
  const [editProjectName, setEditProjectName] = useState('')
  const [editProjectBudget, setEditProjectBudget] = useState('')
  const [isSavingProject, setIsSavingProject] = useState(false)

  // Edit billing dialog
  const [editBillingOpen, setEditBillingOpen] = useState(false)
  const [editBillingId, setEditBillingId] = useState<string | null>(null)
  const [editBillingDesc, setEditBillingDesc] = useState('')
  const [editBillingAmount, setEditBillingAmount] = useState('')
  const [isSavingBilling, setIsSavingBilling] = useState(false)

  // Edit cost dialog
  const [editCostOpen, setEditCostOpen] = useState(false)
  const [editCostId, setEditCostId] = useState<string | null>(null)
  const [editCostDesc, setEditCostDesc] = useState('')
  const [editCostAmount, setEditCostAmount] = useState('')
  const [editCostCategory, setEditCostCategory] = useState<CostCategory>('Ovrigt')
  const [isSavingCost, setIsSavingCost] = useState(false)

  // Delete dialogs
  const [deleteBillingOpen, setDeleteBillingOpen] = useState(false)
  const [deleteBillingId, setDeleteBillingId] = useState<string | null>(null)
  const [isDeletingBilling, setIsDeletingBilling] = useState(false)

  const [deleteCostOpen, setDeleteCostOpen] = useState(false)
  const [deleteCostId, setDeleteCostId] = useState<string | null>(null)
  const [isDeletingCost, setIsDeletingCost] = useState(false)

  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false)
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null)
  const [isDeletingProject, setIsDeletingProject] = useState(false)

  // Complete project dialog
  const [completeProjectOpen, setCompleteProjectOpen] = useState(false)
  const [completeProjectId, setCompleteProjectId] = useState<string | null>(null)

  // ---------------------------------------------------------------------------
  // Project stats with correct margin calculation
  // ---------------------------------------------------------------------------

  const projectStats = useMemo(() => {
    return projects.map(p => {
      const projectBillings = billings.filter(b => b.projectId === p.id)
      const projectCosts = costs.filter(c => c.projectId === p.id)
      const totalBilled = projectBillings.reduce((s, b) => s + b.amount, 0)
      const totalCosts = projectCosts.reduce((s, c) => s + c.amount, 0)
      const uninvoiced = projectBillings.filter(b => !b.invoiced).reduce((s, b) => s + b.amount, 0)
      const budgetRemaining = Math.max(Math.round((p.budget - totalBilled) * 100) / 100, 0)
      const budgetUsed = p.budget > 0 ? Math.min(Math.round((totalBilled / p.budget) * 100), 100) : 0
      // Correct margin: (revenue - costs) / revenue * 100
      const revenue = totalBilled
      const margin = revenue > 0 ? Math.round(((revenue - totalCosts) / revenue) * 100) : 0
      return {
        ...p,
        totalBilled,
        totalCosts,
        uninvoiced,
        budgetRemaining,
        budgetUsed,
        margin,
        billings: projectBillings,
        costs: projectCosts,
      }
    })
  }, [projects, billings, costs])

  const activeProjects = useMemo(() => projectStats.filter(p => p.status === 'active'), [projectStats])
  const completedProjects = useMemo(() => projectStats.filter(p => p.status === 'completed'), [projectStats])

  // ---------------------------------------------------------------------------
  // KPIs
  // ---------------------------------------------------------------------------

  const totalBilled = billings.reduce((s, b) => s + b.amount, 0)
  const totalCostsAll = costs.reduce((s, c) => s + c.amount, 0)
  const totalUninvoiced = billings.filter(b => !b.invoiced).reduce((s, b) => s + b.amount, 0)
  const avgMargin = activeProjects.length > 0
    ? Math.round(activeProjects.reduce((s, p) => s + p.margin, 0) / activeProjects.length)
    : 0
  const activeCount = activeProjects.length

  // ---------------------------------------------------------------------------
  // Handlers: Projects
  // ---------------------------------------------------------------------------

  const handleAddProject = async () => {
    if (!newProjectName.trim()) return
    const id = crypto.randomUUID()
    await save(`project:${id}`, {
      name: newProjectName.trim(),
      budget: parseFloat(newProjectBudget) || 0,
      status: 'active',
      startDate: new Date().toISOString().slice(0, 10),
    })
    setNewProjectName('')
    setNewProjectBudget('')
    setShowNewProject(false)
    await refresh()
  }

  const openEditProject = (p: Project) => {
    setEditProjectId(p.id)
    setEditProjectName(p.name)
    setEditProjectBudget(String(p.budget))
    setEditProjectOpen(true)
  }

  const handleSaveProject = async () => {
    if (!editProjectId || !editProjectName.trim()) return
    setIsSavingProject(true)
    const existing = projects.find(p => p.id === editProjectId)
    if (existing) {
      await save(`project:${editProjectId}`, {
        name: editProjectName.trim(),
        budget: parseFloat(editProjectBudget) || 0,
        status: existing.status,
        startDate: existing.startDate,
      })
      await refresh()
    }
    setIsSavingProject(false)
  }

  const handleCompleteProject = async () => {
    if (!completeProjectId) return
    const existing = projects.find(p => p.id === completeProjectId)
    if (existing) {
      await save(`project:${completeProjectId}`, {
        name: existing.name,
        budget: existing.budget,
        status: 'completed',
        startDate: existing.startDate,
      })
      await refresh()
    }
    setCompleteProjectOpen(false)
    setCompleteProjectId(null)
  }

  const handleDeleteProject = async () => {
    if (!deleteProjectId) return
    setIsDeletingProject(true)
    // Remove associated billings and costs
    const projBillings = billings.filter(b => b.projectId === deleteProjectId)
    const projCosts = costs.filter(c => c.projectId === deleteProjectId)
    for (const b of projBillings) {
      await remove(`billing:${b.id}`)
    }
    for (const c of projCosts) {
      await remove(`cost:${c.id}`)
    }
    await remove(`project:${deleteProjectId}`)
    await refresh()
    setIsDeletingProject(false)
    setDeleteProjectOpen(false)
    setDeleteProjectId(null)
    if (expandedProject === deleteProjectId) {
      setExpandedProject(null)
    }
  }

  // ---------------------------------------------------------------------------
  // Handlers: Billing entries
  // ---------------------------------------------------------------------------

  const handleAddBilling = async (projectId: string) => {
    const amt = parseFloat(billingAmount)
    if (isNaN(amt) || amt <= 0) return
    setIsSubmitting(true)
    const id = crypto.randomUUID()
    await save(`billing:${id}`, {
      projectId,
      description: billingDesc,
      amount: Math.round(amt * 100) / 100,
      date: new Date().toISOString().slice(0, 10),
      invoiced: false,
    })
    setBillingDesc('')
    setBillingAmount('')
    await refresh()
    setIsSubmitting(false)
  }

  const handleToggleInvoiced = async (b: BillingEntry) => {
    await save(`billing:${b.id}`, {
      projectId: b.projectId,
      description: b.description,
      amount: b.amount,
      date: b.date,
      invoiced: !b.invoiced,
    })
    await refresh()
  }

  const openEditBilling = (b: BillingEntry) => {
    setEditBillingId(b.id)
    setEditBillingDesc(b.description)
    setEditBillingAmount(String(b.amount))
    setEditBillingOpen(true)
  }

  const handleSaveBilling = async () => {
    if (!editBillingId) return
    setIsSavingBilling(true)
    const existing = billings.find(b => b.id === editBillingId)
    if (existing) {
      const amt = parseFloat(editBillingAmount)
      if (!isNaN(amt) && amt > 0) {
        await save(`billing:${editBillingId}`, {
          projectId: existing.projectId,
          description: editBillingDesc,
          amount: Math.round(amt * 100) / 100,
          date: existing.date,
          invoiced: existing.invoiced,
        })
        await refresh()
      }
    }
    setIsSavingBilling(false)
  }

  const handleDeleteBilling = async () => {
    if (!deleteBillingId) return
    setIsDeletingBilling(true)
    await remove(`billing:${deleteBillingId}`)
    await refresh()
    setIsDeletingBilling(false)
    setDeleteBillingOpen(false)
    setDeleteBillingId(null)
  }

  // ---------------------------------------------------------------------------
  // Handlers: Cost entries
  // ---------------------------------------------------------------------------

  const handleAddCost = async (projectId: string) => {
    const amt = parseFloat(costAmount)
    if (isNaN(amt) || amt <= 0) return
    setIsSubmittingCost(true)
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
    setCostCategory('Ovrigt')
    await refresh()
    setIsSubmittingCost(false)
  }

  const openEditCost = (c: CostEntry) => {
    setEditCostId(c.id)
    setEditCostDesc(c.description)
    setEditCostAmount(String(c.amount))
    setEditCostCategory(c.category)
    setEditCostOpen(true)
  }

  const handleSaveCost = async () => {
    if (!editCostId) return
    setIsSavingCost(true)
    const existing = costs.find(c => c.id === editCostId)
    if (existing) {
      const amt = parseFloat(editCostAmount)
      if (!isNaN(amt) && amt > 0) {
        await save(`cost:${editCostId}`, {
          projectId: existing.projectId,
          description: editCostDesc,
          amount: Math.round(amt * 100) / 100,
          date: existing.date,
          category: editCostCategory,
        })
        await refresh()
      }
    }
    setIsSavingCost(false)
  }

  const handleDeleteCost = async () => {
    if (!deleteCostId) return
    setIsDeletingCost(true)
    await remove(`cost:${deleteCostId}`)
    await refresh()
    setIsDeletingCost(false)
    setDeleteCostOpen(false)
    setDeleteCostId(null)
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  if (isLoading) return <ExtensionLoadingSkeleton />

  const formatKr = (v: number) => Math.round(v * 100) / 100

  /** Render a single project card (used for both active and completed) */
  const renderProjectCard = (p: typeof projectStats[number]) => {
    const isExpanded = expandedProject === p.id
    const isActive = p.status === 'active'

    return (
      <Card key={p.id} className={cn(!isActive && 'opacity-80')}>
        <CardHeader
          className="cursor-pointer pb-3"
          onClick={() => setExpandedProject(isExpanded ? null : p.id)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{p.name}</CardTitle>
              <Badge variant={isActive ? 'default' : 'secondary'}>
                {isActive ? 'Aktiv' : 'Avslutad'}
              </Badge>
              {isActive && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      openEditProject(p)
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteProjectId(p.id)
                      setDeleteProjectOpen(true)
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              {isActive && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={(e) => {
                    e.stopPropagation()
                    setCompleteProjectId(p.id)
                    setCompleteProjectOpen(true)
                  }}
                >
                  <CheckCircle className="h-3.5 w-3.5 mr-1" />
                  Avsluta
                </Button>
              )}
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>

          {/* Budget visualization */}
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Budget</span>
              <p className="font-medium tabular-nums">{p.budget.toLocaleString('sv-SE')} kr</p>
            </div>
            <div>
              <span className="text-muted-foreground">Fakturerat</span>
              <p className="font-medium tabular-nums">{formatKr(p.totalBilled).toLocaleString('sv-SE')} kr</p>
            </div>
            <div>
              <span className="text-muted-foreground">Kostnad</span>
              <p className="font-medium tabular-nums">{formatKr(p.totalCosts).toLocaleString('sv-SE')} kr</p>
            </div>
            <div>
              <span className="text-muted-foreground">Marginal</span>
              <p className={cn(
                'font-medium tabular-nums',
                p.margin >= 0 ? 'text-green-600' : 'text-red-600'
              )}>
                {p.margin}%
              </p>
            </div>
          </div>

          {p.budget > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Budgetanvandning</span>
                <span className="tabular-nums">{p.budgetUsed}% ({formatKr(p.budgetRemaining).toLocaleString('sv-SE')} kr kvar)</span>
              </div>
              <Progress value={p.budgetUsed} className="h-2" />
            </div>
          )}
        </CardHeader>

        {isExpanded && (
          <CardContent className="space-y-6">
            {/* ---- Billing section ---- */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Fakturering</h4>

              {isActive && (
                <div className="flex gap-2 flex-wrap">
                  <Input
                    placeholder="Beskrivning"
                    value={billingDesc}
                    onChange={e => setBillingDesc(e.target.value)}
                    className="max-w-xs"
                  />
                  <Input
                    type="number"
                    placeholder="Belopp (kr)"
                    value={billingAmount}
                    onChange={e => setBillingAmount(e.target.value)}
                    className="w-32"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleAddBilling(p.id)}
                    disabled={isSubmitting}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Faktureringsrad
                  </Button>
                </div>
              )}

              {p.billings.length > 0 && (
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">Fakt.</TableHead>
                        <TableHead>Datum</TableHead>
                        <TableHead>Beskrivning</TableHead>
                        <TableHead className="text-right">Belopp</TableHead>
                        <TableHead className="w-20"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {p.billings.map(b => (
                        <TableRow key={b.id} className={cn(b.invoiced && 'bg-muted/30')}>
                          <TableCell>
                            <Checkbox
                              checked={b.invoiced}
                              onCheckedChange={() => handleToggleInvoiced(b)}
                              aria-label="Markera som fakturerad"
                            />
                          </TableCell>
                          <TableCell className="tabular-nums">{b.date}</TableCell>
                          <TableCell>{b.description}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatKr(b.amount).toLocaleString('sv-SE')} kr
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-0.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => openEditBilling(b)}
                              >
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => {
                                  setDeleteBillingId(b.id)
                                  setDeleteBillingOpen(true)
                                }}
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

              {p.billings.length === 0 && (
                <p className="text-sm text-muted-foreground">Inga faktureringsrader annu.</p>
              )}
            </div>

            {/* ---- Cost section ---- */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Kostnader</h4>

              {isActive && (
                <div className="flex gap-2 flex-wrap">
                  <Input
                    placeholder="Beskrivning"
                    value={costDesc}
                    onChange={e => setCostDesc(e.target.value)}
                    className="max-w-xs"
                  />
                  <Input
                    type="number"
                    placeholder="Belopp (kr)"
                    value={costAmount}
                    onChange={e => setCostAmount(e.target.value)}
                    className="w-32"
                  />
                  <Select value={costCategory} onValueChange={(v) => setCostCategory(v as CostCategory)}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COST_CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={() => handleAddCost(p.id)}
                    disabled={isSubmittingCost}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Kostnad
                  </Button>
                </div>
              )}

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
                          <TableCell className="tabular-nums">{c.date}</TableCell>
                          <TableCell>{c.description}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{c.category}</Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatKr(c.amount).toLocaleString('sv-SE')} kr
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-0.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => openEditCost(c)}
                              >
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => {
                                  setDeleteCostId(c.id)
                                  setDeleteCostOpen(true)
                                }}
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

              {p.costs.length === 0 && (
                <p className="text-sm text-muted-foreground">Inga kostnader registrerade annu.</p>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="projects">
        <TabsList>
          <TabsTrigger value="projects">Projekt</TabsTrigger>
          <TabsTrigger value="billing">Fakturering</TabsTrigger>
        </TabsList>

        {/* ==== Projects tab ==== */}
        <TabsContent value="projects" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <KPICard label="Aktiva projekt" value={activeCount} />
            <KPICard
              label="Totalt fakturerat"
              value={formatKr(totalBilled).toLocaleString('sv-SE')}
              suffix="kr"
            />
            <KPICard
              label="Ofakturerat"
              value={formatKr(totalUninvoiced).toLocaleString('sv-SE')}
              suffix="kr"
            />
            <KPICard label="Snittmarginal" value={avgMargin} suffix="%" />
          </div>

          <Dialog open={showNewProject} onOpenChange={setShowNewProject}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-1" /> Nytt projekt
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nytt projekt</DialogTitle>
                <DialogDescription>Skapa ett nytt projekt att fakturera mot.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Projektnamn</Label>
                  <Input
                    placeholder="T.ex. Kundprojekt A"
                    value={newProjectName}
                    onChange={e => setNewProjectName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Budget (kr)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newProjectBudget}
                    onChange={e => setNewProjectBudget(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleAddProject} disabled={!newProjectName.trim()}>Skapa</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Active projects */}
          {activeProjects.length > 0 && (
            <div className="space-y-4">
              {activeProjects.map(renderProjectCard)}
            </div>
          )}

          {activeProjects.length === 0 && (
            <p className="text-sm text-muted-foreground">Inga aktiva projekt. Skapa ett nytt projekt ovan.</p>
          )}

          {/* Completed projects */}
          {completedProjects.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground mt-6">Avslutade projekt</h3>
              {completedProjects.map(renderProjectCard)}
            </div>
          )}
        </TabsContent>

        {/* ==== Billing tab ==== */}
        <TabsContent value="billing" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KPICard
              label="Totalt fakturerat"
              value={formatKr(totalBilled).toLocaleString('sv-SE')}
              suffix="kr"
            />
            <KPICard
              label="Ofakturerat"
              value={formatKr(totalUninvoiced).toLocaleString('sv-SE')}
              suffix="kr"
            />
            <KPICard
              label="Totala kostnader"
              value={formatKr(totalCostsAll).toLocaleString('sv-SE')}
              suffix="kr"
            />
          </div>

          <h3 className="text-sm font-semibold">All fakturering</h3>
          {billings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen fakturering registrerad annu.</p>
          ) : (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">Fakt.</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead>Projekt</TableHead>
                    <TableHead>Beskrivning</TableHead>
                    <TableHead className="text-right">Belopp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {billings.map(b => {
                    const proj = projects.find(p => p.id === b.projectId)
                    return (
                      <TableRow key={b.id} className={cn(b.invoiced && 'bg-muted/30')}>
                        <TableCell>
                          <Checkbox
                            checked={b.invoiced}
                            onCheckedChange={() => handleToggleInvoiced(b)}
                            aria-label="Markera som fakturerad"
                          />
                        </TableCell>
                        <TableCell className="tabular-nums">{b.date}</TableCell>
                        <TableCell className="font-medium">{proj?.name ?? 'Okant'}</TableCell>
                        <TableCell>{b.description}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatKr(b.amount).toLocaleString('sv-SE')} kr
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ==== Dialogs ==== */}

      {/* Edit project dialog */}
      <EditEntryDialog
        open={editProjectOpen}
        onOpenChange={setEditProjectOpen}
        title="Redigera projekt"
        description="Andra namn och budget for projektet."
        onSave={handleSaveProject}
        isSaving={isSavingProject}
      >
        <div className="space-y-2">
          <Label>Projektnamn</Label>
          <Input
            value={editProjectName}
            onChange={e => setEditProjectName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Budget (kr)</Label>
          <Input
            type="number"
            value={editProjectBudget}
            onChange={e => setEditProjectBudget(e.target.value)}
          />
        </div>
      </EditEntryDialog>

      {/* Edit billing dialog */}
      <EditEntryDialog
        open={editBillingOpen}
        onOpenChange={setEditBillingOpen}
        title="Redigera faktureringsrad"
        onSave={handleSaveBilling}
        isSaving={isSavingBilling}
      >
        <div className="space-y-2">
          <Label>Beskrivning</Label>
          <Input
            value={editBillingDesc}
            onChange={e => setEditBillingDesc(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Belopp (kr)</Label>
          <Input
            type="number"
            value={editBillingAmount}
            onChange={e => setEditBillingAmount(e.target.value)}
          />
        </div>
      </EditEntryDialog>

      {/* Edit cost dialog */}
      <EditEntryDialog
        open={editCostOpen}
        onOpenChange={setEditCostOpen}
        title="Redigera kostnad"
        onSave={handleSaveCost}
        isSaving={isSavingCost}
      >
        <div className="space-y-2">
          <Label>Beskrivning</Label>
          <Input
            value={editCostDesc}
            onChange={e => setEditCostDesc(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Belopp (kr)</Label>
          <Input
            type="number"
            value={editCostAmount}
            onChange={e => setEditCostAmount(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Kategori</Label>
          <Select value={editCostCategory} onValueChange={(v) => setEditCostCategory(v as CostCategory)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COST_CATEGORIES.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </EditEntryDialog>

      {/* Complete project confirmation */}
      <Dialog open={completeProjectOpen} onOpenChange={setCompleteProjectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Avsluta projekt</DialogTitle>
            <DialogDescription>
              Ar du saker pa att du vill markera projektet som avslutat? Du kan inte langre lagga till rader.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteProjectOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={handleCompleteProject}>
              <CheckCircle className="h-4 w-4 mr-1" />
              Avsluta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete billing confirmation */}
      <ConfirmDeleteDialog
        open={deleteBillingOpen}
        onOpenChange={setDeleteBillingOpen}
        title="Ta bort faktureringsrad"
        description="Ar du saker pa att du vill ta bort denna faktureringsrad? Atgarden kan inte angras."
        onConfirm={handleDeleteBilling}
        isDeleting={isDeletingBilling}
      />

      {/* Delete cost confirmation */}
      <ConfirmDeleteDialog
        open={deleteCostOpen}
        onOpenChange={setDeleteCostOpen}
        title="Ta bort kostnad"
        description="Ar du saker pa att du vill ta bort denna kostnad? Atgarden kan inte angras."
        onConfirm={handleDeleteCost}
        isDeleting={isDeletingCost}
      />

      {/* Delete project confirmation */}
      <ConfirmDeleteDialog
        open={deleteProjectOpen}
        onOpenChange={setDeleteProjectOpen}
        title="Ta bort projekt"
        description="Ar du saker pa att du vill ta bort detta projekt? All tillhorande fakturering och kostnader tas ocksa bort. Atgarden kan inte angras."
        onConfirm={handleDeleteProject}
        isDeleting={isDeletingProject}
      />
    </div>
  )
}
