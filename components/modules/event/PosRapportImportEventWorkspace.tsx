'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { ImportDropzone } from '@/components/modules/shared/ImportDropzone'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Loader2, Upload, Check, X } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
interface PosRow { date: string; register: string; category: string; quantity: number; grossAmount: number; vatAmount: number; netAmount: number; paymentMethod: string }
interface ImportRecord { id: string; fileName: string; importedAt: string; rowCount: number; status: 'success' | 'error' }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }

export function PosRapportImportEventWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [preview, setPreview] = useState<PosRow[]>([]); const [fileName, setFileName] = useState(''); const [history, setHistory] = useState<ImportRecord[]>([]); const [importing, setImporting] = useState(false)

  const fetchHistory = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'import_history').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setHistory(data.config_value as ImportRecord[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchHistory() }, [fetchHistory])

  function handleFile(file: File) {
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = text.trim().split('\n')
      if (lines.length < 2) return
      const sep = lines[0].includes(';') ? ';' : ','
      const rows: PosRow[] = []
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ''))
        if (cols.length >= 7) {
          rows.push({ date: cols[0], register: cols[1], category: cols[2], quantity: parseInt(cols[3]) || 0, grossAmount: parseFloat(cols[4]) || 0, vatAmount: parseFloat(cols[5]) || 0, netAmount: parseFloat(cols[6]) || 0, paymentMethod: cols[7] || '' })
        }
      }
      setPreview(rows)
    }
    reader.readAsText(file)
  }

  async function confirmImport() {
    setImporting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setImporting(false); return }
    const record: ImportRecord = { id: crypto.randomUUID(), fileName, importedAt: new Date().toISOString(), rowCount: preview.length, status: 'success' }
    const updated = [record, ...history]
    setHistory(updated)
    await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'import_history', config_value: updated }, { onConflict: 'user_id,sector_slug,module_slug,config_key' })
    await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'pos_data', config_value: preview }, { onConflict: 'user_id,sector_slug,module_slug,config_key' })
    setPreview([]); setFileName(''); setImporting(false)
  }

  return (
    <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="import" sectorName="Event" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}>
      <Tabs defaultValue="import" className="space-y-6">
        <TabsList><TabsTrigger value="import">Import</TabsTrigger><TabsTrigger value="historik">Historik</TabsTrigger></TabsList>
        <TabsContent value="import" className="space-y-6">
          <ImportDropzone accept=".csv" onFileSelect={handleFile} label="Dra och släpp POS-rapport" description="CSV med kolumner: Datum, Kassa, Kategori, Antal, Brutto, Moms, Netto, Betalsätt" />
          {preview.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between"><p className="text-sm font-medium">{preview.length} rader från {fileName}</p><div className="flex gap-2"><Button variant="outline" onClick={() => { setPreview([]); setFileName('') }}><X className="mr-2 h-4 w-4" />Avbryt</Button><Button onClick={confirmImport} disabled={importing}>{importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Importera</Button></div></div>
              <div className="rounded-xl border border-border overflow-hidden max-h-96 overflow-y-auto"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b sticky top-0"><th className="text-left px-4 py-3 font-medium text-muted-foreground">Datum</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Kassa</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Kategori</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Antal</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Brutto</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Moms</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Netto</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Betalsätt</th></tr></thead><tbody>{preview.slice(0, 50).map((r, i) => <tr key={i} className="border-b last:border-0"><td className="px-4 py-2">{r.date}</td><td className="px-4 py-2">{r.register}</td><td className="px-4 py-2">{r.category}</td><td className="px-4 py-2 text-right tabular-nums">{r.quantity}</td><td className="px-4 py-2 text-right tabular-nums">{fmt(r.grossAmount)}</td><td className="px-4 py-2 text-right tabular-nums">{fmt(r.vatAmount)}</td><td className="px-4 py-2 text-right tabular-nums font-medium">{fmt(r.netAmount)}</td><td className="px-4 py-2">{r.paymentMethod}</td></tr>)}</tbody></table></div>
              {preview.length > 50 && <p className="text-xs text-muted-foreground">Visar 50 av {preview.length} rader</p>}
            </div>
          )}
        </TabsContent>
        <TabsContent value="historik" className="space-y-4">
          {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : history.length === 0 ? <EmptyModuleState icon={Upload} title="Ingen importhistorik" description="Importera POS-rapporter via CSV-fil." /> : (
            <div className="space-y-2">{history.map(r => <div key={r.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-3"><div className="flex flex-col min-w-0"><span className="font-medium text-sm">{r.fileName}</span><span className="text-xs text-muted-foreground">{new Date(r.importedAt).toLocaleString('sv-SE')} - {r.rowCount} rader</span></div><StatusBadge label={r.status === 'success' ? 'OK' : 'Fel'} variant={r.status === 'success' ? 'success' : 'danger'} /></div>)}</div>
          )}
        </TabsContent>
      </Tabs>
    </ModuleWorkspaceShell>
  )
}
