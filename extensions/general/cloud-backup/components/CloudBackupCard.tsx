'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Cloud, ExternalLink, Loader2, RefreshCw, Unplug } from 'lucide-react'
import type { CloudBackupStatus } from '../types'

const API_BASE = '/api/extensions/ext/cloud-backup'

export default function CloudBackupCard() {
  const { toast } = useToast()
  const searchParams = useSearchParams()

  const [status, setStatus] = useState<CloudBackupStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/status`)
      if (!res.ok) throw new Error('Kunde inte hämta status')
      const { data } = (await res.json()) as { data: CloudBackupStatus }
      setStatus(data)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  // Handle OAuth callback redirect params.
  useEffect(() => {
    const result = searchParams.get('cloud_backup')
    if (!result) return
    if (result === 'connected') {
      toast({ title: 'Google Drive kopplat', description: 'Du kan nu synka till din Drive.' })
    } else if (result === 'error') {
      const reason = searchParams.get('reason') || 'Okänt fel'
      toast({
        title: 'Kunde inte koppla Google Drive',
        description: reason,
        variant: 'destructive',
      })
    }
    // Clean the URL so refresh doesn't re-fire the toast.
    const url = new URL(window.location.href)
    url.searchParams.delete('cloud_backup')
    url.searchParams.delete('reason')
    window.history.replaceState({}, '', url.toString())
  }, [searchParams, toast])

  const handleConnect = useCallback(async () => {
    setIsConnecting(true)
    try {
      const res = await fetch(`${API_BASE}/connect`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Kunde inte starta anslutning')
      }
      const { url } = (await res.json()) as { url: string }
      window.location.href = url
    } catch (err) {
      toast({
        title: 'Kunde inte koppla Google Drive',
        description: err instanceof Error ? err.message : 'Försök igen.',
        variant: 'destructive',
      })
      setIsConnecting(false)
    }
  }, [toast])

  const handleDisconnect = useCallback(async () => {
    setIsDisconnecting(true)
    try {
      const res = await fetch(`${API_BASE}/disconnect`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Kunde inte koppla bort')
      }
      toast({ title: 'Google Drive bortkopplat' })
      await loadStatus()
    } catch (err) {
      toast({
        title: 'Kunde inte koppla bort',
        description: err instanceof Error ? err.message : 'Försök igen.',
        variant: 'destructive',
      })
    } finally {
      setIsDisconnecting(false)
    }
  }, [loadStatus, toast])

  const handleSync = useCallback(async () => {
    setIsSyncing(true)
    try {
      const res = await fetch(`${API_BASE}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ include_documents: true }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (res.status === 413) {
          const mb = body.size_bytes
            ? Math.round(body.size_bytes / (1024 * 1024))
            : null
          throw new Error(
            mb
              ? `Arkivet är ${mb} MB — större än nuvarande gräns. Minska omfattning eller avvakta bakgrundssynk.`
              : 'Arkivet är för stort för direktsynk.'
          )
        }
        throw new Error(body.error || 'Synkningen misslyckades')
      }
      const { data } = (await res.json()) as {
        data: { file_name: string; file_size_bytes: number; web_view_link: string }
      }
      toast({
        title: 'Uppladdad till Google Drive',
        description: `${data.file_name} (${formatMb(data.file_size_bytes)})`,
      })
      await loadStatus()
    } catch (err) {
      toast({
        title: 'Synkningen misslyckades',
        description: err instanceof Error ? err.message : 'Försök igen.',
        variant: 'destructive',
      })
    } finally {
      setIsSyncing(false)
    }
  }, [loadStatus, toast])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cloud className="h-4 w-4 text-muted-foreground" />
          Google Drive
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Laddar…</p>
        ) : status?.connected ? (
          <>
            <div className="text-sm">
              <p>
                Ansluten som <span className="font-medium">{status.account_email}</span>
              </p>
              {status.connected_at && (
                <p className="text-xs text-muted-foreground">
                  Kopplat {formatDate(status.connected_at)}
                </p>
              )}
            </div>

            {status.last_sync ? (
              <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
                <p>
                  Senaste synk: <span className="font-medium">{status.last_sync.file_name}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(status.last_sync.at)} · {formatMb(status.last_sync.file_size_bytes)}
                </p>
                <a
                  href={`https://drive.google.com/file/d/${status.last_sync.file_id}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Öppna i Drive
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Ingen synk än — kör &ldquo;Synka nu&rdquo; för att ladda upp första arkivet.
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button onClick={handleSync} disabled={isSyncing}>
                {isSyncing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Synkar…
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Synka nu
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
              >
                {isDisconnecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Kopplar bort…
                  </>
                ) : (
                  <>
                    <Unplug className="mr-2 h-4 w-4" />
                    Koppla bort
                  </>
                )}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Koppla ditt Google-konto för att ladda upp säkerhetsbackupen till din egen
              Drive. gnubok får bara tillgång till filer som appen själv skapar (scope
              <span className="font-mono text-xs"> drive.file</span>).
            </p>
            <Button onClick={handleConnect} disabled={isConnecting}>
              {isConnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Omdirigerar…
                </>
              ) : (
                <>
                  <Cloud className="mr-2 h-4 w-4" />
                  Koppla Google Drive
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
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
