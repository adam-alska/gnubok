'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  UserCircle,
  AlertTriangle,
  History,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface TreatmentEntry {
  date: string
  service: string
  stylist: string
  notes: string
}

interface CustomerCard {
  id: string
  name: string
  phone: string
  email: string
  favoriteStylist: string
  allergies: string
  colorRecipe: string
  notes: string
  treatments: TreatmentEntry[]
  createdAt: string
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

const EMPTY_CUSTOMER_FORM = {
  name: '',
  phone: '',
  email: '',
  favoriteStylist: '',
  allergies: '',
  colorRecipe: '',
  notes: '',
}

const EMPTY_TREATMENT_FORM = {
  date: todayStr(),
  service: '',
  stylist: '',
  notes: '',
}

export function KundkortWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [customers, setCustomers] = useState<CustomerCard[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerCard | null>(null)

  const [customerDialogOpen, setCustomerDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<CustomerCard | null>(null)
  const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER_FORM)

  const [treatmentDialogOpen, setTreatmentDialogOpen] = useState(false)
  const [treatmentForm, setTreatmentForm] = useState(EMPTY_TREATMENT_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [customerToDelete, setCustomerToDelete] = useState<CustomerCard | null>(null)

  const saveCustomers = useCallback(async (data: CustomerCard[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'customers',
        config_value: data,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'customers')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setCustomers(data.config_value as CustomerCard[])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers.sort((a, b) => a.name.localeCompare(b.name))
    const q = searchQuery.toLowerCase()
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.favoriteStylist.toLowerCase().includes(q)
    ).sort((a, b) => a.name.localeCompare(b.name))
  }, [customers, searchQuery])

  function openNewCustomer() {
    setEditingCustomer(null)
    setCustomerForm({ ...EMPTY_CUSTOMER_FORM })
    setCustomerDialogOpen(true)
  }

  function openEditCustomer(customer: CustomerCard) {
    setEditingCustomer(customer)
    setCustomerForm({
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      favoriteStylist: customer.favoriteStylist,
      allergies: customer.allergies,
      colorRecipe: customer.colorRecipe,
      notes: customer.notes,
    })
    setCustomerDialogOpen(true)
  }

  async function handleSaveCustomer() {
    const newCustomer: CustomerCard = {
      id: editingCustomer?.id ?? generateId(),
      name: customerForm.name.trim(),
      phone: customerForm.phone.trim(),
      email: customerForm.email.trim(),
      favoriteStylist: customerForm.favoriteStylist.trim(),
      allergies: customerForm.allergies.trim(),
      colorRecipe: customerForm.colorRecipe.trim(),
      notes: customerForm.notes.trim(),
      treatments: editingCustomer?.treatments ?? [],
      createdAt: editingCustomer?.createdAt ?? todayStr(),
    }

    let updated: CustomerCard[]
    if (editingCustomer) {
      updated = customers.map((c) => c.id === editingCustomer.id ? newCustomer : c)
    } else {
      updated = [...customers, newCustomer]
    }

    setCustomers(updated)
    setCustomerDialogOpen(false)
    if (selectedCustomer && editingCustomer) {
      setSelectedCustomer(newCustomer)
    }
    await saveCustomers(updated)
  }

  function openDeleteCustomer(customer: CustomerCard) {
    setCustomerToDelete(customer)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteCustomer() {
    if (!customerToDelete) return
    const updated = customers.filter((c) => c.id !== customerToDelete.id)
    setCustomers(updated)
    if (selectedCustomer?.id === customerToDelete.id) setSelectedCustomer(null)
    setDeleteDialogOpen(false)
    setCustomerToDelete(null)
    await saveCustomers(updated)
  }

  function openAddTreatment() {
    setTreatmentForm({ ...EMPTY_TREATMENT_FORM })
    setTreatmentDialogOpen(true)
  }

  async function handleAddTreatment() {
    if (!selectedCustomer) return

    const newTreatment: TreatmentEntry = {
      date: treatmentForm.date,
      service: treatmentForm.service.trim(),
      stylist: treatmentForm.stylist.trim(),
      notes: treatmentForm.notes.trim(),
    }

    const updatedCustomer = {
      ...selectedCustomer,
      treatments: [newTreatment, ...selectedCustomer.treatments],
    }

    const updated = customers.map((c) => c.id === selectedCustomer.id ? updatedCustomer : c)
    setCustomers(updated)
    setSelectedCustomer(updatedCustomer)
    setTreatmentDialogOpen(false)
    await saveCustomers(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="operativ"
        sectorName="Frisör & Skönhet"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNewCustomer}>
            <Plus className="mr-2 h-4 w-4" />
            Ny kund
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Customer list */}
            <div className="lg:col-span-1 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Sök kund..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {filteredCustomers.length === 0 ? (
                <EmptyModuleState
                  icon={UserCircle}
                  title="Inga kunder"
                  description={searchQuery ? 'Inga kunder matchar sökningen.' : 'Lägg till kunder för att bygga kundkortoteket.'}
                  actionLabel={!searchQuery ? 'Ny kund' : undefined}
                  onAction={!searchQuery ? openNewCustomer : undefined}
                />
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {filteredCustomers.map((customer) => (
                    <Card
                      key={customer.id}
                      className={`cursor-pointer transition-colors ${selectedCustomer?.id === customer.id ? 'border-primary' : 'hover:border-primary/40'}`}
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      <CardContent className="py-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">{customer.name}</p>
                            <p className="text-xs text-muted-foreground">{customer.phone || customer.email || 'Ingen kontaktinfo'}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            {customer.allergies && (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            )}
                            <Badge variant="outline" className="text-xs">{customer.treatments.length} besök</Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sparar...
                </div>
              )}
            </div>

            {/* Customer detail */}
            <div className="lg:col-span-2">
              {!selectedCustomer ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">Välj en kund för att se kundkort</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{selectedCustomer.name}</CardTitle>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditCustomer(selectedCustomer)} title="Redigera">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteCustomer(selectedCustomer)} title="Ta bort">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Telefon</p>
                          <p>{selectedCustomer.phone || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">E-post</p>
                          <p>{selectedCustomer.email || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Favoritstylist</p>
                          <p>{selectedCustomer.favoriteStylist || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Kund sedan</p>
                          <p>{selectedCustomer.createdAt}</p>
                        </div>
                      </div>

                      {selectedCustomer.allergies && (
                        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                            <p className="text-sm font-medium text-amber-800 dark:text-amber-400">Allergier / Varningar</p>
                          </div>
                          <p className="text-sm text-amber-700 dark:text-amber-300">{selectedCustomer.allergies}</p>
                        </div>
                      )}

                      {selectedCustomer.colorRecipe && (
                        <div className="rounded-lg bg-muted/50 p-3">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Färgrecept</p>
                          <p className="text-sm whitespace-pre-wrap">{selectedCustomer.colorRecipe}</p>
                        </div>
                      )}

                      {selectedCustomer.notes && (
                        <div className="rounded-lg bg-muted/50 p-3">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Anteckningar</p>
                          <p className="text-sm whitespace-pre-wrap">{selectedCustomer.notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Treatment history */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <History className="h-4 w-4" />
                          Behandlingshistorik
                        </CardTitle>
                        <Button size="sm" onClick={openAddTreatment}>
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          Ny behandling
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {selectedCustomer.treatments.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">Ingen behandlingshistorik ännu.</p>
                      ) : (
                        <div className="rounded-lg border border-border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead className="font-medium">Datum</TableHead>
                                <TableHead className="font-medium">Behandling</TableHead>
                                <TableHead className="font-medium">Stylist</TableHead>
                                <TableHead className="font-medium">Anteckning</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {selectedCustomer.treatments.map((t, idx) => (
                                <TableRow key={idx}>
                                  <TableCell className="text-sm">{t.date}</TableCell>
                                  <TableCell className="text-sm font-medium">{t.service}</TableCell>
                                  <TableCell className="text-sm">{t.stylist}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground">{t.notes || '-'}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>
        )}
      </ModuleWorkspaceShell>

      {/* Customer dialog */}
      <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? 'Redigera kundkort' : 'Nytt kundkort'}</DialogTitle>
            <DialogDescription>
              {editingCustomer ? 'Uppdatera kundens uppgifter.' : 'Fyll i kundens uppgifter, allergier och färgrecept.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="cust-name">Namn *</Label>
                <Input
                  id="cust-name"
                  value={customerForm.name}
                  onChange={(e) => setCustomerForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Anna Andersson"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cust-phone">Telefon</Label>
                <Input
                  id="cust-phone"
                  value={customerForm.phone}
                  onChange={(e) => setCustomerForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="070-123 45 67"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="cust-email">E-post</Label>
                <Input
                  id="cust-email"
                  type="email"
                  value={customerForm.email}
                  onChange={(e) => setCustomerForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="anna@example.se"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cust-stylist">Favoritstylist</Label>
                <Input
                  id="cust-stylist"
                  value={customerForm.favoriteStylist}
                  onChange={(e) => setCustomerForm((f) => ({ ...f, favoriteStylist: e.target.value }))}
                  placeholder="Lisa"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cust-allergies">Allergier / Varningar</Label>
              <Input
                id="cust-allergies"
                value={customerForm.allergies}
                onChange={(e) => setCustomerForm((f) => ({ ...f, allergies: e.target.value }))}
                placeholder="T.ex. känslig för PPD i hårfärg"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cust-recipe">Färgrecept</Label>
              <Textarea
                id="cust-recipe"
                value={customerForm.colorRecipe}
                onChange={(e) => setCustomerForm((f) => ({ ...f, colorRecipe: e.target.value }))}
                placeholder="T.ex. 7/0 + 8/1 50/50, 6% 30min"
                className="min-h-[80px]"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cust-notes">Övrigt</Label>
              <Textarea
                id="cust-notes"
                value={customerForm.notes}
                onChange={(e) => setCustomerForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Valfria anteckningar"
                className="min-h-[60px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomerDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveCustomer} disabled={!customerForm.name.trim()}>
              {editingCustomer ? 'Uppdatera' : 'Skapa kundkort'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Treatment dialog */}
      <Dialog open={treatmentDialogOpen} onOpenChange={setTreatmentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ny behandling</DialogTitle>
            <DialogDescription>Registrera en behandling för {selectedCustomer?.name}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="treat-date">Datum</Label>
                <Input
                  id="treat-date"
                  type="date"
                  value={treatmentForm.date}
                  onChange={(e) => setTreatmentForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="treat-service">Behandling *</Label>
                <Input
                  id="treat-service"
                  value={treatmentForm.service}
                  onChange={(e) => setTreatmentForm((f) => ({ ...f, service: e.target.value }))}
                  placeholder="Klippning + färgning"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="treat-stylist">Stylist</Label>
              <Input
                id="treat-stylist"
                value={treatmentForm.stylist}
                onChange={(e) => setTreatmentForm((f) => ({ ...f, stylist: e.target.value }))}
                placeholder="Lisa"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="treat-notes">Anteckning</Label>
              <Input
                id="treat-notes"
                value={treatmentForm.notes}
                onChange={(e) => setTreatmentForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="T.ex. färgrecept, resultat"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTreatmentDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleAddTreatment} disabled={!treatmentForm.service.trim()}>Spara</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort kundkort</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort kundkortet för {customerToDelete?.name}? All behandlingshistorik försvinner.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteCustomer}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
