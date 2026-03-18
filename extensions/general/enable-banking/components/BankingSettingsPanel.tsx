'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { DestructiveConfirmDialog, useDestructiveConfirm } from '@/components/ui/destructive-confirm-dialog'
import { Loader2, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BankSelector, type Bank } from './BankSelector'
import { BankConnectionStatus } from './BankConnectionStatus'
import type { BankConnection } from '@/types'

/**
 * Self-contained banking settings panel for the enable-banking extension.
 * Loaded dynamically by the settings panel registry.
 */
export default function BankingSettingsPanel() {
  const { toast } = useToast()
  const supabase = createClient()

  const { dialogProps, confirm } = useDestructiveConfirm()

  const [bankConnections, setBankConnections] = useState<BankConnection[]>([])
  const [syncingConnectionId, setSyncingConnectionId] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectingBankName, setConnectingBankName] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showCsvFallback, setShowCsvFallback] = useState(false)

  useEffect(() => {
    fetchConnections()
  }, [])

  async function fetchConnections() {
    setIsLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: connections } = await supabase
      .from('bank_connections')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    setBankConnections(connections || [])
    setIsLoading(false)
  }

  async function handleConnectBank(bank: Bank) {
    setIsConnecting(true)
    setConnectingBankName(bank.name)

    try {
      const response = await fetch('/api/extensions/ext/enable-banking/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aspsp_name: bank.name, aspsp_country: bank.country }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error)
      }

      window.location.href = data.authorization_url
    } catch (error) {
      toast({
        title: 'Fel',
        description: error instanceof Error ? error.message : 'Kunde inte ansluta bank',
        variant: 'destructive',
      })
      setIsConnecting(false)
      setConnectingBankName(null)
      setShowCsvFallback(true)
    }
  }

  async function handleSyncTransactions(connectionId: string) {
    setSyncingConnectionId(connectionId)

    try {
      const response = await fetch('/api/extensions/ext/enable-banking/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connectionId }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error)
      }

      toast({
        title: 'Synkronisering klar',
        description: `${data.imported} nya transaktioner importerade`,
      })

      setShowCsvFallback(false)
      fetchConnections()
    } catch (error) {
      toast({
        title: 'Fel',
        description: error instanceof Error ? error.message : 'Synkronisering misslyckades',
        variant: 'destructive',
      })
      setShowCsvFallback(true)
    }

    setSyncingConnectionId(null)
  }

  async function handleDisconnectBank(connectionId: string) {
    const ok = await confirm({
      title: 'Koppla bort bank?',
      description: 'PSD2-samtycket kommer återkallas. Befintliga transaktioner påverkas inte.',
      confirmLabel: 'Koppla bort',
      variant: 'warning',
    })
    if (!ok) return

    try {
      const response = await fetch('/api/extensions/ext/enable-banking/disconnect', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connectionId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Disconnect failed')
      }

      toast({
        title: 'Bank bortkopplad',
        description: 'Bankanslutningen och PSD2-samtycket har återkallats',
      })
      fetchConnections()
    } catch (error) {
      toast({
        title: 'Fel',
        description: error instanceof Error ? error.message : 'Kunde inte koppla bort bank',
        variant: 'destructive',
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const activeConnections = bankConnections.filter((c) => c.status === 'active')
  const actionRequiredConnections = bankConnections.filter((c) => ['expired', 'error'].includes(c.status))

  return (
    <div className="space-y-6">
      <DestructiveConfirmDialog {...dialogProps} />

      {/* Persistent CSV fallback after connection/sync failure */}
      {showCsvFallback && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-4">
          <Upload className="h-5 w-5 shrink-0 text-muted-foreground" />
          <p className="flex-1 text-sm text-muted-foreground">
            Har du problem med bankanslutningen? Du kan importera transaktioner manuellt via bankfil.
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link href="/import?mode=bank">Importera bankfil</Link>
          </Button>
        </div>
      )}

      {/* Action required — expired/error connections */}
      {actionRequiredConnections.length > 0 && (
        <Card className="border-warning/30">
          <CardHeader>
            <CardTitle>Åtgärd krävs</CardTitle>
            <CardDescription>
              Dessa anslutningar behöver uppmärksamhet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {actionRequiredConnections.map((connection) => (
              <BankConnectionStatus
                key={connection.id}
                connection={connection}
                onSync={handleSyncTransactions}
                onDisconnect={handleDisconnectBank}
                onReconnect={handleConnectBank}
                isSyncing={syncingConnectionId === connection.id}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Connected banks */}
      {activeConnections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Anslutna banker</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeConnections.map((connection) => (
              <BankConnectionStatus
                key={connection.id}
                connection={connection}
                onSync={handleSyncTransactions}
                onDisconnect={handleDisconnectBank}
                isSyncing={syncingConnectionId === connection.id}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Connect new bank */}
      <Card>
        <CardHeader>
          <CardTitle>Anslut ny bank</CardTitle>
          <CardDescription>
            Välj din bank nedan för att koppla ditt konto via PSD2.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BankSelector
            onConnect={handleConnectBank}
            isConnecting={isConnecting}
            connectingBankName={connectingBankName}
          />
        </CardContent>
      </Card>

      {/* Info about PSD2 */}
      <Card>
        <CardHeader>
          <CardTitle>Om bankintegration (PSD2)</CardTitle>
          <CardDescription>
            Automatisk import av transaktioner via PSD2 open banking.
            Samtycket gäller i 90 dagar och behöver sedan förnyas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Vi använder säker bankintegration (PSD2). Vi kan endast läsa transaktioner,
            aldrig flytta pengar. Du kan också importera transaktioner manuellt via
            bankfiler på importsidan.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
