'use client'

import { useState, useMemo, useCallback } from 'react'
import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import { useExtensionData } from '@/lib/extensions/use-extension-data'
import KPICard from '@/components/extensions/shared/KPICard'
import DataEntryForm from '@/components/extensions/shared/DataEntryForm'
import ExtensionLoadingSkeleton from '@/components/extensions/shared/ExtensionLoadingSkeleton'
import ConfirmDeleteDialog from '@/components/extensions/shared/ConfirmDeleteDialog'
import EditEntryDialog from '@/components/extensions/shared/EditEntryDialog'
import { validateSwedishPersonalNumber } from '@/lib/extensions/validation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Pencil, Trash2, Plus, Download, Check } from 'lucide-react'

const MAX_ROT_YEARLY = 50000
const ROT_RATE = 0.30

interface Job {
  id: string
  customerId: string
  customerName: string
  description: string
  total: number
  material: number
  labor: number
  rotDeduction: number
  date: string
  status: 'draft' | 'completed'
}

interface Customer {
  id: string
  name: string
  personalNumber: string
}

function buildYearOptions(): number[] {
  const current = new Date().getFullYear()
  const years: number[] = []
  for (let y = current; y >= current - 5; y--) {
    years.push(y)
  }
  return years
}

export default function RotCalculatorWorkspace({}: WorkspaceComponentProps) {
  const { data, save, remove, refresh, isLoading } = useExtensionData('construction', 'rot-calculator')

  const customers = useMemo<Customer[]>(() =>
    data.filter(d => d.key.startsWith('customer:'))
      .map(d => ({
        id: d.key.replace('customer:', ''),
        ...(d.value as { name: string; personalNumber: string }),
      }))
  , [data])

  const allJobs = useMemo<Job[]>(() =>
    data.filter(d => d.key.startsWith('job:'))
      .map(d => ({ id: d.key.replace('job:', ''), ...(d.value as Omit<Job, 'id'>) }))
      .sort((a, b) => b.date.localeCompare(a.date))
  , [data])

  // Year filter
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(String(currentYear))
  const yearOptions = useMemo(() => buildYearOptions(), [])

  const jobs = useMemo(() =>
    allJobs.filter(j => j.date.startsWith(selectedYear))
  , [allJobs, selectedYear])

  // Calculator form
  const [selectedCustomerId, setCustomerId] = useState('')
  const customerId = selectedCustomerId || (customers.length > 0 ? customers[0].id : '')
  const [description, setDescription] = useState('')
  const [total, setTotal] = useState('')
  const [material, setMaterial] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // New customer form
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPnr, setNewCustomerPnr] = useState('')
  const newCustomerPnrError = useMemo(() => {
    if (!newCustomerPnr.trim()) return null
    return validateSwedishPersonalNumber(newCustomerPnr.trim())
  }, [newCustomerPnr])
  const canAddCustomer = newCustomerName.trim().length > 0 && !newCustomerPnrError

  // Edit customer dialog
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [editCustomerName, setEditCustomerName] = useState('')
  const [editCustomerPnr, setEditCustomerPnr] = useState('')
  const [isSavingCustomer, setIsSavingCustomer] = useState(false)
  const editCustomerPnrError = useMemo(() => {
    if (!editCustomerPnr.trim()) return null
    return validateSwedishPersonalNumber(editCustomerPnr.trim())
  }, [editCustomerPnr])

  // Edit job dialog
  const [editingJob, setEditingJob] = useState<Job | null>(null)
  const [editJobCustomerId, setEditJobCustomerId] = useState('')
  const [editJobDescription, setEditJobDescription] = useState('')
  const [editJobTotal, setEditJobTotal] = useState('')
  const [editJobMaterial, setEditJobMaterial] = useState('')
  const [isSavingJob, setIsSavingJob] = useState(false)

  // Delete job dialog
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null)
  const [isDeletingJob, setIsDeletingJob] = useState(false)

  // Per-customer used quota for selected year (only completed jobs count)
  const customerYearlyUsed = useMemo(() => {
    const map = new Map<string, number>()
    for (const job of jobs) {
      if (job.status === 'completed') {
        map.set(job.customerId, (map.get(job.customerId) ?? 0) + job.rotDeduction)
      }
    }
    return map
  }, [jobs])

  // Calculate ROT for current form input
  const totalNum = parseFloat(total) || 0
  const materialNum = parseFloat(material) || 0
  const labor = Math.max(totalNum - materialNum, 0)
  const usedQuota = customerYearlyUsed.get(customerId) ?? 0
  const remainingQuota = Math.max(MAX_ROT_YEARLY - usedQuota, 0)
  const rotDeduction = Math.round(Math.min(labor * ROT_RATE, remainingQuota) * 100) / 100
  const customerPays = Math.round((totalNum - rotDeduction) * 100) / 100

  // Calculate ROT deduction respecting quota for a specific customer
  const calculateRotDeduction = useCallback((custId: string, laborAmount: number, excludeJobId?: string) => {
    let used = 0
    for (const job of allJobs) {
      if (
        job.customerId === custId &&
        job.status === 'completed' &&
        job.date.startsWith(selectedYear) &&
        job.id !== excludeJobId
      ) {
        used += job.rotDeduction
      }
    }
    const remaining = Math.max(MAX_ROT_YEARLY - used, 0)
    return Math.round(Math.min(laborAmount * ROT_RATE, remaining) * 100) / 100
  }, [allJobs, selectedYear])

  const handleSubmitJob = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerId || totalNum <= 0) return
    setIsSubmitting(true)
    const customer = customers.find(c => c.id === customerId)
    const id = crypto.randomUUID()
    await save(`job:${id}`, {
      customerId,
      customerName: customer?.name ?? '',
      description,
      total: totalNum,
      material: materialNum,
      labor,
      rotDeduction,
      date: new Date().toISOString().slice(0, 10),
      status: 'draft',
    })
    setDescription('')
    setTotal('')
    setMaterial('')
    await refresh()
    setIsSubmitting(false)
  }

  const handleAddCustomer = async () => {
    if (!canAddCustomer) return
    const id = crypto.randomUUID()
    await save(`customer:${id}`, { name: newCustomerName.trim(), personalNumber: newCustomerPnr.trim() })
    setNewCustomerName('')
    setNewCustomerPnr('')
    await refresh()
  }

  const openEditCustomer = (cust: Customer) => {
    setEditingCustomer(cust)
    setEditCustomerName(cust.name)
    setEditCustomerPnr(cust.personalNumber)
  }

  const handleSaveCustomer = async () => {
    if (!editingCustomer || !editCustomerName.trim() || editCustomerPnrError) return
    setIsSavingCustomer(true)
    await save(`customer:${editingCustomer.id}`, {
      name: editCustomerName.trim(),
      personalNumber: editCustomerPnr.trim(),
    })
    // Update customerName on all jobs belonging to this customer
    const customerJobs = allJobs.filter(j => j.customerId === editingCustomer.id)
    for (const job of customerJobs) {
      await save(`job:${job.id}`, {
        customerId: job.customerId,
        customerName: editCustomerName.trim(),
        description: job.description,
        total: job.total,
        material: job.material,
        labor: job.labor,
        rotDeduction: job.rotDeduction,
        date: job.date,
        status: job.status,
      })
    }
    await refresh()
    setIsSavingCustomer(false)
  }

  const openEditJob = (job: Job) => {
    setEditingJob(job)
    setEditJobCustomerId(job.customerId)
    setEditJobDescription(job.description)
    setEditJobTotal(String(job.total))
    setEditJobMaterial(String(job.material))
  }

  const handleSaveJob = async () => {
    if (!editingJob) return
    const editTotalNum = parseFloat(editJobTotal) || 0
    const editMaterialNum = parseFloat(editJobMaterial) || 0
    if (editTotalNum <= 0) return
    setIsSavingJob(true)
    const editLabor = Math.max(editTotalNum - editMaterialNum, 0)
    const newRot = calculateRotDeduction(editJobCustomerId, editLabor, editingJob.id)
    const customer = customers.find(c => c.id === editJobCustomerId)
    await save(`job:${editingJob.id}`, {
      customerId: editJobCustomerId,
      customerName: customer?.name ?? editingJob.customerName,
      description: editJobDescription,
      total: editTotalNum,
      material: editMaterialNum,
      labor: editLabor,
      rotDeduction: newRot,
      date: editingJob.date,
      status: editingJob.status,
    })
    await refresh()
    setIsSavingJob(false)
  }

  const handleDeleteJob = async () => {
    if (!deletingJobId) return
    setIsDeletingJob(true)
    await remove(`job:${deletingJobId}`)
    await refresh()
    setIsDeletingJob(false)
    setDeletingJobId(null)
  }

  const handleMarkCompleted = async (job: Job) => {
    const rot = calculateRotDeduction(job.customerId, job.labor, job.id)
    await save(`job:${job.id}`, {
      customerId: job.customerId,
      customerName: job.customerName,
      description: job.description,
      total: job.total,
      material: job.material,
      labor: job.labor,
      rotDeduction: rot,
      date: job.date,
      status: 'completed',
    })
    await refresh()
  }

  const handleExportCsv = () => {
    const completedJobs = jobs.filter(j => j.status === 'completed')
    const header = 'Personnummer;Kundnamn;Arbetskostnad;ROTAvdrag;Datum'
    const rows = completedJobs.map(job => {
      const cust = customers.find(c => c.id === job.customerId)
      const pnr = cust?.personalNumber ?? ''
      return `${pnr};${job.customerName};${job.labor};${job.rotDeduction};${job.date}`
    })
    const csv = [header, ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `rot-avdrag-${selectedYear}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) return <ExtensionLoadingSkeleton />

  const completedJobCount = jobs.filter(j => j.status === 'completed').length
  const totalRot = jobs.filter(j => j.status === 'completed').reduce((s, j) => s + j.rotDeduction, 0)
  const totalRevenue = jobs.reduce((s, j) => s + j.total, 0)

  return (
    <div className="space-y-6">
      <Tabs defaultValue="calculator">
        <TabsList>
          <TabsTrigger value="calculator">Kalkylator</TabsTrigger>
          <TabsTrigger value="customers">Kunder</TabsTrigger>
          <TabsTrigger value="jobs">Jobb</TabsTrigger>
        </TabsList>

        <TabsContent value="calculator" className="space-y-6 mt-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm">Ar:</Label>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {customers.length === 0 ? (
            <div className="rounded-xl border p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Lagg till kunder under fliken &quot;Kunder&quot; for att borja berakna ROT-avdrag.
              </p>
            </div>
          ) : (
            <>
              <DataEntryForm
                title="Berakna ROT-avdrag"
                onSubmit={handleSubmitJob}
                submitLabel="Spara jobb"
                isSubmitting={isSubmitting}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Kund</Label>
                    <Select value={customerId} onValueChange={setCustomerId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Beskrivning</Label>
                    <Input placeholder="T.ex. Badrumsrenovering" value={description} onChange={e => setDescription(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Totalt belopp (inkl. moms)</Label>
                    <Input type="number" min="0" placeholder="0" value={total} onChange={e => setTotal(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Materialkostnad</Label>
                    <Input type="number" min="0" placeholder="0" value={material} onChange={e => setMaterial(e.target.value)} />
                  </div>
                </div>

                {totalNum > 0 && (
                  <Card className="bg-muted/50">
                    <CardContent className="pt-4 space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <span className="text-muted-foreground">Arbetskostnad:</span>
                        <span className="text-right tabular-nums">{labor.toLocaleString('sv-SE')} kr</span>
                        <span className="text-muted-foreground">ROT-avdrag (30%):</span>
                        <span className="text-right tabular-nums font-medium text-green-600">-{rotDeduction.toLocaleString('sv-SE')} kr</span>
                        <span className="text-muted-foreground">Kunden betalar:</span>
                        <span className="text-right tabular-nums font-semibold">{customerPays.toLocaleString('sv-SE')} kr</span>
                        <span className="text-muted-foreground">Kvarvarande kvot:</span>
                        <span className="text-right tabular-nums">{Math.max(remainingQuota - rotDeduction, 0).toLocaleString('sv-SE')} kr</span>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </DataEntryForm>
            </>
          )}
        </TabsContent>

        <TabsContent value="customers" className="space-y-6 mt-4">
          <div className="flex gap-2 flex-wrap items-start">
            <Input placeholder="Kundnamn" value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} className="max-w-xs" />
            <div className="space-y-1">
              <Input
                placeholder="Personnummer (YYYYMMDD-XXXX)"
                value={newCustomerPnr}
                onChange={e => setNewCustomerPnr(e.target.value)}
                className="max-w-xs"
              />
              {newCustomerPnrError && (
                <p className="text-xs text-red-600">{newCustomerPnrError}</p>
              )}
            </div>
            <Button size="sm" onClick={handleAddCustomer} disabled={!canAddCustomer}>
              <Plus className="h-4 w-4 mr-1" /> Lagg till
            </Button>
          </div>

          {customers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Inga kunder tillagda annu.</p>
          ) : (
            <div className="space-y-3">
              {customers.map(cust => {
                const used = customerYearlyUsed.get(cust.id) ?? 0
                const pct = Math.min(Math.round((used / MAX_ROT_YEARLY) * 100), 100)
                return (
                  <Card key={cust.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-medium text-sm">{cust.name}</p>
                          {cust.personalNumber && (
                            <p className="text-xs text-muted-foreground">{cust.personalNumber}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm tabular-nums">
                            {used.toLocaleString('sv-SE')} / {MAX_ROT_YEARLY.toLocaleString('sv-SE')} kr
                          </span>
                          <Button variant="ghost" size="sm" onClick={() => openEditCustomer(cust)}>
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                      <Progress value={pct} className="h-2" />
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="jobs" className="space-y-6 mt-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Ar:</Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {completedJobCount > 0 && (
              <Button variant="outline" size="sm" onClick={handleExportCsv}>
                <Download className="h-4 w-4 mr-1" /> Exportera CSV
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KPICard label="Antal jobb" value={jobs.length} />
            <KPICard label="Total ROT" value={totalRot.toLocaleString('sv-SE')} suffix="kr" />
            <KPICard label="Total omsattning" value={totalRevenue.toLocaleString('sv-SE')} suffix="kr" />
          </div>

          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Inga jobb registrerade for {selectedYear}.</p>
          ) : (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Kund</TableHead>
                    <TableHead>Beskrivning</TableHead>
                    <TableHead className="text-right">Totalt</TableHead>
                    <TableHead className="text-right">ROT-avdrag</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-28"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map(job => (
                    <TableRow key={job.id}>
                      <TableCell>{job.date}</TableCell>
                      <TableCell className="font-medium">{job.customerName}</TableCell>
                      <TableCell>{job.description}</TableCell>
                      <TableCell className="text-right tabular-nums">{job.total.toLocaleString('sv-SE')} kr</TableCell>
                      <TableCell className="text-right tabular-nums text-green-600">{job.rotDeduction.toLocaleString('sv-SE')} kr</TableCell>
                      <TableCell>
                        <Badge variant={job.status === 'completed' ? 'default' : 'secondary'}>
                          {job.status === 'completed' ? 'Klar' : 'Utkast'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {job.status === 'draft' && (
                            <Button variant="ghost" size="sm" onClick={() => handleMarkCompleted(job)} title="Markera som klar">
                              <Check className="h-3.5 w-3.5 text-green-600" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => openEditJob(job)} title="Redigera">
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeletingJobId(job.id)} title="Ta bort">
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
        </TabsContent>
      </Tabs>

      {/* Edit Customer Dialog */}
      <EditEntryDialog
        open={editingCustomer !== null}
        onOpenChange={open => { if (!open) setEditingCustomer(null) }}
        title="Redigera kund"
        description="Uppdatera kunduppgifter."
        onSave={handleSaveCustomer}
        isSaving={isSavingCustomer}
      >
        <div className="space-y-2">
          <Label>Namn</Label>
          <Input value={editCustomerName} onChange={e => setEditCustomerName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Personnummer</Label>
          <Input
            placeholder="YYYYMMDD-XXXX"
            value={editCustomerPnr}
            onChange={e => setEditCustomerPnr(e.target.value)}
          />
          {editCustomerPnrError && (
            <p className="text-xs text-red-600">{editCustomerPnrError}</p>
          )}
        </div>
      </EditEntryDialog>

      {/* Edit Job Dialog */}
      <EditEntryDialog
        open={editingJob !== null}
        onOpenChange={open => { if (!open) setEditingJob(null) }}
        title="Redigera jobb"
        description="Uppdatera jobbdetaljer. ROT-avdrag beraknas om automatiskt."
        onSave={handleSaveJob}
        isSaving={isSavingJob}
      >
        <div className="space-y-2">
          <Label>Kund</Label>
          <Select value={editJobCustomerId} onValueChange={setEditJobCustomerId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Beskrivning</Label>
          <Input value={editJobDescription} onChange={e => setEditJobDescription(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Totalt belopp (inkl. moms)</Label>
          <Input type="number" min="0" value={editJobTotal} onChange={e => setEditJobTotal(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Materialkostnad</Label>
          <Input type="number" min="0" value={editJobMaterial} onChange={e => setEditJobMaterial(e.target.value)} />
        </div>
        {(() => {
          const editTotalNum = parseFloat(editJobTotal) || 0
          const editMaterialNum = parseFloat(editJobMaterial) || 0
          const editLabor = Math.max(editTotalNum - editMaterialNum, 0)
          const editRot = editingJob
            ? calculateRotDeduction(editJobCustomerId, editLabor, editingJob.id)
            : 0
          return editTotalNum > 0 ? (
            <div className="rounded-lg border p-3 bg-muted/50 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Arbetskostnad:</span>
                <span className="tabular-nums">{editLabor.toLocaleString('sv-SE')} kr</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ROT-avdrag (30%):</span>
                <span className="tabular-nums font-medium text-green-600">-{editRot.toLocaleString('sv-SE')} kr</span>
              </div>
            </div>
          ) : null
        })()}
      </EditEntryDialog>

      {/* Delete Job Confirmation */}
      <ConfirmDeleteDialog
        open={deletingJobId !== null}
        onOpenChange={open => { if (!open) setDeletingJobId(null) }}
        title="Ta bort jobb"
        description="Ar du saker pa att du vill ta bort detta jobb? Kundens anvanda kvot minskar om jobbet var slutfort."
        onConfirm={handleDeleteJob}
        isDeleting={isDeletingJob}
      />
    </div>
  )
}
