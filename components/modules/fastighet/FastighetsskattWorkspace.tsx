'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Trash2, Loader2, Landmark } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
type PropertyType = 'Bostäder' | 'Lokaler' | 'Industri' | 'Mark'
interface TaxEntry { id: string; property: string; propertyType: PropertyType; taxValue: number; taxRate: number; annualTax: number; year: string; account: string }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const PROPERTY_TYPES: PropertyType[] = ['Bostäder', 'Lokaler', 'Industri', 'Mark']
const TAX_RATES: Record<PropertyType, number> = { 'Bostäder': 0.75, 'Lokaler': 1.0, 'Industri': 0.5, 'Mark': 0.75 }
const EMPTY_FORM = { property: '', propertyType: 'Lokaler' as PropertyType, taxValue: 0, taxRate: 1.0, year: new Date().getFullYear().toString(), account: '7720' }

export function FastighetsskattWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [entries, setEntries] = useState<TaxEntry[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<TaxEntry | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<TaxEntry | null>(null)

  const saveItems = useCallback(async (items: TaxEntry[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'tax_entries', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'tax_entries').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as TaxEntry[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const totalTax = entries.reduce((s, e) => s + e.annualTax, 0)
  const totalTaxValue = entries.reduce((s, e) => s + e.taxValue, 0)

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM, taxRate: TAX_RATES['Lokaler'] }); setDialogOpen(true) }
  function openEdit(e: TaxEntry) { setEditing(e); setForm({ property: e.property, propertyType: e.propertyType, taxValue: e.taxValue, taxRate: e.taxRate, year: e.year, account: e.account }); setDialogOpen(true) }
  async function handleSave() { const annualTax = form.taxValue * (form.taxRate / 100); const item: TaxEntry = { id: editing?.id ?? crypto.randomUUID(), property: form.property.trim(), propertyType: form.propertyType, taxValue: form.taxValue, taxRate: form.taxRate, annualTax, year: form.year, account: form.account }; const updated = editing ? entries.map(e => e.id === editing.id ? item : e) : [...entries, item]; setEntries(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = entries.filter(e => e.id !== toDelete.id); setEntries(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Fastighet" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny post</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="poster">Poster</TabsTrigger></TabsList>
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : entries.length === 0 ? <EmptyModuleState icon={Landmark} title="Ingen fastighetsskatt" description="Beräkna fastighetsskatt per objekt med taxeringsvärde och aktuella skattesatser. Konto 7720." actionLabel="Ny post" onAction={openNew} /> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><KPICard label="Årlig fastighetsskatt" value={fmt(totalTax)} unit="kr" /><KPICard label="Totalt taxeringsvärde" value={fmt(totalTaxValue)} unit="kr" /><KPICard label="Antal fastigheter" value={String(entries.length)} unit="st" /></div>
            )}
          </TabsContent>
          <TabsContent value="poster" className="space-y-4">
            {entries.length > 0 && <div className="rounded-xl border border-border overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b"><th className="text-left px-4 py-3 font-medium text-muted-foreground">Fastighet</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Typ</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Taxvärde</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Sats %</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Årlig skatt</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">År</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Konto</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th></tr></thead><tbody>{entries.map(e => <tr key={e.id} className="border-b last:border-0"><td className="px-4 py-3 font-medium">{e.property}</td><td className="px-4 py-3"><Badge variant="outline">{e.propertyType}</Badge></td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.taxValue)}</td><td className="px-4 py-3 text-right tabular-nums">{e.taxRate}%</td><td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(e.annualTax)}</td><td className="px-4 py-3">{e.year}</td><td className="px-4 py-3 font-mono text-xs">{e.account}</td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(e); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody></table></div>}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny fastighetsskatt'}</DialogTitle><DialogDescription>Ange taxeringsvärde och skattesats.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Fastighet *</Label><Input value={form.property} onChange={e => setForm(f => ({ ...f, property: e.target.value }))} /></div><div className="grid gap-2"><Label>Fastighetstyp</Label><Select value={form.propertyType} onValueChange={val => { const pt = val as PropertyType; setForm(f => ({ ...f, propertyType: pt, taxRate: TAX_RATES[pt] })) }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PROPERTY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Taxeringsvärde (kr)</Label><Input type="number" min={0} value={form.taxValue} onChange={e => setForm(f => ({ ...f, taxValue: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Skattesats (%)</Label><Input type="number" min={0} step="0.01" value={form.taxRate} onChange={e => setForm(f => ({ ...f, taxRate: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>År</Label><Input value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} /></div></div><div className="grid gap-2"><Label>Konto</Label><Input value={form.account} onChange={e => setForm(f => ({ ...f, account: e.target.value }))} /></div>{form.taxValue > 0 && <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">Beräknad skatt: <span className="font-semibold">{fmt(form.taxValue * form.taxRate / 100)} kr/år</span> ({fmt(form.taxValue * form.taxRate / 100 / 12)} kr/mån)</div>}</div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.property.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
