'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, Pencil, Trash2, Loader2, UtensilsCrossed, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type Allergen = 'Gluten' | 'Laktos' | 'Nötter' | 'Ägg' | 'Fisk' | 'Soja' | 'Selleri' | 'Skaldjur'
const ALLERGENS: Allergen[] = ['Gluten', 'Laktos', 'Nötter', 'Ägg', 'Fisk', 'Soja', 'Selleri', 'Skaldjur']

interface MenuItem { id: string; dayOfWeek: number; weekNumber: number; dishName: string; allergens: Allergen[]; isAlternative: boolean; alternativeFor: string }

const WEEKDAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag']
const EMPTY_FORM = { dayOfWeek: 0, dishName: '', allergens: [] as Allergen[], isAlternative: false, alternativeFor: '' }

function getWeekNumber(): number {
  const d = new Date()
  const oneJan = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7)
}

export function MatsedelAllergikostWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [currentWeek, setCurrentWeek] = useState(getWeekNumber())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<MenuItem | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const saveMenuItems = useCallback(async (items: MenuItem[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'menu_items', config_value: items },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchMenuItems = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'menu_items').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setMenuItems(data.config_value as MenuItem[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchMenuItems() }, [fetchMenuItems])

  const weekItems = useMemo(() => menuItems.filter(m => m.weekNumber === currentWeek), [menuItems, currentWeek])

  function openNew(day: number) { setEditing(null); setForm({ ...EMPTY_FORM, dayOfWeek: day }); setDialogOpen(true) }
  function openEdit(item: MenuItem) {
    setEditing(item)
    setForm({ dayOfWeek: item.dayOfWeek, dishName: item.dishName, allergens: item.allergens, isAlternative: item.isAlternative, alternativeFor: item.alternativeFor })
    setDialogOpen(true)
  }

  function toggleAllergen(a: Allergen) {
    setForm(f => ({ ...f, allergens: f.allergens.includes(a) ? f.allergens.filter(x => x !== a) : [...f.allergens, a] }))
  }

  async function handleSave() {
    const entry: MenuItem = { id: editing?.id ?? crypto.randomUUID(), weekNumber: currentWeek, ...form }
    const updated = editing ? menuItems.map(m => m.id === editing.id ? entry : m) : [...menuItems, entry]
    setMenuItems(updated); setDialogOpen(false); await saveMenuItems(updated)
  }

  async function handleDelete(id: string) {
    const updated = menuItems.filter(m => m.id !== id)
    setMenuItems(updated); await saveMenuItems(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Utbildning & Förskola" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCurrentWeek(w => w - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm font-medium">Vecka {currentWeek}</span>
            <Button variant="outline" size="icon" onClick={() => setCurrentWeek(w => w + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        }>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            {WEEKDAYS.map((day, i) => {
              const dayItems = weekItems.filter(m => m.dayOfWeek === i)
              return (
                <div key={i} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">{day}</h3>
                    <Button variant="ghost" size="sm" onClick={() => openNew(i)}><Plus className="mr-1.5 h-3.5 w-3.5" />Lägg till</Button>
                  </div>
                  {dayItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Ingen rätt tillagd</p>
                  ) : (
                    <div className="space-y-2">
                      {dayItems.map(item => (
                        <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{item.dishName}</span>
                              {item.isAlternative && <Badge variant="outline" className="text-xs">Alternativ</Badge>}
                            </div>
                            {item.allergens.length > 0 && (
                              <div className="flex items-center gap-1 mt-1">
                                <AlertTriangle className="h-3 w-3 text-amber-500" />
                                {item.allergens.map(a => <Badge key={a} variant="secondary" className="text-xs bg-amber-100 text-amber-800">{a}</Badge>)}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => handleDelete(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Redigera rätt' : 'Ny rätt'}</DialogTitle><DialogDescription>Fyll i rättens uppgifter och markera allergener.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>Rätt *</Label><Input value={form.dishName} onChange={e => setForm(f => ({ ...f, dishName: e.target.value }))} placeholder="Köttbullar med mos" /></div>
            <div className="grid gap-2">
              <Label>Allergener</Label>
              <div className="flex flex-wrap gap-2">{ALLERGENS.map(a => (
                <Button key={a} type="button" variant={form.allergens.includes(a) ? 'default' : 'outline'} size="sm" onClick={() => toggleAllergen(a)}>{a}</Button>
              ))}</div>
            </div>
            <div className="flex items-center gap-3">
              <Button type="button" variant={form.isAlternative ? 'default' : 'outline'} size="sm" onClick={() => setForm(f => ({ ...f, isAlternative: !f.isAlternative }))}>{form.isAlternative ? 'Alternativ: JA' : 'Alternativ: NEJ'}</Button>
              {form.isAlternative && <Input value={form.alternativeFor} onChange={e => setForm(f => ({ ...f, alternativeFor: e.target.value }))} placeholder="Alternativ för..." className="flex-1" />}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.dishName.trim()}>{editing ? 'Uppdatera' : 'Lägg till'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
