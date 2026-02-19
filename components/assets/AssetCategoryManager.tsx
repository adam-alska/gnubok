'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Plus, Pencil, Trash2, FolderOpen } from 'lucide-react'
import type { AssetCategory, DepreciationMethod } from '@/types/fixed-assets'
import { DEPRECIATION_METHOD_LABELS } from '@/types/fixed-assets'

export function AssetCategoryManager() {
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  // Form state
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [assetAccount, setAssetAccount] = useState('')
  const [depreciationAccount, setDepreciationAccount] = useState('')
  const [expenseAccount, setExpenseAccount] = useState('')
  const [defaultLifeMonths, setDefaultLifeMonths] = useState('')
  const [defaultMethod, setDefaultMethod] = useState<DepreciationMethod>('straight_line')

  useEffect(() => {
    fetchCategories()
  }, [])

  async function fetchCategories() {
    setIsLoading(true)
    const res = await fetch('/api/asset-categories')
    const json = await res.json()
    setCategories(json.data || [])
    setIsLoading(false)
  }

  function resetForm() {
    setCode('')
    setName('')
    setAssetAccount('')
    setDepreciationAccount('')
    setExpenseAccount('')
    setDefaultLifeMonths('')
    setDefaultMethod('straight_line')
    setEditingId(null)
  }

  function openEdit(cat: AssetCategory) {
    setEditingId(cat.id)
    setCode(cat.code)
    setName(cat.name)
    setAssetAccount(cat.asset_account)
    setDepreciationAccount(cat.depreciation_account)
    setExpenseAccount(cat.expense_account)
    setDefaultLifeMonths(cat.default_useful_life_months?.toString() || '')
    setDefaultMethod(cat.default_depreciation_method || 'straight_line')
    setDialogOpen(true)
  }

  function openCreate() {
    resetForm()
    setDialogOpen(true)
  }

  async function handleSubmit() {
    setIsSubmitting(true)

    const payload = {
      code,
      name,
      asset_account: assetAccount,
      depreciation_account: depreciationAccount,
      expense_account: expenseAccount,
      default_useful_life_months: defaultLifeMonths ? parseInt(defaultLifeMonths) : undefined,
      default_depreciation_method: defaultMethod,
    }

    try {
      const url = editingId
        ? `/api/asset-categories/${editingId}`
        : '/api/asset-categories'
      const method = editingId ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || 'Ett fel uppstod')
      }

      toast({
        title: editingId ? 'Kategori uppdaterad' : 'Kategori skapad',
        description: `${name} har ${editingId ? 'uppdaterats' : 'lagts till'}`,
      })

      setDialogOpen(false)
      resetForm()
      fetchCategories()
    } catch (err) {
      toast({
        title: 'Fel',
        description: err instanceof Error ? err.message : 'Kunde inte spara kategori',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(cat: AssetCategory) {
    if (cat.is_system) {
      toast({
        title: 'Kan inte ta bort',
        description: 'Systemkategorier kan inte tas bort',
        variant: 'destructive',
      })
      return
    }

    try {
      const res = await fetch(`/api/asset-categories/${cat.id}`, { method: 'DELETE' })
      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || 'Kunde inte ta bort kategori')
      }

      toast({ title: 'Kategori borttagen', description: `${cat.name} har tagits bort` })
      fetchCategories()
    } catch (err) {
      toast({
        title: 'Fel',
        description: err instanceof Error ? err.message : 'Ett fel uppstod',
        variant: 'destructive',
      })
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5" />
                Tillgangskategorier
              </CardTitle>
              <CardDescription>
                Hantera kategorier for anlagningstillgangar med tillhorande konton
              </CardDescription>
            </div>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Ny kategori
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-muted rounded" />
              ))}
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Inga kategorier. Klicka &quot;Ny kategori&quot; for att skapa en.
            </div>
          ) : (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kod</TableHead>
                    <TableHead>Namn</TableHead>
                    <TableHead className="font-mono">Tillgang</TableHead>
                    <TableHead className="font-mono">Ack. avskr.</TableHead>
                    <TableHead className="font-mono">Kostnad</TableHead>
                    <TableHead>Nyttjandetid</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((cat) => (
                    <TableRow key={cat.id}>
                      <TableCell className="font-mono font-medium">
                        {cat.code}
                        {cat.is_system && (
                          <Badge variant="secondary" className="ml-2 text-xs">
                            System
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{cat.name}</TableCell>
                      <TableCell className="font-mono text-sm">{cat.asset_account}</TableCell>
                      <TableCell className="font-mono text-sm">{cat.depreciation_account}</TableCell>
                      <TableCell className="font-mono text-sm">{cat.expense_account}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {cat.default_useful_life_months
                          ? `${cat.default_useful_life_months} man (${Math.round(cat.default_useful_life_months / 12)} ar)`
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => openEdit(cat)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {!cat.is_system && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(cat)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Redigera kategori' : 'Ny tillgangskategori'}
            </DialogTitle>
            <DialogDescription>
              Ange kategorikod och tillhorande BAS-konton
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Kod *</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="MASKINER"
                />
              </div>
              <div className="space-y-2">
                <Label>Namn *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Maskiner och tekniska anlaggningar"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Tillgangskonto *</Label>
                <Input
                  value={assetAccount}
                  onChange={(e) => setAssetAccount(e.target.value)}
                  placeholder="1210"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Ack. avskrivningskonto *</Label>
                <Input
                  value={depreciationAccount}
                  onChange={(e) => setDepreciationAccount(e.target.value)}
                  placeholder="1219"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Kostnadskonto *</Label>
                <Input
                  value={expenseAccount}
                  onChange={(e) => setExpenseAccount(e.target.value)}
                  placeholder="7831"
                  className="font-mono"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Standard nyttjandetid (man)</Label>
                <Input
                  type="number"
                  min="1"
                  value={defaultLifeMonths}
                  onChange={(e) => setDefaultLifeMonths(e.target.value)}
                  placeholder="60"
                />
              </div>
              <div className="space-y-2">
                <Label>Standard avskrivningsmetod</Label>
                <Select value={defaultMethod} onValueChange={(v) => setDefaultMethod(v as DepreciationMethod)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(DEPRECIATION_METHOD_LABELS) as DepreciationMethod[]).map((m) => (
                      <SelectItem key={m} value={m}>
                        {DEPRECIATION_METHOD_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Avbryt
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !code || !name || !assetAccount || !depreciationAccount || !expenseAccount}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? 'Spara' : 'Skapa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
