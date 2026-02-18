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
interface RentLedgerRow { tenant: string; property: string; unit: string; monthlyRent: number; paidAmount: number; balance: number; dueDate: string; status: string }
interface ImportRecord { id: string; fileName: string; importedAt: string; rowCount: number; status: 'success' | 'error' }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }

export function HyresreskontraImportWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [preview, setPreview] = useState<RentLedgerRow[]>([]); const [fileName, setFileName] = useState(''); const [history, setHistory] = useState<ImportRecord[]>([]); const [importing, setImporting] = useState(false)

  const fetchHistory = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'import_history').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setHistory(data.config_value as ImportRecord[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchHistory() }, [fetchHistory])

  function handleFile(file: File) {
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string; const lines = text.trim().split('\n'); if (lines.length < 2) return; const sep = lines[0].includes(';') ? ';' : ','
      const rows: RentLedgerRow[] = []
      for (let i = 1; i < lines.length; i++) { const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, '')); if (cols.length >= 6) { rows.push({ tenant: cols[0], property: cols[1], unit: cols[2], monthlyRent: parseFloat(cols[3]) || 0, paidAmount: parseFloat(cols[4]) || 0, balance: parseFloat(cols[5]) || 0, dueDate: cols[6] || '', status: cols[7] || '' }) } }
      setPreview(rows)
    }; reader.readAsText(file)
  }

  async function confirmImport() {
    setImporting(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setImporting(false); return }
    const record: ImportRecord = { id: crypto.randomUUID(), fileName, importedAt: new Date().toISOString(), rowCount: preview.length, status: 'success' }
    const updated = [record, ...history]; setHistory(updated)
    await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'import_history', config_value: updated }, { onConflict: 'user_id,sector_slug,module_slug,config_key' })
    await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'rent_ledger_data', config_value: preview }, { onConflict: 'user_id,sector_slug,module_slug,config_key' })
    setPreview([]); setFileName(''); setImporting(false)
  }

  return (
    <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="import" sectorName="Fastighet" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}>
      <Tabs defaultValue="import" className="space-y-6">
        <TabsList><TabsTrigger value="import">Import</TabsTrigger><TabsTrigger value="historik">Historik</TabsTrigger></TabsList>
        <TabsContent value="import" className="space-y-6">
          <ImportDropzone accept=".csv" onFileSelect={handleFile} label="Dra och släpp hyresreskontra" description="CSV med kolumner: Hyresgäst, Fastighet, Enhet, Månhyra, Betalt, Saldo, Förfallodag, Status" />
          {preview.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between"><p className="text-sm font-medium">{preview.length} rader från {fileName}</p><div className="flex gap-2"><Button variant="outline" onClick={() => { setPreview([]); setFileName('') }}><X className="mr-2 h-4 w-4" />Avbryt</Button><Button onClick={confirmImport} disabled={importing}>{importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Importera</Button></div></div>
              <div className="rounded-xl border border-border overflow-hidden max-h-96 overflow-y-auto"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b sticky top-0"><th className="text-left px-4 py-3 font-medium text-muted-foreground">Hyresgäst</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Fastighet</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Enhet</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Månhyra</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Betalt</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Saldo</th></tr></thead><tbody>{preview.slice(0, 50).map((r, i) => <tr key={i} className="border-b last:border-0"><td className="px-4 py-2">{r.tenant}</td><td className="px-4 py-2">{r.property}</td><td className="px-4 py-2">{r.unit}</td><td className="px-4 py-2 text-right tabular-nums">{fmt(r.monthlyRent)}</td><td className="px-4 py-2 text-right tabular-nums">{fmt(r.paidAmount)}</td><td className="px-4 py-2 text-right tabular-nums font-medium">{fmt(r.balance)}</td></tr>)}</tbody></table></div>
            </div>
          )}
        </TabsContent>
        <TabsContent value="historik" className="space-y-4">
          {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : history.length === 0 ? <EmptyModuleState icon={Upload} title="Ingen importhistorik" description="Importera hyresreskontra via CSV." /> : (
            <div className="space-y-2">{history.map(r => <div key={r.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-3"><div className="flex flex-col min-w-0"><span className="font-medium text-sm">{r.fileName}</span><span className="text-xs text-muted-foreground">{new Date(r.importedAt).toLocaleString('sv-SE')} - {r.rowCount} rader</span></div><StatusBadge label={r.status === 'success' ? 'OK' : 'Fel'} variant={r.status === 'success' ? 'success' : 'danger'} /></div>)}</div>
          )}
        </TabsContent>
      </Tabs>
    </ModuleWorkspaceShell>
  )
}
