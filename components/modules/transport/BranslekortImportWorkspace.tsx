'use client'

import { useState, useEffect, useCallback } from 'react'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { ImportDropzone } from '@/components/modules/shared/ImportDropzone'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { Upload, History, CheckCircle, Loader2, Fuel } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type FuelProvider = 'circle-k' | 'okq8' | 'preem' | 'other'

const PROVIDER_LABELS: Record<FuelProvider, string> = {
  'circle-k': 'Circle K',
  'okq8': 'OKQ8',
  'preem': 'Preem',
  'other': 'Annan',
}

const EXPECTED_COLUMNS: Record<FuelProvider, string[]> = {
  'circle-k': ['Datum', 'Tid', 'Registreringsnr', 'Station', 'Produkt', 'Liter', 'Belopp', 'Moms'],
  'okq8': ['Datum', 'Regnr', 'Plats', 'Drivmedel', 'Volym', 'Pris', 'Totalt'],
  'preem': ['Transaktionsdatum', 'Registreringsnummer', 'Station', 'Produkttyp', 'Liter', 'Summa'],
  'other': ['Datum', 'Regnr', 'Liter', 'Belopp'],
}

interface ParsedData {
  headers: string[]
  rows: string[][]
}

interface ImportRecord {
  id: string
  filename: string
  created_at: string
  rows_imported: number
  status: string
  provider?: string
}

function parseCSV(text: string): ParsedData {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length === 0) return { headers: [], rows: [] }

  const delimiter = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(delimiter).map(h => h.trim())
  const rows = lines.slice(1).map(line =>
    line.split(delimiter).map(cell => cell.trim())
  )

  return { headers, rows }
}

export function BranslekortImportWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const [parsedData, setParsedData] = useState<ParsedData | null>(null)
  const [filename, setFilename] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [imports, setImports] = useState<ImportRecord[]>([])
  const [loadingImports, setLoadingImports] = useState(true)
  const [provider, setProvider] = useState<FuelProvider>('circle-k')
  const supabase = createClient()

  const loadImports = useCallback(async () => {
    setLoadingImports(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoadingImports(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'import_history')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setImports(data.config_value as ImportRecord[])
    }
    setLoadingImports(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => {
    loadImports()
  }, [loadImports])

  function handleFileSelect(file: File) {
    setFilename(file.name)
    setSaved(false)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      if (text) {
        setParsedData(parseCSV(text))
      }
    }
    reader.readAsText(file)
  }

  async function handleConfirmImport() {
    if (!parsedData || parsedData.rows.length === 0) return
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const newRecord: ImportRecord = {
      id: crypto.randomUUID(),
      filename,
      created_at: new Date().toISOString(),
      rows_imported: parsedData.rows.length,
      status: 'completed',
      provider: provider,
    }

    const importData = parsedData.rows.map(row => {
      const obj: Record<string, string> = {}
      parsedData.headers.forEach((header, i) => {
        obj[header] = row[i] ?? ''
      })
      obj['_provider'] = provider
      obj['_account'] = '5610'
      return obj
    })

    const updatedImports = [newRecord, ...imports]

    // Save import history
    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'import_history',
        config_value: updatedImports,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )

    // Save imported data
    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: `import_data_${newRecord.id}`,
        config_value: importData,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )

    setImports(updatedImports)
    setSaving(false)
    setSaved(true)
    setParsedData(null)
    setFilename('')
  }

  return (
    <ModuleWorkspaceShell
      title={mod.name}
      description={mod.desc}
      category={mod.cat as 'import'}
      sectorName="Transport & Logistik"
      backHref={`/m/${sectorSlug}`}
      settingsHref={settingsHref}
      tabs={
        <Tabs defaultValue="importera" className="w-full">
          <TabsList>
            <TabsTrigger value="importera" className="gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              Importera
            </TabsTrigger>
            <TabsTrigger value="historik" className="gap-1.5">
              <History className="h-3.5 w-3.5" />
              Historik
            </TabsTrigger>
          </TabsList>

          <TabsContent value="importera" className="space-y-6 mt-6">
            <div className="flex items-end gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Bränslekortsleverantör</Label>
                <Select value={provider} onValueChange={(val) => setProvider(val as FuelProvider)}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="circle-k">Circle K</SelectItem>
                    <SelectItem value="okq8">OKQ8</SelectItem>
                    <SelectItem value="preem">Preem</SelectItem>
                    <SelectItem value="other">Annan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!parsedData && !saved && (
              <ImportDropzone
                accept=".csv,.xlsx,.xls"
                onFileSelect={handleFileSelect}
                label="Dra och släpp bränslekortsfil här"
                description={`CSV eller Excel med kolumner: ${EXPECTED_COLUMNS[provider].join(', ')}`}
              />
            )}

            {saved && (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-8">
                <CheckCircle className="h-8 w-8 text-emerald-600" />
                <p className="text-sm font-medium text-emerald-700">Importen är klar! Transaktioner bokförs automatiskt på konto 5610.</p>
                <Button variant="outline" size="sm" onClick={() => setSaved(false)}>
                  Importera en ny fil
                </Button>
              </div>
            )}

            {parsedData && !saved && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {parsedData.rows.length} rader hittades ({PROVIDER_LABELS[provider]})
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setParsedData(null); setFilename('') }}>
                      Avbryt
                    </Button>
                    <Button size="sm" onClick={handleConfirmImport} disabled={saving}>
                      {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                      Bekräfta import
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border overflow-auto max-h-96">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        {parsedData.headers.map((header, i) => (
                          <th key={i} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.rows.slice(0, 20).map((row, ri) => (
                        <tr key={ri} className="border-b last:border-0">
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-3 py-2 whitespace-nowrap">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsedData.rows.length > 20 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground bg-muted/30">
                      Visar 20 av {parsedData.rows.length} rader...
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                  <p className="text-xs text-amber-700">
                    <strong>Förväntade kolumner ({PROVIDER_LABELS[provider]}):</strong>{' '}
                    {EXPECTED_COLUMNS[provider].join(', ')}
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    Alla transaktioner bokförs automatiskt per fordon på konto 5610 (Bränslekostnader).
                  </p>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="historik" className="mt-6">
            {loadingImports ? (
              <div className="flex items-center gap-3 justify-center py-12">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Laddar importhistorik...</span>
              </div>
            ) : imports.length === 0 ? (
              <EmptyModuleState
                icon={History}
                title="Ingen importhistorik"
                description="När du importerar bränslekortsfiler visas de här."
              />
            ) : (
              <div className="rounded-lg border overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Filnamn</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Leverantör</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Datum</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Rader</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imports.map((imp) => (
                      <tr key={imp.id} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{imp.filename}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline">{PROVIDER_LABELS[(imp.provider || 'other') as FuelProvider] || imp.provider}</Badge>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {new Date(imp.created_at).toLocaleDateString('sv-SE')}
                        </td>
                        <td className="px-3 py-2">{imp.rows_imported}</td>
                        <td className="px-3 py-2">
                          <StatusBadge
                            label={imp.status === 'completed' ? 'Klar' : imp.status}
                            variant={imp.status === 'completed' ? 'success' : 'neutral'}
                          />
                        </td>
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
