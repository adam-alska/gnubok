'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Plus, Search, Briefcase, Loader2 } from 'lucide-react'
import Link from 'next/link'
import type { Project, ProjectStatus, CreateProjectInput } from '@/types/budget-costcenters'
import type { Customer } from '@/types'
import { PROJECT_STATUS_LABELS } from '@/types/budget-costcenters'

const statusBadgeVariant: Record<ProjectStatus, 'default' | 'success' | 'secondary' | 'destructive' | 'warning'> = {
  planning: 'secondary',
  active: 'default',
  completed: 'success',
  cancelled: 'destructive',
  on_hold: 'warning',
}

function formatSEK(amount: number): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Form state
  const [formProjectNumber, setFormProjectNumber] = useState('')
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formCustomerId, setFormCustomerId] = useState('')
  const [formStatus, setFormStatus] = useState<ProjectStatus>('planning')
  const [formStartDate, setFormStartDate] = useState('')
  const [formEndDate, setFormEndDate] = useState('')
  const [formBudgetAmount, setFormBudgetAmount] = useState('')

  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    fetchProjects()
    fetchCustomers()
  }, [])

  async function fetchProjects() {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('projects')
      .select('*, customer:customers(id, name)')
      .order('created_at', { ascending: false })

    if (error) {
      toast({ title: 'Fel', description: 'Kunde inte hämta projekt', variant: 'destructive' })
    } else {
      setProjects(data || [])
    }
    setIsLoading(false)
  }

  async function fetchCustomers() {
    const { data } = await supabase
      .from('customers')
      .select('id, name')
      .order('name')

    setCustomers(data || [])
  }

  async function handleCreate() {
    if (!formProjectNumber.trim() || !formName.trim()) {
      toast({ title: 'Fel', description: 'Projektnummer och namn krävs', variant: 'destructive' })
      return
    }

    setIsSaving(true)

    const body: CreateProjectInput = {
      project_number: formProjectNumber,
      name: formName,
      description: formDescription || undefined,
      customer_id: formCustomerId || undefined,
      status: formStatus,
      start_date: formStartDate || undefined,
      end_date: formEndDate || undefined,
      budget_amount: formBudgetAmount ? parseFloat(formBudgetAmount) : undefined,
    }

    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const result = await response.json()

    if (!response.ok) {
      toast({ title: 'Fel', description: result.error, variant: 'destructive' })
    } else {
      toast({ title: 'Projekt skapat', description: `${formName} har skapats` })
      setDialogOpen(false)
      resetForm()
      fetchProjects()
    }

    setIsSaving(false)
  }

  function resetForm() {
    setFormProjectNumber('')
    setFormName('')
    setFormDescription('')
    setFormCustomerId('')
    setFormStatus('planning')
    setFormStartDate('')
    setFormEndDate('')
    setFormBudgetAmount('')
  }

  const filteredProjects = projects.filter(p => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.project_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.customer as { name?: string } | null)?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projekt</h1>
          <p className="text-muted-foreground">
            Hantera projekt och följ upp lönsamhet
          </p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true) }}>
          <Plus className="mr-2 h-4 w-4" />
          Nytt projekt
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sök projekt, nummer eller kund..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Alla statusar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla statusar</SelectItem>
            {Object.entries(PROJECT_STATUS_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Projects table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Briefcase className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">
                {searchTerm || statusFilter !== 'all' ? 'Inga träffar' : 'Inga projekt'}
              </p>
              <p className="text-sm">
                {searchTerm || statusFilter !== 'all'
                  ? 'Prova att ändra sökvillkoren'
                  : 'Skapa ditt första projekt'
                }
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Projektnummer</TableHead>
                  <TableHead>Namn</TableHead>
                  <TableHead>Kund</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead>Period</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map(project => (
                  <TableRow key={project.id} className="cursor-pointer">
                    <TableCell>
                      <Link href={`/projects/${project.id}`} className="font-mono text-sm hover:underline">
                        {project.project_number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/projects/${project.id}`} className="font-medium hover:underline">
                        {project.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {(project.customer as { name?: string } | null)?.name || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant[project.status]}>
                        {PROJECT_STATUS_LABELS[project.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {project.budget_amount > 0 ? formatSEK(project.budget_amount) : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {project.start_date
                        ? `${project.start_date}${project.end_date ? ` - ${project.end_date}` : ''}`
                        : '-'
                      }
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nytt projekt</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="proj-num">Projektnummer</Label>
                <Input
                  id="proj-num"
                  value={formProjectNumber}
                  onChange={(e) => setFormProjectNumber(e.target.value)}
                  placeholder="P001"
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="proj-name">Namn</Label>
                <Input
                  id="proj-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Projektnamn"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="proj-desc">Beskrivning</Label>
              <Input
                id="proj-desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Valfri beskrivning"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Kund</Label>
                <Select value={formCustomerId || '__none__'} onValueChange={(v) => setFormCustomerId(v === '__none__' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Ingen kund" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Ingen kund</SelectItem>
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formStatus} onValueChange={(v) => setFormStatus(v as ProjectStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROJECT_STATUS_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="proj-start">Startdatum</Label>
                <Input
                  id="proj-start"
                  type="date"
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proj-end">Slutdatum</Label>
                <Input
                  id="proj-end"
                  type="date"
                  value={formEndDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="proj-budget">Budget (SEK)</Label>
              <Input
                id="proj-budget"
                type="number"
                value={formBudgetAmount}
                onChange={(e) => setFormBudgetAmount(e.target.value)}
                placeholder="0"
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
