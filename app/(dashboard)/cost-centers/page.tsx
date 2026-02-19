'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { Plus, FolderTree, Loader2 } from 'lucide-react'
import CostCenterTree from '@/components/budget/CostCenterTree'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { CostCenter, CreateCostCenterInput } from '@/types/budget-costcenters'

export default function CostCentersPage() {
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCostCenter, setEditingCostCenter] = useState<CostCenter | null>(null)
  const [parentIdForNew, setParentIdForNew] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Form state
  const [formCode, setFormCode] = useState('')
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formManagerName, setFormManagerName] = useState('')
  const [formParentId, setFormParentId] = useState<string>('')

  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    fetchCostCenters()
  }, [])

  async function fetchCostCenters() {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('cost_centers')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('code', { ascending: true })

    if (error) {
      toast({ title: 'Fel', description: 'Kunde inte hämta kostnadsställen', variant: 'destructive' })
    } else {
      setCostCenters(data || [])
    }
    setIsLoading(false)
  }

  function openCreateDialog(parentId?: string) {
    setEditingCostCenter(null)
    setFormCode('')
    setFormName('')
    setFormDescription('')
    setFormManagerName('')
    setFormParentId(parentId || '')
    setParentIdForNew(parentId || null)
    setDialogOpen(true)
  }

  function openEditDialog(cc: CostCenter) {
    setEditingCostCenter(cc)
    setFormCode(cc.code)
    setFormName(cc.name)
    setFormDescription(cc.description || '')
    setFormManagerName(cc.manager_name || '')
    setFormParentId(cc.parent_id || '')
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!formCode.trim() || !formName.trim()) {
      toast({ title: 'Fel', description: 'Kod och namn krävs', variant: 'destructive' })
      return
    }

    setIsSaving(true)

    if (editingCostCenter) {
      const response = await fetch(`/api/cost-centers/${editingCostCenter.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: formCode,
          name: formName,
          description: formDescription || null,
          manager_name: formManagerName || null,
          parent_id: formParentId || null,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        toast({ title: 'Fel', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Uppdaterat', description: `${formName} har uppdaterats` })
        setDialogOpen(false)
        fetchCostCenters()
      }
    } else {
      const body: CreateCostCenterInput = {
        code: formCode,
        name: formName,
        description: formDescription || undefined,
        manager_name: formManagerName || undefined,
        parent_id: formParentId || undefined,
      }

      const response = await fetch('/api/cost-centers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const result = await response.json()

      if (!response.ok) {
        toast({ title: 'Fel', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Skapat', description: `${formName} har skapats` })
        setDialogOpen(false)
        fetchCostCenters()
      }
    }

    setIsSaving(false)
  }

  async function handleDelete(cc: CostCenter) {
    if (!confirm(`Vill du ta bort kostnadsställe ${cc.code} - ${cc.name}?`)) return

    const response = await fetch(`/api/cost-centers/${cc.id}`, { method: 'DELETE' })

    if (!response.ok) {
      const result = await response.json()
      toast({ title: 'Fel', description: result.error, variant: 'destructive' })
    } else {
      toast({ title: 'Borttaget', description: `${cc.name} har tagits bort` })
      fetchCostCenters()
    }
  }

  // Get possible parent options (exclude self and children)
  const parentOptions = costCenters.filter(cc =>
    !editingCostCenter || cc.id !== editingCostCenter.id
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kostnadsställen</h1>
          <p className="text-muted-foreground">
            Hantera kostnadsställen för uppföljning och rapportering
          </p>
        </div>
        <Button onClick={() => openCreateDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          Nytt kostnadsställe
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderTree className="h-4 w-4" />
            Kostnadsställen ({costCenters.length})
          </CardTitle>
          <CardDescription>
            Klicka pa ett kostnadsställe for att se detaljer
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <CostCenterTree
              costCenters={costCenters}
              onEdit={openEditDialog}
              onDelete={handleDelete}
              onAddChild={(parentId) => openCreateDialog(parentId)}
            />
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingCostCenter ? 'Redigera kostnadsställe' : 'Nytt kostnadsställe'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cc-code">Kod</Label>
                <Input
                  id="cc-code"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  placeholder="100"
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="cc-name">Namn</Label>
                <Input
                  id="cc-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Administration"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cc-desc">Beskrivning</Label>
              <Input
                id="cc-desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Valfri beskrivning"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cc-manager">Ansvarig</Label>
              <Input
                id="cc-manager"
                value={formManagerName}
                onChange={(e) => setFormManagerName(e.target.value)}
                placeholder="Namn pa ansvarig"
              />
            </div>

            <div className="space-y-2">
              <Label>Överordnat kostnadsställe</Label>
              <Select value={formParentId || '__none__'} onValueChange={(v) => setFormParentId(v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Inget (toppniva)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Inget (toppniva)</SelectItem>
                  {parentOptions.map(cc => (
                    <SelectItem key={cc.id} value={cc.id}>
                      {cc.code} - {cc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingCostCenter ? 'Spara' : 'Skapa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
