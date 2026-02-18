'use client'

import { useState, useEffect, useCallback } from 'react'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { ImportDropzone } from '@/components/modules/shared/ImportDropzone'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { KPICard } from '@/components/modules/shared/KPICard'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { Upload, History, CheckCircle, Loader2, Package } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

const EXPECTED_COLUMNS = ['Artikelnr', 'Artikelnamn', 'System antal', 'Raknat antal', 'Enhetskostnad']

interface ParsedData { headers: string[]; rows: string[][] }
interface ImportRecord { id: string; filename: string; created_at: string; rows_imported: number; status: string }

function parseCSV(text: string): ParsedData {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length === 0) return { headers: [], rows: [] }
  const delimiter = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(delimiter).map(h => h.trim())
  const rows = lines.slice(1).map(line => line.split(delimiter).map(cell => cell.trim()))
  return { headers, rows }
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

export function InventeringsimportWorkspace({ module, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const [parsedData, setParsedData] = useState<ParsedData | null>(null)
  const [filename, setFilename] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [imports, setImports] = useState<ImportRecord[]>([])
  const [loadingImports, setLoadingImports] = useState(true)
  const [varianceStats, setVarianceStats] = useState<{ totalVariance: number; shrinkageBooking: number; itemsWithDiff: number } | null>(null)
  const supabase = createClient()

  const loadImports = useCallback(async () => {
    setLoadingImports(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoadingImports(false); return }
    const { data } = await supabase
      .from('module_imports')
      .select('id, filename, created_at, rows_imported, status')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', 'inventeringsimport')
      .order('created_at', { ascending: false })
    setImports(data ?? [])
    setLoadingImports(false)
  }, [supabase, sectorSlug])

  useEffect(() => { loadImports() }, [loadImports])

  function handleFileSelect(file: File) {
    setFilename(file.name)
    setSaved(false)
    setVarianceStats(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      if (text) {
        const parsed = parseCSV(text)
        setParsedData(parsed)

        // Calculate variance stats
        const systemIdx = parsed.headers.indexOf('System antal')
        const countedIdx = parsed.headers.indexOf('Raknat antal')
        const costIdx = parsed.headers.indexOf('Enhetskostnad')

        if (systemIdx >= 0 && countedIdx >= 0) {
          let totalVariance = 0
          let shrinkageBooking = 0
          let itemsWithDiff = 0

          for (const row of parsed.rows) {
            const sys = parseFloat(row[systemIdx]) || 0
            const counted = parseFloat(row[countedIdx]) || 0
            const cost = costIdx >= 0 ? (parseFloat(row[costIdx]) || 0) : 0
            const diff = counted - sys
            if (diff !== 0) {
              itemsWithDiff++
              totalVariance += Math.abs(diff)
              if (diff < 0) shrinkageBooking += Math.abs(diff) * cost
            }
          }
          setVarianceStats({ totalVariance, shrinkageBooking, itemsWithDiff })
        }
      }
    }
    reader.readAsText(file)
  }

  async function handleConfirmImport() {
    if (!parsedData || parsedData.rows.length === 0) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const importData = parsedData.rows.map(row => {
      const obj: Record<string, string> = {}
      parsedData.headers.forEach((header, i) => { obj[header] = row[i] ?? '' })
      return obj
    })

    await supabase.from('module_imports').insert({
      user_id: user.id, sector_slug: sectorSlug, module_slug: 'inventeringsimport',
      filename, status: 'completed', rows_imported: parsedData.rows.length, import_data: importData,
    })

    setSaving(false)
    setSaved(true)
    setParsedData(null)
    setFilename('')
    loadImports()
  }

  return (
    <ModuleWorkspaceShell
      title={module.name} description={module.desc}
      category={module.cat as 'import'} sectorName="Detaljhandel"
      backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
      tabs={
        <Tabs defaultValue="importera" className="w-full">
          <TabsList>
            <TabsTrigger value="importera" className="gap-1.5"><Upload className="h-3.5 w-3.5" />Importera</TabsTrigger>
            <TabsTrigger value="historik" className="gap-1.5"><History className="h-3.5 w-3.5" />Historik</TabsTrigger>
          </TabsList>

          <TabsContent value="importera" className="space-y-6 mt-6">
            {!parsedData && !saved && (
              <ImportDropzone
                accept=".csv,.xlsx,.xls"
                onFileSelect={handleFileSelect}
                label="Dra och slapp inventeringsfil har"
                description="CSV eller Excel med kolumner: Artikelnr, Artikelnamn, System antal, Raknat antal, Enhetskostnad"
              />
            )}

            {saved && (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-8">
                <CheckCircle className="h-8 w-8 text-emerald-600" />
                <p className="text-sm font-medium text-emerald-700">Inventering importerad! Differenser beraknade och svinn bokforts.</p>
                <Button variant="outline" size="sm" onClick={() => setSaved(false)}>Importera en ny fil</Button>
              </div>
            )}

            {parsedData && !saved && (
              <div className="space-y-4">
                {varianceStats && (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <KPICard label="Artiklar med differens" value={String(varianceStats.itemsWithDiff)} unit="st" />
                    <KPICard label="Total enhetsdifferens" value={String(varianceStats.totalVariance)} unit="st" />
                    <KPICard label="Svinnbokforing" value={fmt(varianceStats.shrinkageBooking)} unit="kr" />
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{filename}</p>
                    <p className="text-xs text-muted-foreground">{parsedData.rows.length} rader hittades</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setParsedData(null); setFilename(''); setVarianceStats(null) }}>Avbryt</Button>
                    <Button size="sm" onClick={handleConfirmImport} disabled={saving}>
                      {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Bekrafta import
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border overflow-auto max-h-96">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/50">{parsedData.headers.map((h, i) => <th key={i} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>)}</tr></thead>
                    <tbody>
                      {parsedData.rows.slice(0, 20).map((row, ri) => (
                        <tr key={ri} className="border-b last:border-0">{row.map((cell, ci) => <td key={ci} className="px-3 py-2 whitespace-nowrap">{cell}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                  {parsedData.rows.length > 20 && <p className="px-3 py-2 text-xs text-muted-foreground bg-muted/30">Visar 20 av {parsedData.rows.length} rader...</p>}
                </div>

                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                  <p className="text-xs text-amber-700"><strong>Forvantade kolumner:</strong> {EXPECTED_COLUMNS.join(', ')}</p>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="historik" className="mt-6">
            {loadingImports ? (
              <div className="flex items-center gap-3 justify-center py-12"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /><span className="text-sm text-muted-foreground">Laddar importhistorik...</span></div>
            ) : imports.length === 0 ? (
              <EmptyModuleState icon={History} title="Ingen importhistorik" description="Nar du importerar inventeringar visas de har." />
            ) : (
              <div className="rounded-lg border overflow-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/50"><th className="px-3 py-2 text-left font-medium text-muted-foreground">Filnamn</th><th className="px-3 py-2 text-left font-medium text-muted-foreground">Datum</th><th className="px-3 py-2 text-left font-medium text-muted-foreground">Rader</th><th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th></tr></thead>
                  <tbody>
                    {imports.map((imp) => (
                      <tr key={imp.id} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{imp.filename}</td>
                        <td className="px-3 py-2 text-muted-foreground">{new Date(imp.created_at).toLocaleDateString('sv-SE')}</td>
                        <td className="px-3 py-2">{imp.rows_imported}</td>
                        <td className="px-3 py-2"><StatusBadge label={imp.status === 'completed' ? 'Klar' : imp.status} variant={imp.status === 'completed' ? 'success' : 'neutral'} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      }
    >
      <div />
    </ModuleWorkspaceShell>
  )
}
