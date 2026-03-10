'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { PROVIDERS } from '@/lib/connections/providers'
import { ProviderCard } from './ProviderCard'
import { ConnectProviderDialog } from './ConnectProviderDialog'
import { SyncDataDialog } from './SyncDataDialog'
import { SyncResultsDialog } from './SyncResultsDialog'
import type { AccountingProvider, ProviderConnection, FortnoxSyncResult } from '@/types'

export function ProviderConnectionsSettings() {
  const { toast } = useToast()
  const [connections, setConnections] = useState<ProviderConnection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [connectingProvider, setConnectingProvider] = useState<AccountingProvider | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [syncingConnectionId, setSyncingConnectionId] = useState<string | null>(null)
  const [connectDialogOpen, setConnectDialogOpen] = useState(false)
  const [syncDataDialogOpen, setSyncDataDialogOpen] = useState(false)
  const [syncDataConnectionId, setSyncDataConnectionId] = useState<string | null>(null)
  const [isSyncingData, setIsSyncingData] = useState(false)
  const [syncResult, setSyncResult] = useState<FortnoxSyncResult | null>(null)
  const [syncResultsOpen, setSyncResultsOpen] = useState(false)

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch('/api/connections')
      if (res.ok) {
        const { data } = await res.json()
        setConnections(data || [])
      }
    } catch {
      // Ignore
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConnections()
  }, [fetchConnections])

  function getConnection(providerId: string): ProviderConnection | null {
    return connections.find((c) => c.provider === providerId) ?? null
  }

  async function handleConnect(providerId: AccountingProvider) {
    const provider = PROVIDERS.find((p) => p.id === providerId)
    if (!provider) return

    if (provider.authStrategy === 'oauth2') {
      // OAuth flow — initiate and redirect
      setConnectingProvider(providerId)
      setIsConnecting(true)
      try {
        const res = await fetch('/api/connections/oauth/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: providerId }),
        })
        const result = await res.json()
        if (!res.ok) {
          toast({
            title: 'Anslutning misslyckades',
            description: result.error,
            variant: 'destructive',
          })
          return
        }
        // Redirect to provider
        window.location.href = result.data.authUrl
      } catch {
        toast({
          title: 'Fel',
          description: 'Kunde inte starta anslutningsprocessen',
          variant: 'destructive',
        })
      } finally {
        setIsConnecting(false)
        setConnectingProvider(null)
      }
    } else {
      // Non-OAuth — open dialog
      setConnectingProvider(providerId)
      setConnectDialogOpen(true)
    }
  }

  async function handleConnectSubmit(data: Record<string, string>) {
    if (!connectingProvider) return

    setIsConnecting(true)
    try {
      const body = { provider: connectingProvider, ...data }
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await res.json()

      if (!res.ok) {
        toast({
          title: 'Anslutning misslyckades',
          description: result.error,
          variant: 'destructive',
        })
        return
      }

      toast({
        title: 'Ansluten!',
        description: `${PROVIDERS.find((p) => p.id === connectingProvider)?.name} är nu kopplad.`,
      })
      setConnectDialogOpen(false)
      fetchConnections()
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte ansluta',
        variant: 'destructive',
      })
    } finally {
      setIsConnecting(false)
    }
  }

  async function handleDisconnect(connectionId: string) {
    try {
      const res = await fetch(`/api/connections/${connectionId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        toast({ title: 'Frånkopplad', description: 'Anslutningen har tagits bort.' })
        fetchConnections()
      } else {
        const result = await res.json()
        toast({
          title: 'Fel',
          description: result.error || 'Kunde inte koppla bort',
          variant: 'destructive',
        })
      }
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte koppla bort',
        variant: 'destructive',
      })
    }
  }

  async function handleSync(connectionId: string) {
    setSyncingConnectionId(connectionId)
    try {
      const res = await fetch(`/api/connections/${connectionId}/sync`, {
        method: 'POST',
      })
      if (res.ok) {
        toast({ title: 'Synkroniserad', description: 'Anslutningen har uppdaterats.' })
        fetchConnections()
      } else {
        const result = await res.json()
        toast({
          title: 'Synkronisering misslyckades',
          description: result.error,
          variant: 'destructive',
        })
      }
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte synkronisera',
        variant: 'destructive',
      })
    } finally {
      setSyncingConnectionId(null)
    }
  }

  function handleSyncData(connectionId: string) {
    setSyncDataConnectionId(connectionId)
    setSyncDataDialogOpen(true)
  }

  async function handleSyncDataSubmit(dataTypeIds: string[], financialYear?: number) {
    if (!syncDataConnectionId) return

    setIsSyncingData(true)
    try {
      const res = await fetch(`/api/connections/${syncDataConnectionId}/sync-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataTypeIds, financialYear }),
      })
      const result = await res.json()

      setSyncDataDialogOpen(false)

      if (res.ok && result.data) {
        setSyncResult(result.data)
        setSyncResultsOpen(true)
        fetchConnections()
      } else {
        toast({
          title: 'Datahämtning misslyckades',
          description: result.error || 'Okänt fel',
          variant: 'destructive',
        })
      }
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta data',
        variant: 'destructive',
      })
    } finally {
      setIsSyncingData(false)
    }
  }

  async function handleExpandScopes() {
    if (!syncDataConnectionId) return

    try {
      const res = await fetch(`/api/connections/${syncDataConnectionId}/expand-scopes`, {
        method: 'POST',
      })
      const result = await res.json()

      if (res.ok && result.data?.authUrl) {
        window.location.href = result.data.authUrl
      } else {
        toast({
          title: 'Fel',
          description: result.error || 'Kunde inte utöka behörigheter',
          variant: 'destructive',
        })
      }
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte utöka behörigheter',
        variant: 'destructive',
      })
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Kopplingar till bokföringssystem</CardTitle>
          <CardDescription>
            Anslut ditt befintliga bokföringssystem för att importera data till gnubok.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {PROVIDERS.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              connection={getConnection(provider.id)}
              isConnecting={isConnecting && connectingProvider === provider.id}
              isSyncing={syncingConnectionId === getConnection(provider.id)?.id}
              disabled={provider.id !== 'fortnox'}
              onConnect={() => handleConnect(provider.id)}
              onDisconnect={() => {
                const conn = getConnection(provider.id)
                if (conn) handleDisconnect(conn.id)
              }}
              onSync={() => {
                const conn = getConnection(provider.id)
                if (conn) handleSync(conn.id)
              }}
              onSyncData={() => {
                const conn = getConnection(provider.id)
                if (conn) handleSyncData(conn.id)
              }}
            />
          ))}
        </CardContent>
      </Card>

      <ConnectProviderDialog
        open={connectDialogOpen}
        onOpenChange={setConnectDialogOpen}
        provider={connectingProvider}
        onSubmit={handleConnectSubmit}
        isLoading={isConnecting}
      />

      <SyncDataDialog
        open={syncDataDialogOpen}
        onOpenChange={setSyncDataDialogOpen}
        connectionId={syncDataConnectionId}
        onSubmit={handleSyncDataSubmit}
        isLoading={isSyncingData}
      />

      <SyncResultsDialog
        open={syncResultsOpen}
        onOpenChange={setSyncResultsOpen}
        result={syncResult}
      />
    </>
  )
}
