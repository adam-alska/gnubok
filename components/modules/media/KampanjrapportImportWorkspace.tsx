'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { ImportDropzone } from '@/components/modules/shared/ImportDropzone'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Upload, FileUp, Megaphone } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

interface ParsedCampaign { campaignName: string; client: string; channel: string; spend: number; revenue: number; impressions: number; clicks: number; conversions: number; commissionCost: number }
interface ImportRecord { id: string; importedAt: string; fileName: string; rowCount: number; totalRevenue: number; totalSpend: number }

function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }

export function KampanjrapportImportWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [parsed, setParsed] = useState<ParsedCampaign[]>([])
  const [fileName, setFileName] = useState('')
  const [history, setHistory] = useState<ImportRecord[]>([])
  const [error, setError] = useState('')

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_imports').select('*').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).order('imported_at', { ascending: false }).limit(20)
    if (data) setHistory(data.map((r: Record<string, unknown>) => ({ id: r.id as string, importedAt: r.imported_at as string, fileName: r.file_name as string, rowCount: r.row_count as number, totalRevenue: (r.meta as Record<string, number>)?.totalRevenue ?? 0, totalSpend: (r.meta as Record<string, number>)?.totalSpend ?? 0 })))
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  function handleFile(file: File) {
    setError(''); setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const lines = text.trim().split('\n')
        if (lines.length < 2) { setError('Filen innehåller inga datarader.'); return }
        const header = lines[0].toLowerCase()
        const sep = header.includes(';') ? ';' : ','
        const cols = header.split(sep).map(c => c.trim().replace(/"/g, ''))
        const cIdx = cols.findIndex(c => c.includes('kampanj') || c.includes('campaign') || c.includes('namn'))
        const clIdx = cols.findIndex(c => c.includes('kund') || c.includes('client'))
        const chIdx = cols.findIndex(c => c.includes('kanal') || c.includes('channel'))
        const sIdx = cols.findIndex(c => c.includes('spend') || c.includes('kostnad') || c.includes('adspend'))
        const rIdx = cols.findIndex(c => c.includes('intäkt') || c.includes('revenue') || c.includes('omsättning'))
        const iIdx = cols.findIndex(c => c.includes('impression') || c.includes('visningar'))
        const ckIdx = cols.findIndex(c => c.includes('klick') || c.includes('click'))
        const cvIdx = cols.findIndex(c => c.includes('konvertering') || c.includes('conversion'))
        const cmIdx = cols.findIndex(c => c.includes('provision') || c.includes('commission'))
        if (cIdx < 0) { setError('Kolumn "kampanj" saknas. Förväntar: kampanj, intäkt, spend, kanal, etc.'); return }
        const rows: ParsedCampaign[] = []
        for (let i = 1; i < lines.length; i++) {
          const vals = lines[i].split(sep).map(v => v.trim().replace(/"/g, ''))
          if (!vals[cIdx]) continue
          const parseNum = (idx: number) => idx >= 0 ? parseFloat(vals[idx]?.replace(/\s/g, '').replace(',', '.')) || 0 : 0
          rows.push({
            campaignName: vals[cIdx] || '',
            client: clIdx >= 0 ? vals[clIdx] || '' : '',
            channel: chIdx >= 0 ? vals[chIdx] || '' : '',
            spend: parseNum(sIdx),
            revenue: parseNum(rIdx),
            impressions: parseNum(iIdx),
            clicks: parseNum(ckIdx),
            conversions: parseNum(cvIdx),
            commissionCost: parseNum(cmIdx),
          })
        }
        setParsed(rows)
      } catch { setError('Kunde inte tolka filen. Kontrollera format.') }
    }
    reader.readAsText(file)
  }

  async function confirmImport() {
    setImporting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setImporting(false); return }
    const totalRevenue = parsed.reduce((s, r) => s + r.revenue, 0)
    const totalSpend = parsed.reduce((s, r) => s + r.spend, 0)
    await supabase.from('module_imports').insert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, file_name: fileName, row_count: parsed.length, meta: { totalRevenue, totalSpend, rows: parsed } })
    setParsed([]); setFileName(''); setImporting(false); await fetchHistory()
  }

  return (
    <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="import" sectorName="Media & Kommunikation" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}>
      <Tabs defaultValue="import" className="space-y-6">
        <TabsList><TabsTrigger value="import">Import</TabsTrigger><TabsTrigger value="historik">Historik</TabsTrigger></TabsList>
        <TabsContent value="import" className="space-y-6">
          {parsed.length === 0 ? (
            <div className="space-y-4">
              <ImportDropzone onFileSelect={handleFile} accept=".csv,.txt" label="Släpp CSV-fil med kampanjrapporter här" />
              {error && <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">{error}</div>}
              <div className="rounded-xl border border-border bg-card p-6 max-w-lg space-y-3">
                <h3 className="text-sm font-semibold">Förväntat format (CSV)</h3>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                  <li><strong>kampanj</strong> / campaign / namn (obligatorisk)</li>
                  <li>kund / client (valfri)</li>
                  <li>kanal / channel (valfri)</li>
                  <li>spend / kostnad / adspend (valfri)</li>
                  <li>intäkt / revenue / omsättning (valfri)</li>
                  <li>impressions / visningar (valfri)</li>
                  <li>klick / click (valfri)</li>
                  <li>konvertering / conversion (valfri)</li>
                  <li>provision / commission (valfri)</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium">{fileName}</p><p className="text-xs text-muted-foreground">{parsed.length} kampanjer | Intäkt: {fmt(parsed.reduce((s, r) => s + r.revenue, 0))} kr | Spend: {fmt(parsed.reduce((s, r) => s + r.spend, 0))} kr</p></div>
                <div className="flex items-center gap-2"><Button variant="outline" onClick={() => { setParsed([]); setFileName('') }}>Avbryt</Button><Button onClick={confirmImport} disabled={importing}>{importing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importerar...</> : <><Upload className="mr-2 h-4 w-4" />Bekräfta import</>}</Button></div>
              </div>
              <div className="rounded-xl border border-border overflow-hidden max-h-[400px] overflow-y-auto"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Kampanj</TableHead><TableHead className="font-medium">Kund</TableHead><TableHead className="font-medium">Kanal</TableHead><TableHead className="font-medium text-right">Spend</TableHead><TableHead className="font-medium text-right">Intäkt</TableHead><TableHead className="font-medium text-right">ROAS</TableHead><TableHead className="font-medium text-right">Provision</TableHead></TableRow></TableHeader>
                <TableBody>{parsed.map((r, i) => { const roas = r.spend > 0 ? r.revenue / r.spend : 0; return (
                  <TableRow key={i}><TableCell className="font-medium">{r.campaignName}</TableCell><TableCell>{r.client || '-'}</TableCell><TableCell>{r.channel || '-'}</TableCell><TableCell className="text-right tabular-nums">{fmt(r.spend)} kr</TableCell><TableCell className="text-right tabular-nums">{fmt(r.revenue)} kr</TableCell><TableCell className={cn('text-right tabular-nums font-medium', roas >= 3 ? 'text-emerald-600' : roas >= 1 ? 'text-amber-600' : 'text-red-600')}>{roas.toFixed(1)}x</TableCell><TableCell className="text-right tabular-nums">{fmt(r.commissionCost)} kr</TableCell></TableRow>
                ) })}</TableBody></Table></div>
            </div>
          )}
        </TabsContent>
        <TabsContent value="historik" className="space-y-6">
          {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
            history.length === 0 ? <EmptyModuleState icon={Megaphone} title="Ingen importhistorik" description="Importerade kampanjrapporter visas här." /> : (
              <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Datum</TableHead><TableHead className="font-medium">Fil</TableHead><TableHead className="font-medium text-right">Rader</TableHead><TableHead className="font-medium text-right">Intäkt</TableHead><TableHead className="font-medium text-right">Spend</TableHead></TableRow></TableHeader>
                <TableBody>{history.map(h => <TableRow key={h.id}><TableCell>{new Date(h.importedAt).toLocaleString('sv-SE')}</TableCell><TableCell className="font-mono">{h.fileName}</TableCell><TableCell className="text-right tabular-nums">{h.rowCount}</TableCell><TableCell className="text-right tabular-nums">{fmt(h.totalRevenue)} kr</TableCell><TableCell className="text-right tabular-nums">{fmt(h.totalSpend)} kr</TableCell></TableRow>)}</TableBody></Table></div>
            )
          )}
        </TabsContent>
      </Tabs>
    </ModuleWorkspaceShell>
  )
}
