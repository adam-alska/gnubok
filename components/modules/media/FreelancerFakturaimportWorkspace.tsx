'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { ImportDropzone } from '@/components/modules/shared/ImportDropzone'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Upload, CheckCircle2, XCircle, FileUp } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

interface ParsedInvoice { freelancer: string; invoiceNumber: string; amount: number; date: string; project: string; hasFSkatt: boolean }
interface ImportRecord { id: string; importedAt: string; fileName: string; rowCount: number; totalAmount: number }

function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }

export function FreelancerFakturaimportWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [parsed, setParsed] = useState<ParsedInvoice[]>([])
  const [fileName, setFileName] = useState('')
  const [history, setHistory] = useState<ImportRecord[]>([])
  const [error, setError] = useState('')

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_imports').select('*').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).order('imported_at', { ascending: false }).limit(20)
    if (data) setHistory(data.map((r: Record<string, unknown>) => ({ id: r.id as string, importedAt: r.imported_at as string, fileName: r.file_name as string, rowCount: r.row_count as number, totalAmount: (r.meta as Record<string, number>)?.totalAmount ?? 0 })))
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
        const fIdx = cols.findIndex(c => c.includes('freelancer') || c.includes('leverantör') || c.includes('namn'))
        const nIdx = cols.findIndex(c => c.includes('fakturanr') || c.includes('invoice') || c.includes('nummer'))
        const aIdx = cols.findIndex(c => c.includes('belopp') || c.includes('amount') || c.includes('summa'))
        const dIdx = cols.findIndex(c => c.includes('datum') || c.includes('date'))
        const pIdx = cols.findIndex(c => c.includes('projekt') || c.includes('project'))
        const fsIdx = cols.findIndex(c => c.includes('f-skatt') || c.includes('fskatt'))
        if (fIdx < 0 || aIdx < 0) { setError('Kolumner saknas. Förväntar: freelancer/leverantör, belopp. Valfritt: fakturanr, datum, projekt, f-skatt.'); return }
        const rows: ParsedInvoice[] = []
        for (let i = 1; i < lines.length; i++) {
          const vals = lines[i].split(sep).map(v => v.trim().replace(/"/g, ''))
          if (!vals[fIdx]) continue
          rows.push({
            freelancer: vals[fIdx] || '',
            invoiceNumber: nIdx >= 0 ? vals[nIdx] || '' : '',
            amount: parseFloat(vals[aIdx]?.replace(/\s/g, '').replace(',', '.')) || 0,
            date: dIdx >= 0 ? vals[dIdx] || '' : '',
            project: pIdx >= 0 ? vals[pIdx] || '' : '',
            hasFSkatt: fsIdx >= 0 ? ['ja', 'yes', '1', 'true'].includes(vals[fsIdx]?.toLowerCase() || '') : true,
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
    const totalAmount = parsed.reduce((s, r) => s + r.amount, 0)
    await supabase.from('module_imports').insert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, file_name: fileName, row_count: parsed.length, meta: { totalAmount, rows: parsed } })
    setParsed([]); setFileName(''); setImporting(false); await fetchHistory()
  }

  return (
    <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="import" sectorName="Media & Kommunikation" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}>
      <Tabs defaultValue="import" className="space-y-6">
        <TabsList><TabsTrigger value="import">Import</TabsTrigger><TabsTrigger value="historik">Historik</TabsTrigger></TabsList>
        <TabsContent value="import" className="space-y-6">
          {parsed.length === 0 ? (
            <div className="space-y-4">
              <ImportDropzone onFileSelect={handleFile} accept=".csv,.txt" label="Släpp CSV-fil med freelancerfakturor här" />
              {error && <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">{error}</div>}
              <div className="rounded-xl border border-border bg-card p-6 max-w-lg space-y-3">
                <h3 className="text-sm font-semibold">Förväntat format (CSV)</h3>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                  <li><strong>freelancer</strong> / leverantör / namn (obligatorisk)</li>
                  <li><strong>belopp</strong> / amount / summa (obligatorisk)</li>
                  <li>fakturanr / invoice / nummer (valfri)</li>
                  <li>datum / date (valfri)</li>
                  <li>projekt / project (valfri)</li>
                  <li>f-skatt / fskatt - ja/nej (valfri, standard: ja)</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between"><div><p className="text-sm font-medium">{fileName}</p><p className="text-xs text-muted-foreground">{parsed.length} fakturor | Totalt: {fmt(parsed.reduce((s, r) => s + r.amount, 0))} kr | Saknar F-skatt: {parsed.filter(r => !r.hasFSkatt).length}</p></div><div className="flex items-center gap-2"><Button variant="outline" onClick={() => { setParsed([]); setFileName('') }}>Avbryt</Button><Button onClick={confirmImport} disabled={importing}>{importing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importerar...</> : <><Upload className="mr-2 h-4 w-4" />Bekräfta import</>}</Button></div></div>
              <div className="rounded-xl border border-border overflow-hidden max-h-[400px] overflow-y-auto"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Freelancer</TableHead><TableHead className="font-medium">Fakturanr</TableHead><TableHead className="font-medium">Datum</TableHead><TableHead className="font-medium">Projekt</TableHead><TableHead className="font-medium text-right">Belopp</TableHead><TableHead className="font-medium">F-skatt</TableHead></TableRow></TableHeader>
                <TableBody>{parsed.map((r, i) => <TableRow key={i}><TableCell className="font-medium">{r.freelancer}</TableCell><TableCell className="font-mono">{r.invoiceNumber || '-'}</TableCell><TableCell>{r.date || '-'}</TableCell><TableCell>{r.project || '-'}</TableCell><TableCell className="text-right tabular-nums">{fmt(r.amount)} kr</TableCell><TableCell>{r.hasFSkatt ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />}</TableCell></TableRow>)}</TableBody></Table></div>
            </div>
          )}
        </TabsContent>
        <TabsContent value="historik" className="space-y-6">
          {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
            history.length === 0 ? <EmptyModuleState icon={FileUp} title="Ingen importhistorik" description="Importerade freelancerfakturor visas här." /> : (
              <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Datum</TableHead><TableHead className="font-medium">Fil</TableHead><TableHead className="font-medium text-right">Rader</TableHead><TableHead className="font-medium text-right">Totalbelopp</TableHead></TableRow></TableHeader>
                <TableBody>{history.map(h => <TableRow key={h.id}><TableCell>{new Date(h.importedAt).toLocaleString('sv-SE')}</TableCell><TableCell className="font-mono">{h.fileName}</TableCell><TableCell className="text-right tabular-nums">{h.rowCount}</TableCell><TableCell className="text-right tabular-nums">{fmt(h.totalAmount)} kr</TableCell></TableRow>)}</TableBody></Table></div>
            )
          )}
        </TabsContent>
      </Tabs>
    </ModuleWorkspaceShell>
  )
}
