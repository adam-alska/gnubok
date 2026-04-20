'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/use-toast'
import { useCompany } from '@/contexts/CompanyContext'
import { Cloud, Download, Info, Loader2 } from 'lucide-react'
import { ENABLED_EXTENSION_IDS } from '@/lib/extensions/_generated/enabled-extensions'
import { getSettingsPanel } from '@/lib/extensions/settings-panel-registry'
import type { FiscalPeriod } from '@/types'

const CloudBackupPanel = getSettingsPanel('cloud-backup')
const hasCloudBackup = ENABLED_EXTENSION_IDS.has('cloud-backup')

type Scope = 'all' | 'period'

interface EstimateResponse {
  total_bytes: number
  document_bytes: number
  document_count: number
  size_limit_bytes: number
  within_limit: boolean
}

const LAST_DOWNLOAD_STORAGE_KEY = 'gnubok:last-backup-download'

export function BackupDownloadForm() {
  const { toast } = useToast()
  const { company } = useCompany()

  const [scope, setScope] = useState<Scope>('all')
  const [includeDocuments, setIncludeDocuments] = useState(true)
  const [periods, setPeriods] = useState<FiscalPeriod[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('')
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null)
  const [isLoadingEstimate, setIsLoadingEstimate] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [lastDownloadedAt, setLastDownloadedAt] = useState<string | null>(null)

  const storageKey = useMemo(
    () => (company ? `${LAST_DOWNLOAD_STORAGE_KEY}:${company.id}` : null),
    [company]
  )

  useEffect(() => {
    if (!storageKey) return
    setLastDownloadedAt(window.localStorage.getItem(storageKey))
  }, [storageKey])

  useEffect(() => {
    let cancelled = false
    async function loadPeriods() {
      try {
        const res = await fetch('/api/bookkeeping/fiscal-periods')
        const { data } = await res.json()
        if (cancelled) return
        const sorted = (data || []) as FiscalPeriod[]
        setPeriods(sorted)
        if (sorted.length > 0 && !selectedPeriodId) {
          setSelectedPeriodId(sorted[0].id)
        }
      } catch {
        // silent: scope=all still works without periods loaded
      }
    }
    loadPeriods()
    return () => {
      cancelled = true
    }
    // Intentionally run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const estimateUrl = useMemo(() => {
    const params = new URLSearchParams({ estimate: '1', scope })
    if (scope === 'period' && selectedPeriodId) {
      params.set('period_id', selectedPeriodId)
    }
    if (!includeDocuments) {
      params.set('include_documents', 'false')
    }
    return `/api/reports/full-archive?${params.toString()}`
  }, [scope, selectedPeriodId, includeDocuments])

  useEffect(() => {
    if (scope === 'period' && !selectedPeriodId) {
      setEstimate(null)
      return
    }
    let cancelled = false
    setIsLoadingEstimate(true)
    setEstimate(null)
    ;(async () => {
      try {
        const res = await fetch(estimateUrl)
        if (!res.ok) return
        const { data } = (await res.json()) as { data: EstimateResponse }
        if (!cancelled) setEstimate(data)
      } catch {
        // leave estimate null; we still let users attempt the download
      } finally {
        if (!cancelled) setIsLoadingEstimate(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [estimateUrl, scope, selectedPeriodId])

  const downloadUrl = useMemo(() => {
    const params = new URLSearchParams({ scope })
    if (scope === 'period' && selectedPeriodId) {
      params.set('period_id', selectedPeriodId)
    }
    if (!includeDocuments) {
      params.set('include_documents', 'false')
    }
    return `/api/reports/full-archive?${params.toString()}`
  }, [scope, selectedPeriodId, includeDocuments])

  const handleDownload = useCallback(async () => {
    if (scope === 'period' && !selectedPeriodId) return

    setIsDownloading(true)
    try {
      const res = await fetch(downloadUrl)
      if (!res.ok) {
        if (res.status === 413) {
          const body = await res.json().catch(() => ({}))
          const sizeMb = body.size_bytes ? Math.round(body.size_bytes / (1024 * 1024)) : null
          toast({
            title: 'Arkivet är för stort för direktnedladdning',
            description: sizeMb
              ? `Ditt arkiv är cirka ${sizeMb} MB. Exportera en period i taget tills vidare — automatisk molnsynkronisering kommer i senare version.`
              : 'Exportera en period i taget tills vidare — automatisk molnsynkronisering kommer i senare version.',
            variant: 'destructive',
          })
          return
        }
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Kunde inte skapa arkivet')
      }

      const blob = await res.blob()
      const contentDisposition = res.headers.get('Content-Disposition') || ''
      const match = contentDisposition.match(/filename="?([^";]+)"?/)
      const filename = match?.[1] || 'arkiv.zip'

      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      const now = new Date().toISOString()
      if (storageKey) {
        window.localStorage.setItem(storageKey, now)
        setLastDownloadedAt(now)
      }

      toast({ title: 'Säkerhetsbackup skapad', description: filename })
    } catch (err) {
      toast({
        title: 'Kunde inte skapa säkerhetsbackup',
        description: err instanceof Error ? err.message : 'Försök igen.',
        variant: 'destructive',
      })
    } finally {
      setIsDownloading(false)
    }
  }, [downloadUrl, scope, selectedPeriodId, storageKey, toast])

  const isOverLimit = !!estimate && !estimate.within_limit && includeDocuments
  const canDownload = !isDownloading && !isOverLimit && (scope === 'all' || !!selectedPeriodId)

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Skapa backup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Omfattning</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <ScopeRadio
                checked={scope === 'all'}
                onChange={() => setScope('all')}
                label="Hela historiken"
                description="Alla räkenskapsår och verifikationer"
                recommended
              />
              <ScopeRadio
                checked={scope === 'period'}
                onChange={() => setScope('period')}
                label="En period"
                description="Välj ett specifikt räkenskapsår"
              />
            </div>
          </div>

          {scope === 'period' && (
            <div className="space-y-2">
              <Label htmlFor="backup-period">Räkenskapsår</Label>
              <select
                id="backup-period"
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(e.target.value)}
                className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                disabled={periods.length === 0}
              >
                {periods.length === 0 && <option value="">Inga räkenskapsår</option>}
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.period_start} – {p.period_end}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="include-documents">Inkludera kvitton och underlag</Label>
              <p className="text-xs text-muted-foreground max-w-prose">
                Bilagor till verifikationer (kvitton, fakturor, PDF:er) packas med i ZIP:en.
                Stäng av för en mindre backup med bara bokföringsdata.
              </p>
            </div>
            <Switch
              id="include-documents"
              checked={includeDocuments}
              onCheckedChange={setIncludeDocuments}
            />
          </div>

          <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              {isLoadingEstimate ? (
                <span>Beräknar storlek…</span>
              ) : estimate ? (
                <span>
                  Uppskattad storlek: <strong className="text-foreground">{formatBytes(estimate.total_bytes)}</strong>
                  {' '}({estimate.document_count} {estimate.document_count === 1 ? 'bilaga' : 'bilagor'})
                </span>
              ) : (
                <span>Storlek beräknas när omfattning är vald.</span>
              )}
            </div>
            {isOverLimit && (
              <p className="mt-2 text-xs text-destructive">
                Arkivet är större än {formatBytes(estimate!.size_limit_bytes)} och kan inte laddas ner
                direkt. Välj en enskild period eller stäng av bilagor tills vidare —
                automatisk molnsynkronisering kommer i senare version.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button onClick={handleDownload} disabled={!canDownload}>
              {isDownloading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Skapar backup…
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Skapa och ladda ner
                </>
              )}
            </Button>
            {lastDownloadedAt && (
              <p className="text-xs text-muted-foreground">
                Senaste nedladdning: {formatDate(lastDownloadedAt)}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {hasCloudBackup && CloudBackupPanel ? (
        <CloudBackupPanel />
      ) : (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Cloud className="h-4 w-4 text-muted-foreground" />
              Molnsynkronisering
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground max-w-prose">
              Aktivera tillägget &ldquo;Molnsynkronisering&rdquo; för att koppla Google
              Drive och ladda upp säkerhetsbackupen med ett klick.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

interface ScopeRadioProps {
  checked: boolean
  onChange: () => void
  label: string
  description: string
  recommended?: boolean
}

function ScopeRadio({ checked, onChange, label, description, recommended }: ScopeRadioProps) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`flex-1 rounded-lg border-2 p-3 text-left transition-colors ${
        checked ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">{label}</span>
        {recommended && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-primary">
            Rekommenderas
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
    </button>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} kB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
